import { describe, expect, test } from "vitest";
import { decide, place, type Snapshot } from "./decide.ts";
import { CALLS, PROBES, WORKERS, type HelperScript } from "./helpers.ts";
import { NEUTRAL_MULTS } from "./formulas.ts";
import { ORDERS_OFF, SPLIT_MONEY, type EngineOrders } from "./money-engine.ts";

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
    controls: {},
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

describe("decide: the sleeves probe", () => {
  const SLEEVES = PROBES.sleeves.script;
  const T = 1_700_000_000_000;
  const route = (currentNode: number, ownedSF: Record<number, number> = {}) =>
    ({ ok: true, value: { currentNode, ownedSF, lastAugReset: T, lastNodeReset: T }, atMs: T }) as const;
  const sleevesWanted = (probes: Snapshot["probes"]) =>
    decide(snap({ nowMs: T, probes, freeRamGb: { home: 64 }, helperRamGb: { [SLEEVES]: 5.6 } })).some(
      (a) => a.kind === "probe" && a.name === "sleeves",
    );

  test("is not launched until the route is known, nor without SF10 outside BN10", () => {
    expect(sleevesWanted({})).toBe(false);
    expect(sleevesWanted({ route: route(1, { 1: 3, 4: 3 }) })).toBe(false);
  });

  test("is launched in BN10 and anywhere once SF10 is owned", () => {
    expect(sleevesWanted({ route: route(10) })).toBe(true);
    expect(sleevesWanted({ route: route(2, { 10: 1 }) })).toBe(true);
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
      for (const a of decide(s)) if ("host" in a) expect(freeRamGb[a.host]).toBeGreaterThanOrEqual(cost);
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
  const route = (currentNode: number) => ({ ok: true, value: { currentNode, ownedSF: { 1: 3, 4: 3 }, lastAugReset: NOW, lastNodeReset: NOW }, atMs: NOW }) as const;
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
    // (Outside BN8 the money engine's orders are written; no trader.)
    expect(decide(bn8({ probes: { network, route: route(1), market: market(true) } })).filter((a) => a.kind === "start")).toEqual([]);
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

describe("decide: rooting servers", () => {
  const ROOT = CALLS.root!;
  const NOW = 1_700_000_000_000;
  const network = (hosts: string[]) => ({ ok: true, value: { hosts }, atMs: NOW }) as const;
  /** Fresh-save numbers: the conductor on an 8 GB home, n00dles already rooted. */
  const fresh = (over: Partial<Snapshot> = {}) =>
    snap({
      nowMs: NOW,
      freeRamGb: { home: 4.15, "n00dles": 4 },
      helperRamGb: { [NETWORK]: 1.8, [ROOT]: 1.9 },
      probes: { network: network(["home", "n00dles", "foodnstuff", "CSEC"]) },
      ...over,
    });
  const rootCall = { kind: "call", script: ROOT, arg: { hosts: ["CSEC", "foodnstuff"] }, host: "home" } as const;

  test("tries to root every server the network probe found that isn't rooted yet", () => {
    expect(decide(fresh())).toEqual([rootCall]);
  });

  test("tries again 10 s after its last try, not before", () => {
    const last = (atMs: number) => ({ script: ROOT, arg: rootCall.arg, atMs, reply: { ok: true, value: { rooted: [] } } }) as const;
    expect(decide(fresh({ lastCall: last(NOW - 9_999) }))).toEqual([]);
    expect(decide(fresh({ lastCall: last(NOW - 10_000) }))).toEqual([rootCall]);
  });

  test("does nothing once every server it knows of is rooted", () => {
    const freeRamGb = { home: 4.15, "n00dles": 4, "foodnstuff": 16, "CSEC": 8 };
    expect(decide(fresh({ freeRamGb }))).toEqual([]);
  });
});

describe("decide: the money engine", () => {
  const ENGINE = WORKERS.engine.script;
  const NOW = 1_700_000_000_000;
  const reading = <T,>(value: T) => ({ ok: true, value, atMs: NOW }) as const;
  const route = (currentNode: number) => reading({ currentNode, ownedSF: {}, lastAugReset: NOW, lastNodeReset: NOW });
  const COSTS = {
    [NETWORK]: 1.8,
    [PROBES.route.script]: 2.6,
    [PROBES.stats.script]: 2.15,
    [PROBES.market.script]: 1.65,
    [PROBES.sleeves.script]: 5.6,
    [CALLS.root!]: 1.9,
    [ENGINE]: 4.65,
  };
  /** BN1 a few seconds in: every probe fresh, the 0-port servers rooted. */
  const bn1 = (over: Partial<Snapshot> = {}) =>
    snap({
      nowMs: NOW,
      freeRamGb: { home: 4.15, "n00dles": 4, "foodnstuff": 16, "sigma-cosmetics": 16 },
      helperRamGb: COSTS,
      probes: {
        network: reading({ hosts: ["home", "n00dles", "foodnstuff", "sigma-cosmetics"] }),
        route: route(1),
        stats: reading({ hack: 1, money: 1000, M: 1, homeRam: 8, city: "Sector-12", casinoWinnings: 0 }),
        market: reading({ hasTixApi: false }),
      },
      ...over,
    });
  // The reserve is the dearest probe or action helper that may run: the route
  // probe's 2.6 GB (the sleeves probe only runs in BN10 or with SF10).
  const MONEY = { split: SPLIT_MONEY, homeReserveGb: 2.6, mults: NEUTRAL_MULTS };
  const control = (message: EngineOrders) => ({ kind: "control", worker: "engine", message }) as const;
  const start = (host: string) => ({ kind: "start", worker: "engine", arg: { control: WORKERS.engine.control }, host }) as const;
  const running = { engine: { running: true, failures: 0 } };

  test("writes the money split to the engine's control port and starts the engine on the first rooted 16 GB server", () => {
    // Home has 4.15 GB free: the engine fits, but not with the reserve beside it.
    expect(decide(bn1())).toEqual([control(MONEY), start("foodnstuff")]);
  });

  test("writes the orders only when the port doesn't hold them already", () => {
    expect(decide(bn1({ controls: { engine: MONEY } }))).toEqual([start("foodnstuff")]);
    expect(decide(bn1({ controls: { engine: MONEY }, workers: running }))).toEqual([]);
    const stale = { split: SPLIT_MONEY, homeReserveGb: 1.8, mults: NEUTRAL_MULTS };
    expect(decide(bn1({ controls: { engine: stale }, workers: running }))).toEqual([control(MONEY)]);
  });

  test("starts the engine on home once home has room for it and the reserve", () => {
    const freeRamGb = (home: number) => ({ home, "n00dles": 4, "foodnstuff": 16, "sigma-cosmetics": 16 });
    expect(decide(bn1({ controls: { engine: MONEY }, freeRamGb: freeRamGb(7.25) }))).toEqual([start("home")]);
    expect(decide(bn1({ controls: { engine: MONEY }, freeRamGb: freeRamGb(7.24) }))).toEqual([start("foodnstuff")]);
  });

  test("waits for a server the engine fits on", () => {
    const probes = { ...bn1().probes, network: reading({ hosts: ["home", "n00dles"] }) };
    expect(decide(bn1({ probes, controls: { engine: MONEY }, freeRamGb: { home: 4.15, "n00dles": 4 } }))).toEqual([]);
  });

  test("relaunches a dead engine after the backoff, like any worker", () => {
    const died = (atMs: number) => ({ engine: { running: false, failures: 2, lastFailAtMs: atMs } });
    expect(decide(bn1({ controls: { engine: MONEY }, workers: died(NOW - 1_999) }))).toEqual([]);
    expect(decide(bn1({ controls: { engine: MONEY }, workers: died(NOW - 2_000) }))).toEqual([start("foodnstuff")]);
  });

  test("switches the engine off over the port in BN8, where hacking earns no money, and doesn't start it", () => {
    const bn8 = { ...bn1().probes, route: route(8) };
    expect(decide(bn1({ probes: bn8, controls: { engine: MONEY }, workers: running }))).toEqual([control(ORDERS_OFF)]);
    expect(decide(bn1({ probes: bn8 }))).toEqual([]);
  });

  test("and on again when the money split is wanted", () => {
    expect(decide(bn1({ controls: { engine: ORDERS_OFF }, workers: running }))).toEqual([control(MONEY)]);
  });

  test("leaves the engine off until the route probe has said where the run is", () => {
    const { route: _unread, ...probes } = bn1().probes;
    expect(decide(bn1({ probes, probesInFlight: ["route"] }))).toEqual([]);
  });

  test("counts the sleeves probe in the reserve where it runs", () => {
    const bn10 = { ...bn1().probes, route: route(10), sleeves: reading({ count: 1 }) };
    const orders = { split: SPLIT_MONEY, homeReserveGb: 5.6, mults: NEUTRAL_MULTS };
    expect(decide(bn1({ probes: bn10, controls: { engine: orders }, workers: running }))).toEqual([]);
  });
});

describe("decide: the BitNode multipliers the engine is given", () => {
  const NOW = 1_700_000_000_000;
  const BITNODE = PROBES.bitnode.script;
  const reading = <T,>(value: T) => ({ ok: true, value, atMs: NOW }) as const;
  const route = (currentNode: number, ownedSF: Record<number, number> = {}) =>
    reading({ currentNode, ownedSF, lastAugReset: NOW, lastNodeReset: NOW });
  const at = (probes: Snapshot["probes"]) =>
    snap({ nowMs: NOW, freeRamGb: { home: 64 }, helperRamGb: { [BITNODE]: 5.6, [WORKERS.engine.script]: 4.65 }, probes });
  const multsSent = (s: Snapshot) => {
    const control = decide(s).find((a) => a.kind === "control");
    return control?.kind === "control" ? (control.message as EngineOrders).mults : undefined;
  };
  const bitnodeWanted = (s: Snapshot) => decide(s).some((a) => a.kind === "probe" && a.name === "bitnode");

  test("BN1 without SF5: all 1, and no probe (getBitNodeMultipliers would throw)", () => {
    expect(multsSent(at({ route: route(1) }))).toEqual(NEUTRAL_MULTS);
    expect(bitnodeWanted(at({ route: route(1) }))).toBe(false);
  });

  test("BN4 without SF5: the parameter table (steal ×0.2, exp ×0.4, cloud softcap 1.2)", () => {
    expect(multsSent(at({ route: route(4, { 1: 1 }) }))).toEqual({
      ...NEUTRAL_MULTS, ScriptHackMoney: 0.2, HackExpGain: 0.4, CloudServerSoftcap: 1.2,
    });
  });

  test("with SF5, or in BN5, the probe reads them once, and its reading is what the engine gets", () => {
    expect(bitnodeWanted(at({ route: route(12, { 5: 1 }) }))).toBe(true);
    expect(bitnodeWanted(at({ route: route(5) }))).toBe(true);
    const bn12 = { ...NEUTRAL_MULTS, ScriptHackMoney: 0.55, CloudServerMaxRam: 0.5 };
    const read = at({ route: route(12, { 5: 1 }), bitnode: reading(bn12) });
    expect(multsSent(read)).toEqual(bn12);
    expect(bitnodeWanted({ ...read, nowMs: NOW + 3_600_000 })).toBe(false);
  });

  test("a failed reading is tried again and, meanwhile, BN1's values stand in", () => {
    const failed = { ok: false, error: "Requires Source-File 5 to run.", atMs: NOW } as const;
    const s = at({ route: route(12, { 5: 1 }), bitnode: failed });
    expect(multsSent(s)).toEqual(NEUTRAL_MULTS);
    expect(bitnodeWanted({ ...s, nowMs: NOW + 60_000 })).toBe(true);
  });
});
