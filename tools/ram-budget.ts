// The RAM budget table: one row per entry script (a built file that exports
// `main`), keyed by its path on home. `npm run ram-check` prices every entry
// script with the game's own calculator in each of its row's contexts and fails
// if the worst one is over budget, if an entry script has no row, or if a row
// names a script that is not in the build.
//
// Adding a script: add a row here with its budget (GB) and every context it
// runs in. The ticket that builds a script sets its budget.

import type { RamContext } from "./ram-calc.ts";

/**
 * The player states a script can be priced in. Only the BitNode and the SF4
 * level change any cost (Singularity is x16 outside BN4 at SF4 <= 1, x4 at
 * SF4.2, x1 at SF4.3 and anywhere in BN4). Add a preset when a row needs one.
 */
export const RAM_CONTEXTS = {
  /** The first BitNode: no Source-Files at all. */
  "BN1.1": { bitNodeN: 1 },
  /** Anywhere in BN4.1-4.3: Singularity at x1 whatever the SF4 level. */
  BN4: { bitNodeN: 4 },
  /** Outside BN4 holding SF4.1 (x16). */
  "SF4.1": { bitNodeN: 1, sourceFiles: { 4: 1 } },
  /** Outside BN4 holding SF4.2 (x4). */
  "SF4.2": { bitNodeN: 1, sourceFiles: { 4: 2 } },
  /** Outside BN4 holding SF4.3 (x1): every BitNode after the BN4 front. */
  "SF4.3": { bitNodeN: 1, sourceFiles: { 4: 3 } },
  /** Entering BN10 (32 GB home without SF9.2), after the BN4 front. */
  "BN10 start": { bitNodeN: 10, sourceFiles: { 4: 3 } },
} as const satisfies Record<string, RamContext>;

export type RamContextName = keyof typeof RAM_CONTEXTS;

/** Every preset, for scripts that run at every point of the run. */
export const EVERYWHERE = Object.keys(RAM_CONTEXTS) as [RamContextName, ...RamContextName[]];

export interface BudgetRow {
  /** GB. The script fails the gate if it costs more than this in any context. */
  budget: number;
  /** Where it runs; the check uses the worst case. At least one. */
  contexts: readonly [RamContextName, ...RamContextName[]];
}

/** Keyed by path on home: `boot.js` at the root, everything else under `sr/`. */
export type BudgetTable = Readonly<Record<string, BudgetRow>>;

export const RAM_BUDGETS: BudgetTable = {
  // Spec #41: "about 3.6 GB plus a few tenths of a GB for the casino check.
  // It must fit an 8 GB home." Started by the start command, autoexec, reset
  // callbacks, the driver and the casino, so it runs everywhere. #44: 3.80
  // (base 1.60, spawn 2.00, ps 0.20 for the live-run guard). ps is then
  // already paid for, so #56's casino check costs nothing more for a ps on a
  // known host name (it throws on a host that doesn't exist, so catch it), or
  // 0.20 more with scan to list the cloud servers.
  "boot.js": { budget: 4, contexts: EVERYWHERE },
  // #43/#47: the conductor boot.js spawns. It must fit beside boot.js on an
  // 8 GB home; tools/ram-budget.test.ts holds the two budgets to that. At #47
  // it costs 3.85: base 1.6, exec 1.3, scp 0.6, getScriptRam 0.1, isRunning
  // 0.1, hasRootAccess, getServerMaxRam and getServerUsedRam 0.05 each. Only
  // 0.15 GB is left: further expensive reads belong in probe helpers.
  "sr/conductor.js": { budget: 4, contexts: EVERYWHERE },
  // #47: the network probe helper. Base 1.6, scan 0.2.
  "sr/h/network.js": { budget: 1.8, contexts: EVERYWHERE },
};
