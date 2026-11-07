import { describe, expect, test } from "vitest";
import { decide, place, type Snapshot } from "./decide.ts";
import { PROBES, WORKERS, type HelperScript } from "./helpers.ts";

const NETWORK = PROBES.network.script;

/** A snapshot of a fresh 8 GB home with the conductor on it; override any field. */
function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    nowMs: 1_700_000_000_000,
    freeRamGb: { home: 4.2 },
    helperRamGb: { [NETWORK]: 1.85 },
    probes: {},
    probesInFlight: [],
    callRunning: false,
    workers: {},
    ...over,
  };
}

describe("decide: probes", () => {
  test("launches the network probe on home when nothing has been probed yet", () => {
    expect(decide(snap())).toEqual([{ kind: "probe", name: "network", host: "home" }]);
  });

  test("does not launch a probe again while its reply is still on the way", () => {
    expect(decide(snap({ probesInFlight: ["network"] }))).toEqual([]);
  });

  test("leaves a fresh reading alone and probes again once it is 10 s old", () => {
    const reading = { ok: true, value: { hosts: [] }, atMs: 1_700_000_000_000 } as const;
    expect(decide(snap({ probes: { network: reading }, nowMs: reading.atMs + 9_999 }))).toEqual([]);
    expect(decide(snap({ probes: { network: reading }, nowMs: reading.atMs + 10_000 }))).toEqual([
      { kind: "probe", name: "network", host: "home" },
    ]);
  });

  test("probes again on the same schedule after a failed reply", () => {
    const failed = { ok: false, error: "boom", atMs: 1_700_000_000_000 } as const;
    expect(decide(snap({ probes: { network: failed }, nowMs: failed.atMs + 5_000 }))).toEqual([]);
    expect(decide(snap({ probes: { network: failed }, nowMs: failed.atMs + 10_000 }))).toHaveLength(1);
  });
});

describe("decide: only helpers that fit the free RAM", () => {
  test("puts a helper that doesn't fit on home on the rooted server with the most free RAM", () => {
    const freeRamGb = { home: 1.0, "n00dles": 4, "foodnstuff": 16, "sigma-cosmetics": 8 };
    expect(decide(snap({ freeRamGb }))).toEqual([{ kind: "probe", name: "network", host: "foodnstuff" }]);
  });

  test("uses a helper's exact cost: 1.85 GB fits in 1.85 GB free", () => {
    expect(decide(snap({ freeRamGb: { home: 1.85 } }))).toEqual([{ kind: "probe", name: "network", host: "home" }]);
  });

  test("launches nothing when the helper fits nowhere; it is decided again next loop", () => {
    expect(decide(snap({ freeRamGb: { home: 1.84, "n00dles": 0 } }))).toEqual([]);
  });

  test("launches nothing whose cost is unknown (the script is missing from home)", () => {
    expect(decide(snap({ helperRamGb: {} }))).toEqual([]);
    expect(decide(snap({ helperRamGb: { [NETWORK]: 0 } }))).toEqual([]);
  });

  test("never returns a helper that doesn't fit, over many random snapshots", () => {
    let seed = 47;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i++) {
      const freeRamGb: Record<string, number> = { home: Math.round(rand() * 400) / 100 };
      for (let h = 0; h < Math.floor(rand() * 4); h++) freeRamGb[`s${h}`] = Math.round(rand() * 400) / 100;
      const cost = Math.round(rand() * 400) / 100;
      const s = snap({ freeRamGb, helperRamGb: { [NETWORK]: cost } });
      for (const a of decide(s)) expect(freeRamGb[a.host]).toBeGreaterThanOrEqual(cost);
    }
  });
});

describe("place: the RAM ledger and action helpers", () => {
  const BUY: HelperScript = "sr/h/test-buy.js";
  const SELL: HelperScript = "sr/h/test-sell.js";
  const buy = { kind: "call", script: BUY, arg: { n: 1 } } as const;
  const sell = { kind: "call", script: SELL, arg: null } as const;
  const costs = { [NETWORK]: 1.85, [BUY]: 3, [SELL]: 2 };

  test("counts RAM placed earlier in the same decision as used", () => {
    const s = snap({ freeRamGb: { home: 4, "n00dles": 2 }, helperRamGb: costs });
    expect(place(s, [{ kind: "probe", name: "network" }, { kind: "call", script: SELL, arg: null }])).toEqual([
      { kind: "probe", name: "network", host: "home" },
      { ...sell, host: "home" },
    ]);
    expect(place(s, [buy, { kind: "probe", name: "network" }])).toEqual([
      { ...buy, host: "home" },
      { kind: "probe", name: "network", host: "n00dles" },
    ]);
  });

  test("places at most one action helper per decision", () => {
    const s = snap({ freeRamGb: { home: 100 }, helperRamGb: costs });
    expect(place(s, [buy, sell])).toEqual([{ ...buy, host: "home" }]);
  });

  test("skips an action helper that doesn't fit and places the next one that does", () => {
    const s = snap({ freeRamGb: { home: 2.5 }, helperRamGb: costs });
    expect(place(s, [buy, sell])).toEqual([{ ...sell, host: "home" }]);
  });

  test("places no action helper while another is still running, but still places probes", () => {
    const s = snap({ freeRamGb: { home: 100 }, helperRamGb: costs, callRunning: true });
    expect(place(s, [buy, { kind: "probe", name: "network" }])).toEqual([
      { kind: "probe", name: "network", host: "home" },
    ]);
  });
});

describe("decide: the BN8 trader", () => {
  const TRADER = WORKERS.trader.script;
  const MARKET = PROBES.market.script;
  const ROUTE = PROBES.route.script;
  const NOW = 1_700_000_000_000;
  const market = (hasTixApi: boolean) => ({ ok: true, value: { hasTixApi }, atMs: NOW }) as const;
  const route = (currentNode: number) => ({ ok: true, value: { currentNode, ownedSF: { 1: 3, 4: 3 } }, atMs: NOW }) as const;
  const network = { ok: true, value: { hosts: ["home"] }, atMs: NOW } as const;
  /** BN8 with TIX access, every probe fresh, room for the trader on home. */
  const bn8 = (over: Partial<Snapshot> = {}) =>
    snap({
      freeRamGb: { home: 64 },
      helperRamGb: { [NETWORK]: 1.8, [ROUTE]: 2.6, [MARKET]: 1.65, [TRADER]: 26.75 },
      probes: { network, route: route(8), market: market(true) },
      ...over,
    });
  const start = { kind: "start", worker: "trader", arg: null, host: "home" } as const;

  test("starts the trader in BN8 once TIX access is there", () => {
    expect(decide(bn8())).toEqual([start]);
  });

  test("starts no trader outside BN8, without TIX access, or before both are read", () => {
    expect(decide(bn8({ probes: { network, route: route(1), market: market(true) } }))).toEqual([]);
    expect(decide(bn8({ probes: { network, route: route(8), market: market(false) } }))).toEqual([]);
    expect(decide(bn8({ probes: { network, route: route(8) }, probesInFlight: ["market"] }))).toEqual([]);
    expect(decide(bn8({ probes: { network, market: market(true) }, probesInFlight: ["route"] }))).toEqual([]);
    const failed = { ok: false, error: "boom", atMs: NOW } as const;
    expect(decide(bn8({ probes: { network, route: route(8), market: failed } }))).toEqual([]);
  });

  test("leaves a running trader alone, also one this conductor didn't start", () => {
    expect(decide(bn8({ workers: { trader: { running: true, failures: 0 } } }))).toEqual([]);
  });

  test("starts it again after a reload: the new conductor has no record of it", () => {
    expect(decide(bn8({ workers: {} }))).toEqual([start]);
  });

  test("relaunches a trader that died after the backoff: 4 s after its third failure in a row", () => {
    const died = (atMs: number) => ({ trader: { running: false, failures: 3, lastFailAtMs: atMs } });
    expect(decide(bn8({ workers: died(NOW - 3_999) }))).toEqual([]);
    expect(decide(bn8({ workers: died(NOW - 4_000) }))).toEqual([start]);
  });

  test("puts the trader where it fits, after the probes, and drops it when it fits nowhere", () => {
    const probes = { network: { ...network, atMs: NOW - 60_000 }, route: route(8), market: market(true) };
    expect(decide(bn8({ probes, freeRamGb: { home: 20, "big-1": 32 } }))).toEqual([
      { kind: "probe", name: "network", host: "home" },
      { ...start, host: "big-1" },
    ]);
    expect(decide(bn8({ freeRamGb: { home: 20, "n00dles": 4 } }))).toEqual([]);
  });
});
