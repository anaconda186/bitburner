// The decision core (seam A): a plain snapshot in, plain actions out. No `ns`
// here, ever: the conductor builds the snapshot and carries out the actions.
//
// RAM: the conductor imports this file, so every identifier in it (and in
// what it imports) that is named like an NS function is charged to the
// conductor. Don't name things `run`, `kill`, `scan`, `share`, `hack`, or
// `probe` (that is dnet.probe, 0.2 GB, which is why a ProbeLaunch calls its
// probe `name`). `npm run ram-check` prices the real thing.
import type { Json, Reply } from "./helper-contract.ts";
import { PROBES, type HelperScript, type ProbeName, type ProbeValues } from "./helpers.ts";

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
};

/** Launch a probe on `host`; its reply lands in `snapshot.probes` on a later loop. */
export type ProbeLaunch = { readonly kind: "probe"; readonly name: ProbeName; readonly host: string };
/** Launch an action helper on `host` and await its reply before anything else. */
export type HelperCall = { readonly kind: "call"; readonly script: HelperScript; readonly arg: Json; readonly host: string };

/** Something for the conductor to do. */
export type Action = ProbeLaunch | HelperCall;

/** An action before it has a server: what the sub-deciders produce. */
export type Want = Omit<ProbeLaunch, "host"> | Omit<HelperCall, "host">;

export function decide(snapshot: Snapshot): readonly Action[] {
  const wants: Want[] = staleProbes(snapshot).map((name) => ({ kind: "probe", name }));
  return place(snapshot, wants);
}

/** Rounding slack for RAM sums (the game rounds RAM to 0.01 GB). */
const RAM_EPSILON = 1e-9;

/**
 * Decide's last step: gives each wanted helper a server where it fits right
 * now, in order, and drops the ones that fit nowhere (they are wanted again on
 * a later loop). Home comes first; otherwise the server with the most free
 * RAM (ties by name). RAM placed earlier in the same decision counts as used.
 * At most one action helper is placed, and none while one is still running.
 * Helpers whose cost is 0 or unknown are never placed.
 */
export function place(snapshot: Snapshot, wants: readonly Want[]): Action[] {
  const free: Record<string, number> = { ...snapshot.freeRamGb };
  const placed: Action[] = [];
  let callPlaced = snapshot.callRunning;
  for (const want of wants) {
    if (want.kind === "call" && callPlaced) continue;
    const script = want.kind === "probe" ? PROBES[want.name].script : want.script;
    const cost = snapshot.helperRamGb[script] ?? 0;
    if (!(cost > 0)) continue;
    const host = pickHost(free, cost);
    if (host === undefined) continue;
    free[host] = (free[host] ?? 0) - cost;
    placed.push({ ...want, host });
    if (want.kind === "call") callPlaced = true;
  }
  return placed;
}

function pickHost(free: Readonly<Record<string, number>>, cost: number): string | undefined {
  const fits = (h: string) => (free[h] ?? 0) + RAM_EPSILON >= cost;
  if (fits("home")) return "home";
  let best: string | undefined;
  for (const h of Object.keys(free).sort()) {
    if (h === "home" || !fits(h)) continue;
    if (best === undefined || (free[h] ?? 0) > (free[best] ?? 0)) best = h;
  }
  return best;
}

/** Probes with no reading yet, or one older than their maxAgeMs, and none on the way. */
function staleProbes(s: Snapshot): ProbeName[] {
  return (Object.keys(PROBES) as ProbeName[]).filter((name) => {
    if (s.probesInFlight.includes(name)) return false;
    const reading = s.probes[name];
    return reading === undefined || s.nowMs - reading.atMs >= PROBES[name].maxAgeMs;
  });
}
