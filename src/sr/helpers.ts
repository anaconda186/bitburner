// The helper registry: every helper script the conductor may launch. Pure and
// ns-free. The conductor reads each listed script's RAM cost into the
// snapshot every loop, and `decide` only places a helper whose cost it knows,
// so a helper missing from this file can never run.
//
// Adding a helper: write `src/sr/h/<name>.ts` around `serve` (see
// `h/serve.ts`), give it a row in `tools/ram-budget.ts`, then add it here:
//   - a probe (a read that fills a snapshot field) goes in PROBES, with its
//     value type in ProbeValues and how stale it may get;
//   - an action helper (a call that changes the game) goes in CALLS.

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
};

/** Action helpers, by name. Launched one at a time and awaited. None yet. */
export const CALLS: Readonly<Record<string, HelperScript>> = {};

/** Every helper script, for the RAM costs in the snapshot. */
export const HELPER_SCRIPTS: readonly HelperScript[] = [
  ...Object.values(PROBES).map((p) => p.script),
  ...Object.values(CALLS),
];
