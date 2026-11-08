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

import type { NodeMults } from "./formulas.ts";
import type { Reply } from "./helper-contract.ts";
import { multsReadable } from "./node-mults.ts";
import type { RouteFacts } from "./order.ts";
import type { ResetTimes } from "./state.ts";

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
  /**
   * The current BitNode and the owned Source-Files (#48): where the run is in
   * the BitNode order. Plus the game's reset times (#49), which tell a
   * conductor start after a reset from one after a page reload.
   */
  route: RouteFacts & ResetTimes;
  /** A split's stats (#49), all but the sleeves. */
  stats: { readonly hack: number; readonly money: number; readonly M: number; readonly homeRam: number };
  /** Sleeves owned (#49). Only launched where sleeves can exist (`sleevesPossible`). */
  sleeves: { readonly count: number };
  /** Whether the TIX API, which every stock call needs, is owned (#72: the BN8 trader waits for it). */
  market: { readonly hasTixApi: boolean };
  /**
   * The cloud servers owned now and their RAM, how many the BitNode allows,
   * the most RAM one can have, and the money on hand (#57: the fleet rule).
   */
  fleet: FleetFacts;
  /**
   * The BitNode multipliers the formulas read (#57), from
   * getBitNodeMultipliers. Only launched where that works (SF5 or BN5), and
   * only until it has read once: they change only at a reset.
   */
  bitnode: NodeMults;
}

/** One cloud server as the fleet probe reads it. */
export type CloudServer = { readonly host: string; readonly ramGb: number };

export type FleetFacts = {
  /** When the probe read the game (Date.now() in the probe, not when the conductor collected it). */
  readonly readAtMs: number;
  readonly servers: readonly CloudServer[];
  readonly limit: number;
  readonly ramLimitGb: number;
  readonly money: number;
};

export type ProbeName = keyof ProbeValues;

/** The probes' latest readings, as the snapshot holds them. */
export type Readings = { readonly [P in ProbeName]?: Reply<ProbeValues[P]> };

export interface ProbeSpec {
  readonly script: HelperScript;
  /** Launch the probe again once its last reading is this old. */
  readonly maxAgeMs: number;
  /** Launch it only while this holds; without it, always. */
  readonly onlyIf?: (readings: Readings) => boolean;
  /** Launch it again as soon as one of these action helpers has run since its last reading. */
  readonly afterCalls?: readonly HelperScript[];
}

/** Sleeves exist in BN10 and wherever SF10 is owned; elsewhere their API throws. */
export function sleevesPossible(route: RouteFacts): boolean {
  return route.currentNode === 10 || (route.ownedSF[10] ?? 0) >= 1;
}

/** Probes take no argument: each fills one snapshot field, `snapshot.probes[name]`. */
export const PROBES: { readonly [P in ProbeName]: ProbeSpec } = {
  network: { script: "sr/h/network.js", maxAgeMs: 10_000 },
  // Changes only at a reset, which also restarts the conductor; refreshed
  // once a minute so a failed reading is retried.
  route: { script: "sr/h/route.js", maxAgeMs: 60_000 },
  // Read into each split; a split takes the latest reading.
  stats: { script: "sr/h/stats.js", maxAgeMs: 30_000 },
  // 5.6 GB, and its count changes rarely.
  sleeves: {
    script: "sr/h/sleeves.js",
    maxAgeMs: 300_000,
    onlyIf: (readings) => readings.route?.ok === true && sleevesPossible(readings.route.value),
  },
  // Changes when TIX is bought (or at a reset, which restarts the conductor).
  market: { script: "sr/h/market.js", maxAgeMs: 30_000 },
  // #57: read again right after each purchase, so the next one is decided
  // on the fleet and money as they are now.
  fleet: { script: "sr/h/fleet.js", maxAgeMs: 10_000, afterCalls: ["sr/h/buy-server.js", "sr/h/upgrade-server.js"] },
  // #57: 5.6 GB, once per conductor (a reset restarts it); retried after a failure.
  bitnode: {
    script: "sr/h/bitnode.js",
    maxAgeMs: 60_000,
    onlyIf: (readings) => readings.route?.ok === true && multsReadable(readings.route.value) && readings.bitnode?.ok !== true,
  },
};

/** Action helpers, by name. Launched one at a time and awaited. */
export const CALLS: Readonly<Record<string, HelperScript>> = {
  // #53: opens every port it has the program for and NUKEs, on each server
  // named in its argument ({ hosts }). Replies { rooted: string[] }.
  root: "sr/h/root.js",
  // #54/#57: buys one cloud server, { host, ram }. Replies the hostname.
  buyServer: "sr/h/buy-server.js",
  // #57: doubles one cloud server's RAM, { host, ram }. Replies the hostname.
  // (Not called upgradeServer: that is charged as ns.cloud.upgradeServer.)
  fleetUpgrade: "sr/h/upgrade-server.js",
};

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
  /**
   * Its control port, below REPLY_PORT_BASE, if it takes instructions: the
   * conductor keeps the latest there and the worker peeks it, so a worker
   * started again finds them waiting.
   */
  readonly control?: number;
  /** Start it on home only with the home reserve still free beside it (`homeReserveGb` in decide.ts). */
  readonly homeHeadroom?: boolean;
  /** Start it on this server and nowhere else (the driver on its own cloud server). */
  readonly host?: string;
  /**
   * Launch it non-temporary, so a save records it as running and the game
   * starts it again after a reload (#23: the casino, and nothing else).
   */
  readonly survivesReload?: boolean;
}

export const WORKERS = {
  trader: { script: "sr/h/trader.js", port: 1, files: ["sr/trades.js"] },
  // #53: the money engine. Its orders (RAM split, home reserve) are on its
  // control port. Its argument is { control }, plus the jobs it had in
  // flight when it starts itself again on home.
  engine: {
    script: "sr/h/engine.js",
    port: 2,
    control: 3,
    files: ["sr/money-engine.js", "sr/formulas.js", "sr/node-mults.js"],
    homeHeadroom: true,
  },
  // #54: the BN1.1 driver (UI automation) on its own 32 GB cloud server. Its
  // jobs come over its control port (DriverOrder in `driver-jobs.ts`).
  driver: { script: "sr/h/driver.js", port: 4, control: 5, files: ["sr/driver-jobs.js", "sr/ui.js"], host: "sr-00" },
  // #55: the casino (UI automation, Open only), the one non-temporary run
  // script: it comes back by itself after each of its reloads. Its argument
  // is { category }; its report is CasinoNews (`blackjack.ts`). #56: its
  // host is the 64 GB cloud server sr-01 (the second one the run buys, after
  // the driver's sr-00), or home once home has 128 GB (decide pins that start
  // to home). boot.js keeps copies of the script and both hosts.
  casino: { script: "sr/h/casino.js", port: 6, files: ["sr/blackjack.js", "sr/ui.js"], survivesReload: true, host: "sr-01" },
} as const satisfies Record<string, WorkerSpec>;

export type WorkerName = keyof typeof WORKERS;

/** Every helper script, for the RAM costs in the snapshot. */
export const HELPER_SCRIPTS: readonly HelperScript[] = [
  ...Object.values(PROBES).map((p) => p.script),
  ...Object.values(CALLS),
  ...Object.values(WORKERS).map((w) => w.script),
];
