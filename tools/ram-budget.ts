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
  // #48: the route probe (current BitNode, owned Source-Files). Base 1.6,
  // getResetInfo 1.0, which the conductor can't afford.
  "sr/h/route.js": { budget: 2.6, contexts: EVERYWHERE },
  // #49: the stats probe (a split's hacking, money, M, home RAM). Base 1.6,
  // getPlayer 0.5, getServerMaxRam 0.05. Its "hack" key is quoted, or it
  // would be charged as ns.hack (0.1).
  "sr/h/stats.js": { budget: 2.15, contexts: EVERYWHERE },
  // #49: the sleeves probe (sleeve count). Base 1.6, sleeve.getNumSleeves 4.
  // Launched only in BN10 or with SF10, but priced the same everywhere.
  "sr/h/sleeves.js": { budget: 5.6, contexts: EVERYWHERE },
  // #72: the market probe. Base 1.6, stock.hasTixApiAccess 0.05: 1.65, a
  // hair over in the calculator's float sum (as is the trader's), hence 1.7.
  "sr/h/market.js": { budget: 1.7, contexts: EVERYWHERE },
  // #72: the BN8 trader worker. Base 1.6; getSymbols, getAskPrice,
  // getBidPrice, getPosition, getMaxShares 2 each; buyStock, sellStock,
  // buyShort, sellShort, getForecast, getVolatility 2.5 each;
  // getServerMoneyAvailable 0.1, has4SDataTixApi 0.05; nextUpdate 0. That is
  // 26.75, which the calculator's float sum puts a hair over, hence 26.8.
  // Only BN8 starts it, which the gate's presets price like any BitNode
  // after the BN4 front (no Singularity here, so the context changes nothing).
  "sr/h/trader.js": { budget: 26.8, contexts: ["SF4.3"] },
  // #53: the root action helper. Base 1.6, nuke and the five port openers
  // 0.05 each: 1.90, a hair over in the float sum, hence 1.95.
  "sr/h/root.js": { budget: 1.95, contexts: EVERYWHERE },
  // #53: the money engine worker (spec: "about 4.5 GB"). Base 1.6, exec 1.3,
  // scp 0.6, getPlayer 0.5, scan 0.2, getServerMoneyAvailable,
  // getServerSecurityLevel and getServerRequiredHackingLevel 0.1 each,
  // hasRootAccess, getServerMaxRam and getServerUsedRam 0.05 each; self and
  // the ports are free. No field may be called share (ns.share, 2.4): the
  // split's share part is `sharing`. #57 adds getServerMaxMoney,
  // getServerMinSecurityLevel and getServerGrowth (0.1 each) for batches:
  // 4.95. The batch code calls its thread counts hackThreads and growThreads,
  // never hack or grow, which would be charged as ns.hack and ns.grow.
  // #58 adds getServerBaseSecurityLevel (0.1) for target ranking (a target's
  // first weaken from base security): 5.05, a hair over in the float sum,
  // hence 5.1. Nor may a local be called ps (ns.ps, 0.2).
  "sr/h/engine.js": { budget: 5.1, contexts: EVERYWHERE },
  // #57: the upgrade-server action helper. Base 1.6, cloud.upgradeServer 0.25.
  "sr/h/upgrade-server.js": { budget: 1.85, contexts: EVERYWHERE },
  // #57: the fleet probe. Base 1.6, cloud.getServerNames 1.05,
  // getServerMaxRam 0.05, cloud.getServerLimit and getRamLimit 0.05 each,
  // getServerMoneyAvailable 0.1.
  "sr/h/fleet.js": { budget: 2.9, contexts: EVERYWHERE },
  // #57: the BitNode multipliers probe. Base 1.6, getBitNodeMultipliers 4.
  // Launched only with SF5 or in BN5, but priced the same everywhere.
  "sr/h/bitnode.js": { budget: 5.6, contexts: EVERYWHERE },
  // #53: the job scripts the engine execs, one call each on top of the base
  // 1.6 (hack 0.1, grow and weaken 0.15). hack's 1.70 is a hair over in the
  // float sum, hence 1.75 for all three. JOB_RAM_GB in src/sr/money-engine.ts
  // holds their per-thread cost (money-engine.ram.test.ts checks it).
  // #54/#57: the buy-server action helper. Base 1.6, cloud.purchaseServer 2.25.
  // #54 uses it in BN1.1 for the driver's host, #57 everywhere for the fleet.
  "sr/h/buy-server.js": { budget: 3.85, contexts: EVERYWHERE },
  // #54: the BN1.1 driver, on its 32 GB cloud server. Base 1.6, document 25
  // (the DOM charge, once; it never names window), getPlayer 0.5, fileExists
  // 0.1, hasTorRouter 0.05: 27.25, a hair over in the float sum. Must fit 32
  // GB (tools/ram-budget.test.ts). Only BN1.1 runs it.
  "sr/h/driver.js": { budget: 27.3, contexts: ["BN1.1"] },
  // #55: the casino, on a 64 GB cloud server (later home). The only script
  // that names window: base 1.6, window 25, document 25 (through sr/ui.js),
  // exec 1.3, getMoneySources 1, getPlayer 0.5, getServerMoneyAvailable 0.1,
  // isRunning 0.1: 54.6, a hair over in the float sum. Must fit 64 GB
  // (tools/ram-budget.test.ts). Every reset of every hacking-finish BitNode.
  "sr/h/casino.js": { budget: 54.65, contexts: EVERYWHERE },
  "sr/j/hack.js": { budget: 1.75, contexts: EVERYWHERE },
  "sr/j/grow.js": { budget: 1.75, contexts: EVERYWHERE },
  "sr/j/weaken.js": { budget: 1.75, contexts: EVERYWHERE },
  // #58: the share job, base 1.6 plus share 2.4. JOB_RAM_GB holds the same.
  "sr/j/share.js": { budget: 4.0, contexts: EVERYWHERE },
};
