// Seam A for the driver (#54): its host bought in BN1.1, the driver started
// there, its jobs handed over its control port, and the money engine kept off
// its host.
import { describe, expect, test } from "vitest";
import { decide, engineOrders, type Snapshot } from "./decide.ts";
import type { DriverNews } from "./driver-jobs.ts";
import { CALLS, PROBES, WORKERS } from "./helpers.ts";
import { SPLIT_MONEY } from "./money-engine.ts";

const NOW = 1_700_000_000_000;
const BUY = CALLS.buyServer!;
const DRIVER = WORKERS.driver.script;
const reading = <T,>(value: T, atMs = NOW) => ({ ok: true, value, atMs }) as const;
const route = (currentNode: number, ownedSF: Record<number, number> = {}) =>
  reading({ currentNode, ownedSF, lastAugReset: NOW, lastNodeReset: NOW });
const stats = (money: number) => reading({ hack: 10, money, M: 1, homeRam: 8 });
const COSTS = {
  [PROBES.network.script]: 1.8,
  [PROBES.route.script]: 2.6,
  [PROBES.stats.script]: 2.15,
  [PROBES.market.script]: 1.65,
  [CALLS.root!]: 1.9,
  [BUY]: 3.85,
  [WORKERS.engine.script]: 4.65,
  [DRIVER]: 27.25,
};
const HOSTS = ["home", "n00dles", "foodnstuff"];

/**
 * BN1.1 about ten minutes in: every probe fresh, the engine running, its
 * orders on the port, $1.76m in hand (a 32 GB cloud server's price), no
 * cloud server yet. Override any field.
 */
function bn1(over: Partial<Snapshot> = {}): Snapshot {
  const base: Snapshot = {
    nowMs: NOW,
    freeRamGb: { home: 4.15, "n00dles": 4, "foodnstuff": 0.5 },
    helperRamGb: COSTS,
    probes: {
      network: reading({ hosts: HOSTS }),
      route: route(1),
      stats: stats(1_760_000),
      market: reading({ hasTixApi: false }),
    },
    probesInFlight: [],
    callRunning: false,
    workers: { engine: { running: true, failures: 0 } },
    controls: {},
  };
  const s = { ...base, ...over };
  return { ...s, controls: { engine: engineOrders(s), ...s.controls } };
}

const buy = { kind: "call", script: BUY, arg: { host: "sr-00", ram: 32 } } as const;
const calls = (s: Snapshot) => decide(s).filter((a) => a.kind === "call");

describe("decide: the driver's host", () => {
  test("buys sr-00 at 32 GB in BN1.1 once the money is there", () => {
    expect(calls(bn1())).toEqual([{ ...buy, host: "home" }]);
    expect(calls(bn1({ probes: { ...bn1().probes, stats: stats(1_759_999) } }))).toEqual([]);
  });

  test("buys nothing outside BN1.1: in BN1.2 or in BN4", () => {
    expect(calls(bn1({ probes: { ...bn1().probes, route: route(1, { 1: 1 }) } }))).toEqual([]);
    expect(calls(bn1({ probes: { ...bn1().probes, route: route(4, { 1: 1 }) } }))).toEqual([]);
  });

  test("buys nothing before the network probe has said which servers exist", () => {
    const { network: _unread, ...probes } = bn1().probes;
    expect(calls(bn1({ probes, probesInFlight: ["network"] }))).toEqual([]);
  });

  test("never buys it twice: not once the network lists it, nor right after this conductor bought it", () => {
    const listed = { ...bn1().probes, network: reading({ hosts: [...HOSTS, "sr-00"] }) };
    expect(calls(bn1({ probes: listed, freeRamGb: { ...bn1().freeRamGb, "sr-00": 32 } }))).toEqual([]);
    expect(calls(bn1({ boughtServers: ["sr-00"] }))).toEqual([]);
  });

  test("tries a failed purchase again 10 s later, not before", () => {
    const failed = (atMs: number) => ({ script: BUY, arg: buy.arg, atMs, reply: { ok: false, error: "no money" } }) as const;
    expect(calls(bn1({ lastCall: failed(NOW - 9_999) }))).toEqual([]);
    expect(calls(bn1({ lastCall: failed(NOW - 10_000) }))).toEqual([{ ...buy, host: "home" }]);
  });
});

/** BN1.1 with sr-00 bought: listed by the network probe, rooted, 32 GB free. */
const withHost = (over: Partial<Snapshot> = {}) =>
  bn1({
    freeRamGb: { home: 4.15, "n00dles": 4, "foodnstuff": 0.5, "sr-00": 32 },
    probes: { ...bn1().probes, network: reading({ hosts: [...HOSTS, "sr-00"] }) },
    ...over,
  });
const startDriver = { kind: "start", worker: "driver", arg: { control: WORKERS.driver.control }, host: "sr-00" } as const;
const starts = (s: Snapshot) => decide(s).filter((a) => a.kind === "start");

describe("decide: starting the driver", () => {
  test("starts the driver on sr-00 once it is there, also the moment this conductor bought it", () => {
    expect(starts(withHost())).toEqual([startDriver]);
    expect(starts(bn1({ boughtServers: ["sr-00"], freeRamGb: { ...bn1().freeRamGb, "sr-00": 32 } }))).toEqual([startDriver]);
  });

  test("starts it on sr-00 only, even when another server has more room", () => {
    expect(starts(withHost({ freeRamGb: { home: 64, "sr-00": 32 } }))).toEqual([startDriver]);
    expect(starts(withHost({ freeRamGb: { home: 64, "sr-00": 27 } }))).toEqual([]);
  });

  test("places the driver before the probes, so a stale probe can't take its room", () => {
    const stale = { ...withHost().probes, stats: stats(0) };
    const actions = decide(withHost({ nowMs: NOW + 60_000, probes: stale }));
    expect(actions.filter((a) => a.kind === "probe")).toHaveLength(4);
    expect(actions[0]).toEqual(startDriver);
  });

  test("leaves a running driver alone and relaunches a dead one after the backoff", () => {
    const engine = { running: true, failures: 0 };
    expect(starts(withHost({ workers: { engine, driver: { running: true, failures: 0 } } }))).toEqual([]);
    const died = (atMs: number) => ({ engine, driver: { running: false, failures: 1, lastFailAtMs: atMs } });
    expect(starts(withHost({ workers: died(NOW - 999) }))).toEqual([]);
    expect(starts(withHost({ workers: died(NOW - 1_000) }))).toEqual([startDriver]);
  });

  test("starts no driver outside BN1.1", () => {
    expect(starts(withHost({ probes: { ...withHost().probes, route: route(4, { 1: 1 }) } }))).toEqual([]);
  });

  test("keeps the money engine off the driver's room on sr-00 in BN1.1", () => {
    expect(engineOrders(withHost())).toEqual({ split: SPLIT_MONEY, homeReserveGb: 3.85, hostReserveGb: { "sr-00": 27.25 } });
    expect(engineOrders(withHost({ probes: { ...withHost().probes, route: route(1, { 1: 1 }) } }))).toEqual({
      split: SPLIT_MONEY,
      homeReserveGb: 3.85,
    });
  });
});

describe("decide: the driver's jobs", () => {
  const news = (over: Partial<DriverNews> = {}, money = 0): DriverNews => ({
    host: "sr-00",
    facts: { money, city: "Sector-12", tor: false, programs: [] },
    optionsSet: false,
    done: 0,
    lastError: null,
    ...over,
  });
  /** The driver running on sr-00 with `value` as its latest report, and `order` on its control port. */
  const driving = (value: DriverNews | undefined, order?: unknown) =>
    withHost({
      workers: {
        engine: { running: true, failures: 0 },
        driver: { running: true, failures: 0, ...(value ? { report: { pid: 9, atMs: NOW, value } } : {}) },
      },
      ...(order === undefined ? {} : { controls: { driver: order as never } }),
    });
  const jobs = (s: Snapshot) => decide(s).filter((a) => a.kind === "control" && a.worker === "driver");
  const order = (seq: number, job: object) => ({ kind: "control", worker: "driver", message: { seq, job } });

  test("hands a new driver its first job, the options, as order 1", () => {
    expect(jobs(driving(news()))).toEqual([order(1, { kind: "options" })]);
  });

  test("waits while the driver hasn't reported yet, or hasn't finished the order on its port", () => {
    expect(jobs(driving(undefined))).toEqual([]);
    expect(jobs(driving(news(), { seq: 1, job: { kind: "options" } }))).toEqual([]);
  });

  test("hands over the next job once the driver reports the last one done", () => {
    const done1 = news({ done: 1, optionsSet: true }, 250_000);
    expect(jobs(driving(done1, { seq: 1, job: { kind: "options" } }))).toEqual([order(2, { kind: "tor" })]);
  });

  test("a driver started again redoes the order waiting on its port before anything new", () => {
    expect(jobs(driving(news({}, 1e9), { seq: 3, job: { kind: "tor" } }))).toEqual([]);
  });

  test("writes nothing while there is nothing to do", () => {
    const waiting = news({ done: 2, optionsSet: true }, 100);
    expect(jobs(driving(waiting, { seq: 2, job: { kind: "options" } }))).toEqual([]);
  });
});
