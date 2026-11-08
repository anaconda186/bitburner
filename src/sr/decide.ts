// The decision core (seam A): a plain snapshot in, plain actions out. No `ns`
// here, ever: the conductor builds the snapshot and carries out the actions.
//
// RAM: the conductor imports this file, so every identifier in it (and in
// what it imports) that is named like an NS function is charged to the
// conductor. Don't name things `run`, `kill`, `scan`, `share`, `hack`, or
// `probe` (that is dnet.probe, 0.2 GB, which is why a ProbeLaunch calls its
// probe `name`). `npm run ram-check` prices the real thing.
import { backoffMs } from "./backoff.ts";
import type { Json, Reply, WorkerReport } from "./helper-contract.ts";
import {
  CALLS, PROBES, WORKERS, type HelperScript, type ProbeName, type ProbeSpec, type ProbeValues, type WorkerName, type WorkerSpec,
} from "./helpers.ts";
import { ORDERS_OFF, readOrders, SPLIT_MONEY, type EngineOrders } from "./money-engine.ts";

/** The latest reply of one probe and when the conductor read it. */
export type ProbeReading<T> = Reply<T> & { readonly atMs: number };

/** What the conductor read from the game this iteration. */
export type Snapshot = {
  /** Wall-clock time the snapshot was taken (`Date.now()`). */
  readonly nowMs: number;
  /**
   * Free RAM right now (GB, max minus used) on every server a helper can be
   * launched on: home, plus every server the network probe found that we
   * hold root on now. Its keys are exactly the rooted servers.
   */
  readonly freeRamGb: Readonly<Record<string, number>>;
  /**
   * Each registered helper's current RAM cost (GB, `getScriptRam` on home,
   * which follows the SF4 level). 0 or missing means it can't be launched.
   */
  readonly helperRamGb: Readonly<Partial<Record<HelperScript, number>>>;
  /** The latest reading of each probe; absent until its first reply lands. */
  readonly probes: { readonly [P in ProbeName]?: ProbeReading<ProbeValues[P]> };
  /** Probes launched whose reply hasn't landed yet. */
  readonly probesInFlight: readonly ProbeName[];
  /** An action helper is still alive, so no other may start. */
  readonly callRunning: boolean;
  /** The last action helper the conductor carried out, and how it went. */
  readonly lastCall?: { readonly script: HelperScript; readonly arg: Json; readonly atMs: number; readonly reply: Reply };
  /**
   * Each long-lived worker this conductor knows of. Absent means none has run
   * since this conductor started (after a reload, nothing has).
   */
  readonly workers: { readonly [W in WorkerName]?: WorkerView };
  /** What is on each worker's control port now; absent when it is empty. */
  readonly controls: { readonly [W in WorkerName]?: Json };
};

/** A long-lived worker as the conductor sees it. */
export type WorkerView = {
  /** Its process is alive, whoever started it. */
  readonly running: boolean;
  /** Launches in a row that failed or died young; 0 once one has run a while. */
  readonly failures: number;
  /** When the last of those failures was seen. */
  readonly lastFailAtMs?: number;
  /** The latest report on its status port. */
  readonly report?: WorkerReport;
};

/** Launch a probe on `host`; its reply lands in `snapshot.probes` on a later loop. */
export type ProbeLaunch = { readonly kind: "probe"; readonly name: ProbeName; readonly host: string };
/** Launch an action helper on `host` and await its reply before anything else. */
export type HelperCall = { readonly kind: "call"; readonly script: HelperScript; readonly arg: Json; readonly host: string };
/** Launch a long-lived worker on `host` and leave it running. */
export type WorkerStart = { readonly kind: "start"; readonly worker: WorkerName; readonly arg: Json; readonly host: string };

/** Replace what is on a worker's control port (WorkerSpec.control) with `message`. Needs no RAM. */
export type WorkerControl = { readonly kind: "control"; readonly worker: WorkerName; readonly message: Json };

/** Something for the conductor to do. */
export type Action = ProbeLaunch | HelperCall | WorkerStart | WorkerControl;

/** An action before it has a server: what the sub-deciders produce. */
export type Want = Omit<ProbeLaunch, "host"> | Omit<HelperCall, "host"> | Omit<WorkerStart, "host"> | WorkerControl;

export function decide(snapshot: Snapshot): readonly Action[] {
  const wants: Want[] = staleProbes(snapshot).map((name) => ({ kind: "probe", name }));
  const rooting = rootWant(snapshot);
  if (rooting !== undefined) wants.push(rooting);
  wants.push(...engineWants(snapshot));
  if (traderWanted(snapshot) && startDue(snapshot.workers.trader, snapshot.nowMs)) {
    wants.push({ kind: "start", worker: "trader", arg: null });
  }
  return place(snapshot, wants);
}

const ROOT_SCRIPT = CALLS.root as HelperScript;
/** How often to try rooting the servers that aren't rooted yet (programs and levels come in over time). */
export const ROOT_EVERY_MS = 10_000;

/**
 * Root what can be rooted: every server the network probe found that isn't
 * rooted now (freeRamGb's keys are the rooted ones) goes to the root helper,
 * which opens what ports it can and NUKEs. Tried again every ROOT_EVERY_MS.
 */
function rootWant(s: Snapshot): Want | undefined {
  const network = s.probes.network;
  if (network?.ok !== true) return undefined;
  const hosts = network.value.hosts.filter((h) => !(h in s.freeRamGb)).sort();
  if (hosts.length === 0) return undefined;
  const last = s.lastCall;
  if (last?.script === ROOT_SCRIPT && s.nowMs - last.atMs < ROOT_EVERY_MS) return undefined;
  return { kind: "call", script: ROOT_SCRIPT, arg: { hosts } };
}

/**
 * RAM on home that the money engine leaves free, so probes and action helpers
 * still fit there: the dearest one that may run now.
 */
export function homeReserveGb(s: Snapshot): number {
  const scripts: HelperScript[] = Object.values(CALLS);
  for (const spec of Object.values(PROBES) as ProbeSpec[]) {
    if (spec.onlyIf === undefined || spec.onlyIf(s.probes)) scripts.push(spec.script);
  }
  return Math.max(0, ...scripts.map((script) => s.helperRamGb[script] ?? 0));
}

/**
 * The engine's orders (spec #41 "RAM split kinds"): all money, except in BN8,
 * where hacking earns no money (its exp farm is a later ticket), so off. Off
 * as well until the route probe has said where the run is.
 */
export function engineOrders(s: Snapshot): EngineOrders {
  const route = s.probes.route;
  if (route?.ok !== true || route.value.currentNode === 8) return ORDERS_OFF;
  return { split: SPLIT_MONEY, homeReserveGb: homeReserveGb(s) };
}

const sameOrders = (a: EngineOrders, b: EngineOrders): boolean =>
  a.homeReserveGb === b.homeReserveGb &&
  a.split.money === b.split.money &&
  a.split.exp === b.split.exp &&
  a.split.share === b.split.share;

/**
 * The money engine: its orders go on its control port whenever the port reads
 * differently (an empty port reads as off), and it is started whenever its
 * split isn't off. Off doesn't stop a running engine; it just launches nothing.
 */
function engineWants(s: Snapshot): Want[] {
  const orders = engineOrders(s);
  const wants: Want[] = [];
  if (!sameOrders(readOrders(s.controls.engine), orders)) {
    wants.push({ kind: "control", worker: "engine", message: orders });
  }
  if (!sameOrders(orders, ORDERS_OFF) && startDue(s.workers.engine, s.nowMs)) {
    wants.push({ kind: "start", worker: "engine", arg: { control: WORKERS.engine.control } });
  }
  return wants;
}

/**
 * The BN8 trader runs whenever the player is in BN8 and holds the TIX API.
 * The BN8 session plan (#73, #74) narrows this at its hooks.
 */
export function traderWanted(s: Snapshot): boolean {
  const route = s.probes.route;
  const market = s.probes.market;
  return route?.ok === true && route.value.currentNode === 8 && market?.ok === true && market.value.hasTixApi;
}

/** A worker should be launched: it isn't running, and any backoff since its last failure is over. */
function startDue(w: WorkerView | undefined, nowMs: number): boolean {
  if (w === undefined) return true;
  if (w.running) return false;
  if (w.failures === 0 || w.lastFailAtMs === undefined) return true;
  return nowMs - w.lastFailAtMs >= backoffMs(w.failures);
}

function scriptOf(want: Exclude<Want, WorkerControl>): HelperScript {
  switch (want.kind) {
    case "probe":
      return PROBES[want.name].script;
    case "call":
      return want.script;
    case "start":
      return WORKERS[want.worker].script;
  }
}

/** Rounding slack for RAM sums (the game rounds RAM to 0.01 GB). */
const RAM_EPSILON = 1e-9;

/**
 * Decide's last step: gives each wanted helper a server where it fits right
 * now, in order, and drops the ones that fit nowhere (they are wanted again on
 * a later loop). Home comes first; otherwise the server with the most free
 * RAM (ties by name). RAM placed earlier in the same decision counts as used.
 * At most one action helper is placed, and none while one is still running.
 * Helpers whose cost is 0 or unknown are never placed. A worker with
 * `homeHeadroom` goes on home only if the home reserve stays free beside it.
 * Actions that need no RAM (a control write) pass through in order.
 */
export function place(snapshot: Snapshot, wants: readonly Want[]): Action[] {
  const free: Record<string, number> = { ...snapshot.freeRamGb };
  const placed: Action[] = [];
  let callPlaced = snapshot.callRunning;
  for (const want of wants) {
    if (want.kind === "control") {
      placed.push(want);
      continue;
    }
    if (want.kind === "call" && callPlaced) continue;
    const script = scriptOf(want);
    const cost = snapshot.helperRamGb[script] ?? 0;
    if (!(cost > 0)) continue;
    const spec: WorkerSpec | undefined = want.kind === "start" ? WORKERS[want.worker] : undefined;
    const host = pickHost(free, cost, spec?.homeHeadroom === true ? homeReserveGb(snapshot) : 0);
    if (host === undefined) continue;
    free[host] = (free[host] ?? 0) - cost;
    placed.push({ ...want, host });
    if (want.kind === "call") callPlaced = true;
  }
  return placed;
}

function pickHost(free: Readonly<Record<string, number>>, cost: number, homeHeadroomGb: number): string | undefined {
  const fits = (h: string) => (free[h] ?? 0) + RAM_EPSILON >= cost + (h === "home" ? homeHeadroomGb : 0);
  if (fits("home")) return "home";
  let best: string | undefined;
  for (const h of Object.keys(free).sort()) {
    if (h === "home" || !fits(h)) continue;
    if (best === undefined || (free[h] ?? 0) > (free[best] ?? 0)) best = h;
  }
  return best;
}

/**
 * Probes with no reading yet, or one older than their maxAgeMs, and none on
 * the way; a probe with `onlyIf` only while that holds.
 */
function staleProbes(s: Snapshot): ProbeName[] {
  return (Object.keys(PROBES) as ProbeName[]).filter((name) => {
    if (s.probesInFlight.includes(name)) return false;
    const spec = PROBES[name];
    if (spec.onlyIf !== undefined && !spec.onlyIf(s.probes)) return false;
    const reading = s.probes[name];
    return reading === undefined || s.nowMs - reading.atMs >= spec.maxAgeMs;
  });
}
