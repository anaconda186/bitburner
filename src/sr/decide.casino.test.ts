// Seam A for the casino in the run (#56): "wait" while it runs, the start and
// relaunch, its host, the skip rule, and the rest of the run kept off its
// money and RAM until it is done.
import { describe, expect, test } from "vitest";
import { CASINO_CAP } from "./blackjack.ts";
import {
  CASINO_TUNABLES, casinoSkipThresholdPerSec, decide, engineOrders, wantedCity, type Snapshot, type WorkerView,
} from "./decide.ts";
import { MILESTONES, milestonesReached } from "./milestones.ts";
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

/** `run` before sr-01 is bought: the network lists no sr-01. */
const noHost = (over: Over = {}): Snapshot => {
  const s = run(over);
  const { "sr-01": _none, ...freeRamGb } = s.freeRamGb;
  return { ...s, freeRamGb, probes: { ...s.probes, network: reading({ hosts: ["home", "n00dles", "sr-00"] }) } };
};
const buyHost = { kind: "call", script: BUY, arg: { host: "sr-01", ram: 64 } } as const;
const casinoCalls = (s: Snapshot) => decide(s).filter((a) => a.kind === "call" && a.script === BUY);

describe("decide: the casino's host", () => {
  test("buys sr-01 at 64 GB once its price ($3.52m) and the stake ($100k) are in hand", () => {
    expect(casinoCalls(noHost({ money: 3_620_000 }))).toEqual([{ ...buyHost, host: "home" }]);
    expect(casinoCalls(noHost({ money: 3_619_999 }))).toEqual([]);
  });

  test("never buys it twice: not once the network lists it, nor right after this conductor bought it", () => {
    expect(casinoCalls(run({ money: 1e9 }))).toEqual([]);
    expect(casinoCalls({ ...noHost({ money: 1e9 }), boughtServers: ["sr-01"] })).toEqual([]);
  });

  test("tries a failed purchase again 10 s later, not before", () => {
    const failed = (atMs: number) => ({ script: BUY, arg: buyHost.arg, atMs, reply: { ok: false, error: "no money" } }) as const;
    expect(casinoCalls({ ...noHost({ money: 4e6 }), lastCall: failed(NOW - 9_999) })).toEqual([]);
    expect(casinoCalls({ ...noHost({ money: 4e6 }), lastCall: failed(NOW - 10_000) })).toEqual([{ ...buyHost, host: "home" }]);
  });

  test("goes on home once home has 128 GB: no cloud server bought", () => {
    const roomy = noHost({ homeRam: 128, money: 1e9 });
    const onHome = { ...roomy, freeRamGb: { ...roomy.freeRamGb, home: 100 } };
    expect(casinoCalls(onHome)).toEqual([]);
    expect(starts(onHome)[0]).toEqual({ ...startCasino, host: "home" });
  });

  test("starts on its own host only, even when home has more room", () => {
    expect(starts(run({ freeRamGb: { home: 100, "sr-00": 4.75, "sr-01": 54 } }))).toEqual([]);
  });
});

describe("decide: the skip rule", () => {
  // CASINO_TUNABLES.durationS 360 s: $10b / 360 s = $27.78m/s.
  const earning = (incomePerSec: number) => {
    const s = run();
    return { ...s, workers: { ...s.workers, engine: engineAt(incomePerSec) } };
  };

  test("plays when the engine's income would take longer than the casino to make $10b", () => {
    expect(starts(earning(27_000_000))).toEqual([startCasino]);
  });

  test("skips when the engine's income makes $10b in the casino's time or less: no host, no start, no holds", () => {
    expect(starts(earning(27_800_000))).toEqual([]);
    expect(casinoCalls({ ...noHost({ money: 1e9 }), workers: earning(27_800_000).workers })).toEqual([]);
    expect(engineOrders(earning(27_800_000)).hostReserveGb).toEqual({ "sr-00": 27.25 });
  });

  test("the threshold follows from the casino's duration tunable", () => {
    expect(casinoSkipThresholdPerSec({ ...CASINO_TUNABLES, durationS: 200 })).toBe(50_000_000);
    expect(casinoSkipThresholdPerSec()).toBeCloseTo(27_777_778, 0);
  });

  test("an engine with no outlook yet earns nothing as far as the rule goes", () => {
    const s = run();
    expect(starts({ ...s, workers: { ...s.workers, engine: { running: true, failures: 0 } } })).toEqual([startCasino]);
  });
});

describe("decide: the money engine around the casino", () => {
  test("off while the casino runs, back on (all money) once it has capped", () => {
    expect(engineOrders(withCasino(casinoAt("playing", true)))).toEqual(ORDERS_OFF);
    const after = engineOrders(withCasino(casinoAt("capped", false)));
    expect(after.split.money).toBe(1);
    expect(after.hostReserveGb).toEqual({ "sr-00": 27.25 });
  });

  test("while it is wanted, the engine leaves the casino's room free on sr-01", () => {
    expect(engineOrders(run()).hostReserveGb).toEqual({ "sr-00": 27.25, "sr-01": 54.6 });
    expect(engineOrders(run({ category: "strict" })).hostReserveGb).toEqual({ "sr-00": 27.25 });
  });

  test("with the casino going on home, the engine's home reserve grows by the casino's RAM", () => {
    expect(engineOrders(run({ homeRam: 128 })).homeReserveGb).toBeCloseTo(3.85 + 54.6, 9);
    expect(engineOrders(run({ homeRam: 128 })).hostReserveGb).toEqual({ "sr-00": 27.25 });
  });

  test("the engine is started again once the casino is done", () => {
    const capped = withCasino(casinoAt("capped", false));
    const engineGone = { ...capped, workers: { ...capped.workers, engine: { running: false, failures: 0 } } };
    expect(starts(engineGone).filter((a) => a.kind === "start" && a.worker === "engine")).toHaveLength(1);
  });
});

describe("decide: the run leaves the casino's money alone until it is done", () => {
  const fleetReading = reading({ readAtMs: NOW, servers: [{ host: "sr-00", ramGb: 32 }, { host: "sr-01", ramGb: 64 }], limit: 25, ramLimitGb: 1_048_576, money: 1e12 });
  const rich = (over: Over = {}) => {
    const s = run({ money: 1e12, ...over });
    return { ...s, probes: { ...s.probes, fleet: fleetReading }, workers: { ...s.workers, engine: engineAt(1e6) } };
  };
  const fleetCalls = (s: Snapshot) => decide(s).filter((a) => a.kind === "call" && a.script !== CALLS.root);

  test("the fleet buys nothing while the casino is wanted, and buys again once it is done", () => {
    expect(fleetCalls(rich())).toEqual([]);
    const done = rich({ winnings: CASINO_CAP + 1 });
    expect(fleetCalls(done)).toHaveLength(1);
  });

  test("wants the player in Aevum while the casino is pending, and nowhere once it is done", () => {
    expect(wantedCity(run({ city: "Sector-12" }))).toBe("Aevum");
    expect(wantedCity(run({ city: "Sector-12", winnings: CASINO_CAP + 1 }))).toBeNull();
    expect(wantedCity(run({ city: "Sector-12", category: "strict" }))).toBeNull();
  });

  const driverJobs = (s: Snapshot) => decide(s).filter((a) => a.kind === "control" && a.worker === "driver");

  test("the driver travels to Aevum after BruteSSH", () => {
    const s = run({ city: "Sector-12", money: 1e6 });
    expect(driverJobs(s)).toEqual([
      { kind: "control", worker: "driver", message: { seq: 5, job: { kind: "travel", city: "Aevum" } } },
    ]);
  });

  test("the driver buys no more port openers until the casino is done", () => {
    expect(driverJobs(run({ money: 2e6 }))).toEqual([]);
    expect(driverJobs(run({ money: 2e6, winnings: CASINO_CAP + 1 }))).toEqual([
      { kind: "control", worker: "driver", message: { seq: 5, job: { kind: "buy", programs: ["FTPCrack.exe"] } } },
    ]);
  });
});

describe("milestone bn1.1:casino", () => {
  const due = (s: Snapshot) => milestonesReached(MILESTONES, s, ["bn1.1:driver"]);

  test("reached when the casino reports the cap, or the stats probe reads it since the install", () => {
    expect(due(withCasino(casinoAt("capped", false)))).toEqual(["bn1.1:casino"]);
    expect(due(run({ winnings: CASINO_CAP + 1 }))).toEqual(["bn1.1:casino"]);
  });

  test("not while it plays, nor at the cap exactly (the game's own test is strictly over)", () => {
    expect(due(withCasino(casinoAt("playing", true)))).toEqual([]);
    expect(due(run({ winnings: CASINO_CAP }))).toEqual([]);
  });

  test("only in BN1.1", () => {
    expect(due(run({ winnings: CASINO_CAP + 1, probes: { ...run().probes, route: route(1, { 1: 1 }) } }))).not.toContain("bn1.1:casino");
  });
});
