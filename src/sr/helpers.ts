// The helper registry: every helper script the conductor may launch. Pure and
// ns-free. The conductor reads each listed script's RAM cost into the
// snapshot every loop, and `decide` only places a helper whose cost it knows,
// so a helper missing from this file can never run.
//
// Adding a helper: write `src/sr/h/<name>.ts` around `serve` (see
// `h/serve.ts`), give it a row in `tools/ram-budget.ts`, then add it here:
//   - a probe (a read that fills a snapshot field) goes in PROBES, with its
//     value type in ProbeValues and how stale it may get;
//   - an action helper (a call that changes the game) goes in CALLS;
//   - a long-lived worker (it keeps running and reports on its own port)
//     goes in WORKERS.

import type { RouteFacts } from "./order.ts";

/** Where every helper lives on home. */
export type HelperScript = `sr/h/${string}.js`;

/**
 * Copied next to a helper whenever it is launched off home: the runtime every
 * helper imports. Keep it import-free, so this list stays one file.
 */
export const HELPER_RUNTIME: readonly HelperScript[] = ["sr/h/serve.js"];

/** What each probe's reply value looks like. Add a field per new probe. */
export interface ProbeValues {
  /**
   * Every server reachable from home, home included. Root is not in here: the
   * conductor checks it live, so a server rooted after the last reading
   * counts at once, even when home is too full for this probe to run again.
   */
  network: { readonly hosts: readonly string[] };
  /** The current BitNode and the owned Source-Files (#48): where the run is in the BitNode order. */
  route: RouteFacts;
  /** Whether the TIX API, which every stock call needs, is owned (#72: the BN8 trader waits for it). */
  market: { readonly hasTixApi: boolean };
}

export type ProbeName = keyof ProbeValues;

export interface ProbeSpec {
  readonly script: HelperScript;
  /** Launch the probe again once its last reading is this old. */
  readonly maxAgeMs: number;
}

/** Probes take no argument: each fills one snapshot field, `snapshot.probes[name]`. */
export const PROBES: { readonly [P in ProbeName]: ProbeSpec } = {
  network: { script: "sr/h/network.js", maxAgeMs: 10_000 },
  // Changes only at a reset, which also restarts the conductor; refreshed
  // once a minute so a failed reading is retried.
  route: { script: "sr/h/route.js", maxAgeMs: 60_000 },
  // Changes when TIX is bought (or at a reset, which restarts the conductor).
  market: { script: "sr/h/market.js", maxAgeMs: 30_000 },
};

/** Action helpers, by name. Launched one at a time and awaited. None yet. */
export const CALLS: Readonly<Record<string, HelperScript>> = {};

/**
 * A long-lived worker (spec #41: the money engine, the BN8 trader, ...): a
 * helper-shaped script that keeps running. It is launched like a helper
 * (args[0] its JSON argument, args[1] its status port) and posts a
 * WorkerReport to that port as it works (`helper-contract.ts`).
 */
export interface WorkerSpec {
  readonly script: HelperScript;
  /** Its fixed status port, below REPLY_PORT_BASE. */
  readonly port: number;
  /** Library files it imports beyond the helper runtime, copied with it off home. */
  readonly files: readonly `sr/${string}.js`[];
}

export const WORKERS = {
  trader: { script: "sr/h/trader.js", port: 1, files: ["sr/trades.js"] },
} as const satisfies Record<string, WorkerSpec>;

export type WorkerName = keyof typeof WORKERS;

/** Every helper script, for the RAM costs in the snapshot. */
export const HELPER_SCRIPTS: readonly HelperScript[] = [
  ...Object.values(PROBES).map((p) => p.script),
  ...Object.values(CALLS),
  ...Object.values(WORKERS).map((w) => w.script),
];
