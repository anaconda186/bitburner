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

describe("decide: starting the casino", () => {
  test("starts it on sr-01 with the run's category, before anything else is placed", () => {
    expect(decide(run())[0]).toEqual(startCasino);
    expect(starts(run())).toEqual([startCasino]);
  });

  test("plays only in Open: not in Strict, nor when the category is unknown", () => {
    expect(starts(run({ category: "strict" }))).toEqual([]);
    const { category: _unknown, ...noCategory } = run();
    expect(starts(noCategory)).toEqual([]);
  });

  test("waits for the player to be in Aevum", () => {
    expect(starts(run({ city: "Sector-12" }))).toEqual([]);
  });

  test("waits while the driver has a job in hand, so the two never drive the page at once", () => {
    expect(starts(run({ controls: { driver: { seq: 5, job: { kind: "options" } } } }))).toEqual([]);
  });

  test("not once the cap is reached since the install: the casino's own report, or the stats probe after a reload", () => {
    expect(starts(withCasino(casinoAt("capped", false)))).toEqual([]);
    expect(starts(run({ winnings: CASINO_CAP + 1 }))).toEqual([]);
    expect(starts(run({ winnings: CASINO_CAP }))).toEqual([startCasino]);
  });

  test("not before the stats probe has said how much the casino has paid since the install", () => {
    const { stats: _unread, ...probes } = run().probes;
    expect(starts(run({ probes }))).toEqual([]);
  });

  test("relaunches a casino missing after a reload (no report), and a crashed one after the backoff", () => {
    expect(starts(run())).toEqual([startCasino]);
    const crashed = (atMs: number) => casinoAt("failed", false, { failures: 1, lastFailAtMs: atMs });
    expect(starts(withCasino(crashed(NOW - 999)))).toEqual([]);
    expect(starts(withCasino(crashed(NOW - 1_000)))).toEqual([startCasino]);
  });

  test("not in BN8 or BN9, whose plans decide the casino (#73, #71)", () => {
    expect(starts(run({ probes: { ...run().probes, route: route(8, { 1: 1, 4: 3 }) } }))).toEqual([]);
    expect(starts(run({ probes: { ...run().probes, route: route(9, { 1: 1, 4: 3 }) } }))).toEqual([]);
  });

  test("outside BN1.1, where no driver travels, it is played once the player is in Aevum", () => {
    const bn4 = (city: string) =>
      run({ city, probes: { ...run({ city }).probes, route: route(4, { 1: 1 }) }, workers: { engine: engineAt(1e6) }, controls: {} });
    const casinoStarts = (s: Snapshot) => starts(s).filter((a) => a.kind === "start" && a.worker === "casino");
    expect(casinoStarts(bn4("Aevum"))).toEqual([startCasino]);
    expect(casinoStarts(bn4("Sector-12"))).toEqual([]);
  });
});
