// Seam A for the casino in the run (#56): "wait" while it runs, the start and
// relaunch, its host, the skip rule, and the rest of the run kept off its
// money and RAM until it is done.
import { describe, expect, test } from "vitest";
import { CASINO_CAP } from "./blackjack.ts";
import { decide, engineOrders, type Snapshot, type WorkerView } from "./decide.ts";
import type { DriverNews } from "./driver-jobs.ts";
import type { Json } from "./helper-contract.ts";
import { CALLS, PROBES, WORKERS } from "./helpers.ts";
import { ORDERS_OFF } from "./money-engine.ts";

const NOW = 1_700_000_000_000;
const BUY = CALLS.buyServer!;
const CASINO = WORKERS.casino.script;
const reading = <T,>(value: T, atMs = NOW) => ({ ok: true, value, atMs }) as const;
const route = (currentNode: number, ownedSF: Record<number, number> = {}) =>
  reading({ currentNode, ownedSF, lastAugReset: NOW, lastNodeReset: NOW });
const COSTS = {
  [PROBES.network.script]: 1.8,
  [PROBES.route.script]: 2.6,
  [PROBES.stats.script]: 3.15,
  [PROBES.market.script]: 1.65,
  [PROBES.fleet.script]: 2.9,
  [CALLS.root!]: 1.9,
  [BUY]: 3.85,
  [CALLS.fleetUpgrade!]: 1.85,
  [WORKERS.engine.script]: 4.95,
  [WORKERS.driver.script]: 27.25,
  [CASINO]: 54.6,
};
const HOSTS = ["home", "n00dles", "sr-00", "sr-01"];

/** The driver's news: options set, TOR and BruteSSH bought, in `city`, its last order (seq 4) done. */
const driverNews = (city = "Aevum", money = 4e6): DriverNews => ({
  host: "sr-00",
  facts: { money, city, tor: true, programs: ["BruteSSH.exe"] },
  optionsSet: true,
  done: 4,
  lastError: null,
});

/** An engine report whose outlook models `incomePerSec` on its RAM. */
const engineAt = (incomePerSec: number): WorkerView => ({
  running: true,
  failures: 0,
  report: { pid: 7, atMs: NOW, value: { outlook: { target: "n00dles", poolGb: 100, incomePerSec, incomeAt2xPerSec: 2 * incomePerSec } } },
});

type Over = Partial<Snapshot> & { money?: number; city?: string; winnings?: number; homeRam?: number };

/**
 * BN1.1, Open, in Aevum: sr-00 (the driver's) and sr-01 (the casino's, 64 GB
 * free) bought, the driver idle with its last order done, the engine running
 * at $1m/s with its orders on its port, no casino yet. Override any field.
 */
function run(over: Over = {}): Snapshot {
  const { money = 4e6, city = "Aevum", winnings = 0, homeRam = 8, ...rest } = over;
  const base: Snapshot = {
    nowMs: NOW,
    category: "open",
    freeRamGb: { home: 4.15, "n00dles": 4, "sr-00": 4.75, "sr-01": 64 },
    helperRamGb: COSTS,
    probes: {
      network: reading({ hosts: HOSTS }),
      route: route(1),
      stats: reading({ hack: 50, money, M: 1, homeRam, city, casinoWinnings: winnings }),
      market: reading({ hasTixApi: false }),
    },
    probesInFlight: [],
    callRunning: false,
    workers: {
      engine: engineAt(1e6),
      driver: { running: true, failures: 0, report: { pid: 9, atMs: NOW, value: driverNews(city, money) } },
    },
    controls: { driver: { seq: 4, job: { kind: "travel", city: "Aevum" } } },
    ...rest,
  };
  return { ...base, controls: { engine: engineOrders(base) as unknown as Json, ...base.controls } };
}

/** The casino's report on its port. */
const casinoAt = (phase: string, running: boolean, more: Partial<WorkerView> = {}): WorkerView => ({
  running,
  failures: 0,
  report: { pid: 11, atMs: NOW, value: { host: "sr-01", phase, hands: 3, winnings: 2e8, lastError: null } },
  ...more,
});
/** `run(over)` plus the casino's view; the engine's port still holds what it held without it. */
const withCasino = (casino: WorkerView, over: Over = {}): Snapshot => {
  const s = run(over);
  return { ...s, workers: { ...s.workers, casino } };
};

const startCasino = { kind: "start", worker: "casino", arg: { category: "open" }, host: "sr-01" } as const;
const starts = (s: Snapshot) => decide(s).filter((a) => a.kind === "start");

describe("decide: wait while the casino runs", () => {
  test("nothing at all once the engine's port reads off: no probes, calls, starts or driver jobs", () => {
    // After each of the casino's reloads every port is empty, the engine's included.
    const s = withCasino(casinoAt("playing", true));
    expect(decide({ ...s, controls: {} })).toEqual([]);
  });

  test("the one action is turning the money engine off, when its port still holds money orders", () => {
    const s = withCasino(casinoAt("playing", true));
    expect(decide(s)).toEqual([{ kind: "control", worker: "engine", message: ORDERS_OFF }]);
  });
});
