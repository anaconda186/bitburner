import { describe, expect, test } from "vitest";
import { decide, place, type Snapshot } from "./decide.ts";
import { PROBES, type HelperScript } from "./helpers.ts";

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
