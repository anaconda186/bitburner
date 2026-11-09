// The decision core (seam A): a plain snapshot in, plain actions out. No `ns`
// here, ever: the conductor builds the snapshot and carries out the actions.
//
// RAM: the conductor imports this file, so every identifier in it (and in
// what it imports) that is named like an NS function is charged to the
// conductor. Don't name things `run`, `kill`, `scan`, `share`, `hack`, or
// `probe` (that is dnet.probe, 0.2 GB, which is why a ProbeLaunch calls its
// probe `name`). `npm run ram-check` prices the real thing.
import { backoffMs } from "./backoff.ts";
import { CASINO_CAP, CASINO_HOST_RAM_GB, capReached, readCasinoNews } from "./blackjack.ts";
import type { Json, Reply, WorkerReport } from "./helper-contract.ts";
import {
  CALLS, PROBES, WORKERS, type HelperScript, type ProbeName, type ProbeSpec, type ProbeValues, type WorkerName, type WorkerSpec,
} from "./helpers.ts";
import { nextDriverJob, readDriverNews, readDriverOrder, type City, type DriverOrder } from "./driver-jobs.ts";
import { fleetWant } from "./fleet.ts";
import { cloudServerCost, NEUTRAL_MULTS, type NodeMults } from "./formulas.ts";
import { ORDERS_OFF, readOrders, readOutlook, SPLIT_OFF, type EngineOrders, type RamSplit } from "./money-engine.ts";
import { ramSplit, SPLIT_TUNABLES, type ResetPoint, type SplitTunables } from "./ram-split.ts";
import { nodeMults } from "./node-mults.ts";

/** The latest reply of one probe and when the conductor read it. */
export type ProbeReading<T> = Reply<T> & { readonly atMs: number };

/** What the conductor read from the game this iteration. */
export type Snapshot = {
  /** Wall-clock time the snapshot was taken (`Date.now()`). */
  readonly nowMs: number;
  /**
   * The run's category, from the state file (#56: the casino plays only in
   * Open). Absent in fixtures that don't care, which reads as not Open.
   */
  readonly category?: string;
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
  /**
   * Cloud servers this conductor bought (CALLS.buyServer replies), so one
   * bought after the network probe's last scan counts as there. Absent: none.
   */
  readonly boughtServers?: readonly string[];
  /**
   * When this conductor first saw the fleet bought (`fleetBought`, #58): the
   * exp start runs from then. Absent: not yet, since this conductor started.
   */
  readonly fleetBoughtAtMs?: number;
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

/**
 * An action before it has a server: what the sub-deciders produce. A worker
 * start may name its server (the casino on home), over WorkerSpec.host.
 */
export type Want =
  | Omit<ProbeLaunch, "host">
  | Omit<HelperCall, "host">
  | (Omit<WorkerStart, "host"> & { readonly host?: string })
  | WorkerControl;

export function decide(snapshot: Snapshot): readonly Action[] {
  // "Wait" (spec #41 story 53): while the casino plays, the conductor stays
  // up and idle. Its one action is turning the money engine off (an empty
  // port reads as off, so after the casino's reloads there is none).
  if (casinoRunning(snapshot)) return place(snapshot, engineWants(snapshot));
  const casino = casinoStage(snapshot);
  const wants: Want[] = driverWants(snapshot, casino);
  wants.push(...casinoWants(snapshot, casino));
  wants.push(...staleProbes(snapshot).map((name): Want => ({ kind: "probe", name })));
  const rooting = rootWant(snapshot);
  if (rooting !== undefined) wants.push(rooting);
  // The fleet buys nothing while the casino is still to come: its server and
  // stake come first (spec #41 BN1.1 plan: casino, then programs and fleet).
  if (!casinoWanted(casino)) {
    const purchase = fleetWant(snapshot, engineOrders(snapshot), driverWanted(snapshot) ? [DRIVER_HOST] : []);
    if (purchase !== undefined) wants.push(purchase);
  }
  wants.push(...engineWants(snapshot));
  if (traderWanted(snapshot) && startDue(snapshot.workers.trader, snapshot.nowMs)) {
    wants.push({ kind: "start", worker: "trader", arg: null });
  }
  return place(snapshot, wants);
}

/** The driver's cloud server (WORKERS.driver.host) and the RAM it is bought with. */
export const DRIVER_HOST = WORKERS.driver.host;
export const DRIVER_HOST_RAM_GB = 32;
const BUY_SCRIPT = CALLS.buyServer as HelperScript;
/** How long after a failed purchase to try again. */
export const BUY_RETRY_MS = 10_000;

/** BN1.1 runs on UI automation (spec #41): the driver is wanted there and nowhere else. */
export function driverWanted(s: Snapshot): boolean {
  const route = s.probes.route;
  return route?.ok === true && route.value.currentNode === 1 && (route.value.ownedSF[1] ?? 0) === 0;
}

/**
 * Whether a server exists, as far as the conductor can tell: the network
 * probe found it, or this conductor bought it since. Undefined until the
 * network probe has read.
 */
function hostKnown(s: Snapshot, host: string): boolean | undefined {
  const network = s.probes.network;
  if (network?.ok !== true) return undefined;
  return network.value.hosts.includes(host) || (s.boughtServers ?? []).includes(host);
}

/**
 * The driver (#54): in BN1.1 its 32 GB cloud server is bought as soon as the
 * money is there (the stats probe's reading), then the driver is started on
 * it, before anything else is placed, and handed its jobs one at a time.
 */
function driverWants(s: Snapshot, casino: CasinoStage): Want[] {
  if (!driverWanted(s)) return [];
  const exists = hostKnown(s, DRIVER_HOST);
  if (exists === undefined) return [];
  if (!exists) {
    const stats = s.probes.stats;
    if (stats?.ok !== true || stats.value.money < cloudServerCost(DRIVER_HOST_RAM_GB, NEUTRAL_MULTS) || buyRetrying(s)) return [];
    return [{ kind: "call", script: BUY_SCRIPT, arg: { host: DRIVER_HOST, ram: DRIVER_HOST_RAM_GB } }];
  }
  const driver = s.workers.driver;
  if (startDue(driver, s.nowMs)) return [{ kind: "start", worker: "driver", arg: { control: WORKERS.driver.control } }];
  const news = driver?.running === true ? readDriverNews(driver.report?.value) : undefined;
  if (news === undefined) return [];
  // One job at a time: the order on the port is in hand until the driver
  // reports its seq done. A driver started again redoes it (jobs check the
  // game first, so a done one changes nothing).
  const order = readDriverOrder(s.controls.driver);
  if (order !== undefined && order.seq > news.done) return [];
  const job = nextDriverJob(news, wantedCity(s));
  if (job === undefined) return [];
  // While the casino is still to come, its server and stake come before the
  // port openers after BruteSSH (spec #41 BN1.1 plan: TOR, BruteSSH, casino,
  // then the programs).
  if (casinoWanted(casino) && job.kind === "buy" && !job.programs.every((p) => p === "BruteSSH.exe")) return [];
  const message: DriverOrder = { seq: Math.max(order?.seq ?? 0, news.done) + 1, job };
  return [{ kind: "control", worker: "driver", message }];
}

/** A cloud server purchase failed under BUY_RETRY_MS ago: wait before the next. */
function buyRetrying(s: Snapshot): boolean {
  const last = s.lastCall;
  return last?.script === BUY_SCRIPT && !last.reply.ok && s.nowMs - last.atMs < BUY_RETRY_MS;
}

/** The BitNode multipliers the run prices things with (the engine's orders carry the same). */
function runMults(s: Snapshot): NodeMults {
  const route = s.probes.route;
  if (route?.ok !== true) return NEUTRAL_MULTS;
  const reading = s.probes.bitnode;
  return nodeMults(route.value, reading?.ok ? reading.value : undefined);
}

/**
 * Where the plan wants the player (the driver travels there), or null for
 * anywhere: Aevum while the casino is pending (#56). The city factions (#59)
 * add theirs.
 */
export function wantedCity(s: Snapshot): City | null {
  return casinoStage(s) === "pending" ? CASINO_CITY : null;
}

/** The casino is alive (its own pid, or the one in its report), whoever started it. */
export function casinoRunning(s: Snapshot): boolean {
  return s.workers.casino?.running === true;
}

/**
 * The casino's tunables (spec #41 "Tunables": the casino skip threshold).
 * Move them into the global table when one exists.
 */
export const CASINO_TUNABLES = {
  /**
   * How long the casino takes to the $10b cap, in seconds. The skip
   * threshold follows from it (CASINO_CAP / durationS: $27.8m/s at 360 s).
   * Measured by #55 (v3.0.1, headless Chromium, lab saves, from a few $m):
   * 371 s (187 reloads), 352 s (110), 346 s (120) and 316 s (143); reloads
   * dominate, about 1.7 s each from navigation to the first hand. The spec's
   * model said 3.5 min ($48m/s). Real save sizes make reloads slower still.
   */
  durationS: 360,
  /**
   * Money to bet with, beyond the price of the casino's server: the host is
   * bought only once this is left over, so the casino never starts broke
   * (the engine is off while it plays). Modelled, not measured.
   */
  stakeMin: 100_000,
} as const;

export type CasinoTunables = { readonly [K in keyof typeof CASINO_TUNABLES]: number };

/** Income at which the casino is skipped: what reaches its $10b as soon as it would. */
export function casinoSkipThresholdPerSec(t: CasinoTunables = CASINO_TUNABLES): number {
  return CASINO_CAP / t.durationS;
}

/** Home RAM from which the casino runs on home rather than its cloud server (spec #41 story 54). */
export const CASINO_HOME_RAM_GB = 128;
/** The casino's cloud server (WORKERS.casino.host), bought at CASINO_HOST_RAM_GB. */
export const CASINO_HOST = WORKERS.casino.host;
const CASINO_CITY: City = "Aevum";

/**
 * Where the casino stands this install:
 *   - `running`: alive. decide waits.
 *   - `off`: not played here: no route yet, not Open, BN8 or BN9 (their
 *     plans decide), or outside BN1.1 with the player away from Aevum (only
 *     BN1.1's driver travels so far; Singularity travel is a later ticket).
 *   - `unknown`: played here, but nothing has said yet what it has paid
 *     since the install (no report, no stats reading).
 *   - `done`: the cap is reached since the install.
 *   - `skipped`: the engine's modelled income beats it (the skip rule).
 *   - `pending`: wanted and not running: travel, its host, then the start.
 */
export type CasinoStage = "running" | "off" | "unknown" | "done" | "skipped" | "pending";

export function casinoStage(s: Snapshot, t: CasinoTunables = CASINO_TUNABLES): CasinoStage {
  if (casinoRunning(s)) return "running";
  const route = s.probes.route;
  if (s.category !== "open" || route?.ok !== true) return "off";
  if (route.value.currentNode === 8 || route.value.currentNode === 9) return "off";
  if (!driverWanted(s) && playerFacts(s)?.city !== CASINO_CITY) return "off";
  const news = readCasinoNews(s.workers.casino?.report?.value);
  const stats = s.probes.stats;
  const paid = [news?.winnings, stats?.ok === true ? stats.value.casinoWinnings : undefined].filter((w) => w !== undefined);
  if (paid.length === 0) return "unknown";
  if (news?.phase === "capped" || capReached(Math.max(...paid))) return "done";
  return engineIncomePerSec(s) >= casinoSkipThresholdPerSec(t) ? "skipped" : "pending";
}

/** The casino is wanted this install: the rest of the run leaves its money and its room alone. */
function casinoWanted(stage: CasinoStage): boolean {
  return stage === "unknown" || stage === "pending" || stage === "running";
}

/** The engine's modelled income on its RAM now (its outlook), 0 while it has none. */
function engineIncomePerSec(s: Snapshot): number {
  const report = s.workers.engine?.report?.value;
  const outlook = typeof report === "object" && report !== null ? readOutlook((report as { outlook?: unknown }).outlook) : undefined;
  return outlook?.incomePerSec ?? 0;
}

/**
 * The player's money and city: the driver's news when it is running (it
 * reads them every second), else the stats probe's latest reading.
 */
function playerFacts(s: Snapshot): { readonly money: number; readonly city: string } | undefined {
  const driver = s.workers.driver;
  const news = driver?.running === true ? readDriverNews(driver.report?.value) : undefined;
  if (news !== undefined) return news.facts;
  const stats = s.probes.stats;
  return stats?.ok === true ? stats.value : undefined;
}

/** Where the casino goes: home once home has CASINO_HOME_RAM_GB, else its cloud server. */
export function casinoHost(s: Snapshot): string {
  const stats = s.probes.stats;
  return stats?.ok === true && stats.value.homeRam >= CASINO_HOME_RAM_GB ? "home" : CASINO_HOST;
}

/** The driver has an order in hand (BN1.1): the casino, which drives the page too, waits for it. */
function driverBusy(s: Snapshot): boolean {
  const driver = s.workers.driver;
  const news = driver?.running === true ? readDriverNews(driver.report?.value) : undefined;
  const order = readDriverOrder(s.controls.driver);
  return news !== undefined && order !== undefined && order.seq > news.done;
}

/**
 * The casino while it is pending (#56): its 64 GB cloud server bought once
 * its price and a stake are in hand (unless it goes on home), then, with the
 * player in Aevum and the driver idle, the casino started there with the
 * run's category. A crashed or missing casino is started again with the
 * worker backoff.
 */
function casinoWants(s: Snapshot, stage: CasinoStage): Want[] {
  if (stage !== "pending") return [];
  const host = casinoHost(s);
  if (host !== "home") {
    const exists = hostKnown(s, host);
    if (exists === undefined) return [];
    if (!exists) {
      const money = playerFacts(s)?.money ?? 0;
      const price = cloudServerCost(CASINO_HOST_RAM_GB, runMults(s)) + CASINO_TUNABLES.stakeMin;
      if (money < price || buyRetrying(s)) return [];
      return [{ kind: "call", script: BUY_SCRIPT, arg: { host, ram: CASINO_HOST_RAM_GB } }];
    }
  }
  if (playerFacts(s)?.city !== CASINO_CITY || driverBusy(s) || !startDue(s.workers.casino, s.nowMs)) return [];
  return [{ kind: "start", worker: "casino", arg: { category: "open" }, host }];
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
 * still fit there: the dearest one that may run now. Plus the casino's room
 * while the casino is wanted on home (#56).
 */
export function homeReserveGb(s: Snapshot): number {
  const scripts: HelperScript[] = Object.values(CALLS);
  for (const spec of Object.values(PROBES) as ProbeSpec[]) {
    if (spec.onlyIf === undefined || spec.onlyIf(s.probes)) scripts.push(spec.script);
  }
  const helpersGb = Math.max(0, ...scripts.map((script) => s.helperRamGb[script] ?? 0));
  const casino = casinoRoom(s);
  return helpersGb + (casino?.host === "home" ? casino.gb : 0);
}

/**
 * The casino's room while it is wanted (#56): its host and RAM, which the
 * engine never fills and the fleet never buys. A static reserve, like the
 * driver's, so a casino that crashed finds its room still free.
 */
function casinoRoom(s: Snapshot): { readonly host: string; readonly gb: number } | undefined {
  const gb = s.helperRamGb[WORKERS.casino.script] ?? 0;
  return gb > 0 && casinoWanted(casinoStage(s)) ? { host: casinoHost(s), gb } : undefined;
}

/**
 * Where the run is in the reset, for the RAM split (#58): off until the route
 * probe has said where the run is, off in BN8, where hacking earns no money
 * (its exp-only engine, story 104, is for the BN8 tickets to switch on: the
 * engine's jobs would take the trader's room), and off while the casino runs
 * (#56, story 53: its in-flight jobs still land); the exp start for
 * `expStartMs` after the fleet is bought; otherwise saving (all money). Hooks:
 * #59/#61/#65 the `working` point with the faction's favor, #64 the final
 * `climb`.
 */
export function resetPoint(s: Snapshot, t: SplitTunables = SPLIT_TUNABLES): ResetPoint {
  const route = s.probes.route;
  if (route?.ok !== true) return { kind: "off" };
  if (route.value.currentNode === 8) return { kind: "off" };
  if (casinoRunning(s)) return { kind: "off" };
  if (s.fleetBoughtAtMs !== undefined && s.nowMs - s.fleetBoughtAtMs < t.expStartMs) return { kind: "expStart" };
  return { kind: "saving" };
}

/**
 * The engine's orders (spec #41 "RAM split kinds"): the split for the point
 * in the reset (`ramSplit`), the home reserve and the BitNode multipliers.
 * Off while the casino runs (#56) whatever the split says.
 */
export function engineOrders(s: Snapshot): EngineOrders {
  const route = s.probes.route;
  const split = ramSplit(resetPoint(s));
  if (route?.ok !== true || casinoRunning(s) || sameSplit(split, SPLIT_OFF)) return ORDERS_OFF;
  const orders = { split, homeReserveGb: homeReserveGb(s), mults: runMults(s) };
  // The driver's and the casino's rooms on their cloud servers stay free for
  // them (static reserves, so one that died finds its room still there).
  const reserves: Record<string, number> = {};
  const driverGb = s.helperRamGb[WORKERS.driver.script] ?? 0;
  if (driverWanted(s) && driverGb > 0) reserves[DRIVER_HOST] = driverGb;
  const casino = casinoRoom(s);
  if (casino !== undefined && casino.host !== "home") reserves[casino.host] = casino.gb;
  return Object.keys(reserves).length > 0 ? { ...orders, hostReserveGb: reserves } : orders;
}

const sameMults = (a: NodeMults, b: NodeMults): boolean =>
  (Object.keys(a) as (keyof NodeMults)[]).every((k) => a[k] === b[k]);

const sameReserves = (a: EngineOrders["hostReserveGb"] = {}, b: EngineOrders["hostReserveGb"] = {}): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([h, gb]) => b[h] === gb);

const sameSplit = (a: RamSplit, b: RamSplit): boolean => a.money === b.money && a.exp === b.exp && a.sharing === b.sharing;

const sameOrders = (a: EngineOrders, b: EngineOrders): boolean =>
  a.homeReserveGb === b.homeReserveGb &&
  sameReserves(a.hostReserveGb, b.hostReserveGb) &&
  sameSplit(a.split, b.split) &&
  sameMults(a.mults, b.mults);

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
    const pinned = want.kind === "start" ? (want.host ?? spec?.host) : undefined;
    const host =
      pinned !== undefined
        ? (free[pinned] ?? 0) + RAM_EPSILON >= cost ? pinned : undefined
        : pickHost(free, cost, spec?.homeHeadroom === true ? homeReserveGb(snapshot) : 0);
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
    if (reading === undefined || s.nowMs - reading.atMs >= spec.maxAgeMs) return true;
    // Read again at once after an action helper that changes what it reads.
    const last = s.lastCall;
    return last !== undefined && spec.afterCalls?.includes(last.script) === true && last.atMs >= reading.atMs;
  });
}
