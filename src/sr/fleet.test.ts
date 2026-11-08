// Seam A: the fleet rule (spec #41 user story 63). A snapshot in, the one
// purchase out. Prices are worked by hand from ns.cloud.getServerCost:
// ram × $55,000 × CloudServerCost × CloudServerSoftcap^(log2(ram) − 6).
import { describe, expect, test } from "vitest";
import { decide, engineOrders, type Snapshot } from "./decide.ts";
import { FLEET_TUNABLES, fleetWant } from "./fleet.ts";
import type { Json } from "./helper-contract.ts";
import { CALLS, PROBES, WORKERS } from "./helpers.ts";

const NOW = 1_700_000_000_000;
const BUY = CALLS.buyServer!;
const UPGRADE = CALLS.fleetUpgrade!;
const reading = <T,>(value: T, atMs = NOW) => ({ ok: true, value, atMs }) as const;
/** BN1.2 unless told otherwise: past BN1.1, so no driver and sr-00 is a slot like any. */
const route = (currentNode: number, ownedSF: Record<number, number> = { 1: 1 }) =>
  reading({ currentNode, ownedSF, lastAugReset: NOW, lastNodeReset: NOW });
type Server = { host: string; ramGb: number };
const fleet = (servers: Server[], money = 1e12, limit = 25) =>
  reading({ readAtMs: NOW, servers, limit, ramLimitGb: 1_048_576, money });

/**
 * The engine's outlook: on a 1,000 GB pool it models $1m/s, and $1.8m/s on
 * twice that, so the next GB earns (1.8m − 1m)/1000 = $800/s.
 */
const OUTLOOK = { target: "phantasy", poolGb: 1000, incomePerSec: 1e6, incomeAt2xPerSec: 1.8e6 };

/** BN1.2, everything fresh, the engine running with its orders in place, home roomy. */
function snap(servers: Server[], over: Partial<Snapshot> & { money?: number; outlook?: Json } = {}): Snapshot {
  const { money, outlook, ...rest } = over;
  const engineReport = { pid: 7, atMs: NOW, value: { outlook: outlook === undefined ? OUTLOOK : outlook } };
  const base: Snapshot = {
    nowMs: NOW,
    freeRamGb: { home: 64 },
    helperRamGb: { [BUY]: 3.85, [UPGRADE]: 1.85, [PROBES.fleet.script]: 2.9 },
    probes: {
      network: reading({ hosts: ["home"] }),
      route: route(1),
      stats: reading({ hack: 300, money: 1e12, M: 1, homeRam: 64, city: "Sector-12", casinoWinnings: 0 }),
      market: reading({ hasTixApi: false }),
      fleet: fleet(servers, money),
    },
    probesInFlight: [],
    callRunning: false,
    workers: { engine: { running: true, failures: 0, report: engineReport } },
    controls: {},
    ...rest,
  };
  // The engine's orders already on its port, so the only want is the purchase.
  const orders = decide({ ...base, workers: {} }).find((a) => a.kind === "control");
  return { ...base, controls: orders?.kind === "control" ? { engine: orders.message } : {} };
}

const calls = (s: Snapshot) => decide(s).filter((a) => a.kind === "call");
const slots = (n: number, ramGb: number, from = 0): Server[] =>
  Array.from({ length: n }, (_, i) => ({ host: `sr-${String(from + i).padStart(2, "0")}`, ramGb }));

describe("the fleet: the cheapest doubling across the slots", () => {
  test("doubles the smallest server when every slot is taken", () => {
    const servers = [...slots(24, 64), { host: "sr-24", ramGb: 16 }];
    expect(calls(snap(servers))).toEqual([
      { kind: "call", script: UPGRADE, arg: { host: "sr-24", ram: 32 }, host: "home" },
    ]);
  });

  test("buys an empty slot at the size of the smallest server", () => {
    // Buying sr-01 at 32 ($1.76m) costs the same as doubling sr-00, and a new
    // slot wins the tie.
    expect(calls(snap([{ host: "sr-00", ramGb: 32 }]))).toEqual([
      { kind: "call", script: BUY, arg: { host: "sr-01", ram: 32 }, host: "home" },
    ]);
  });

  test("starts an empty fleet at the base size, in the first slot", () => {
    expect(calls(snap([]))).toEqual([
      { kind: "call", script: BUY, arg: { host: "sr-00", ram: FLEET_TUNABLES.baseRamGb }, host: "home" },
    ]);
  });

  test("in BN1.1 sr-00 is the driver's: never bought here, its slot kept free, doubled once it is there", () => {
    const bn11 = (servers: Server[]) => {
      const s = snap(servers);
      return { ...s, probes: { ...s.probes, route: route(1, {}) } };
    };
    // The driver buys sr-00 itself (at 32 GB), and that is the one call.
    expect(calls(bn11([]))).toEqual([{ kind: "call", script: BUY, arg: { host: "sr-00", ram: 32 }, host: "home" }]);
    const want = (s: Snapshot) => fleetWant(s, engineOrders(s), ["sr-00"]);
    expect(want(bn11([]))).toEqual({ kind: "call", script: BUY, arg: { host: "sr-01", ram: FLEET_TUNABLES.baseRamGb } });
    // 24 of 25 taken and no sr-00: the last slot waits for the driver, so it doubles instead.
    expect(want(bn11(slots(24, 64, 1)))).toEqual({ kind: "call", script: UPGRADE, arg: { host: "sr-01", ram: 128 } });
    // Once sr-00 is there it is doubled like any other.
    expect(want(bn11([...slots(24, 64, 1), { host: "sr-00", ramGb: 32 }]))).toEqual({
      kind: "call", script: UPGRADE, arg: { host: "sr-00", ram: 64 },
    });
  });

  test("goes no higher than the game's RAM limit", () => {
    const top = reading({ readAtMs: NOW, servers: slots(25, 1_048_576), limit: 25, ramLimitGb: 1_048_576, money: 1e15 });
    expect(calls({ ...snap([]), probes: { ...snap([]).probes, fleet: top } })).toEqual([]);
  });

  test("weighs BN4's softcap: past 64 GB a doubling costs more per GB than a new 64 GB slot", () => {
    // BN4 (no SF5: the parameter table): CloudServerSoftcap 1.2. Doubling a
    // 64 to 128 costs 128·55,000·1.2 − 64·55,000 = $4.93m; a new 64 is $3.52m.
    const s = snap([{ host: "sr-00", ramGb: 64 }]);
    const bn4 = { ...s, probes: { ...s.probes, route: route(4) } };
    const orders = decide({ ...bn4, workers: {} }).find((a) => a.kind === "control");
    const ready = { ...bn4, controls: orders?.kind === "control" ? { engine: orders.message } : {} };
    expect(calls(ready)).toEqual([{ kind: "call", script: BUY, arg: { host: "sr-01", ram: 64 }, host: "home" }]);
  });
});

describe("the fleet: payback and money", () => {
  // Doubling sr-24 from 16 to 32 GB costs $880k and adds 16 GB at $800/s per
  // GB: $12,800/s, so it pays back in 68.75 s.
  const servers = [...slots(24, 64), { host: "sr-24", ramGb: 16 }];

  test("buys when the doubling pays back within the tunable 10 minutes", () => {
    expect(FLEET_TUNABLES.paybackS).toBe(600);
    expect(calls(snap(servers))).toHaveLength(1);
  });

  test("skips it when the payback is longer", () => {
    // At $20/s per GB the 16 GB earn $320/s: 2,750 s.
    const slow = { ...OUTLOOK, incomeAt2xPerSec: OUTLOOK.incomePerSec + 20 * OUTLOOK.poolGb };
    expect(calls(snap(servers, { outlook: slow }))).toEqual([]);
    // Exactly 600 s still buys: $880k / 600 s / 16 GB = $91.67/s per GB.
    const edge = { ...OUTLOOK, incomeAt2xPerSec: OUTLOOK.incomePerSec + (880_000 / 600 / 16) * OUTLOOK.poolGb };
    expect(calls(snap(servers, { outlook: edge }))).toHaveLength(1);
  });

  test("skips it without an outlook from the engine, or when more RAM would earn nothing more", () => {
    expect(calls(snap(servers, { outlook: null }))).toEqual([]);
    expect(calls(snap(servers, { outlook: { ...OUTLOOK, incomeAt2xPerSec: OUTLOOK.incomePerSec } }))).toEqual([]);
  });

  test("skips it when the money isn't there", () => {
    expect(calls(snap(servers, { money: 879_999 }))).toEqual([]);
    expect(calls(snap(servers, { money: 880_000 }))).toHaveLength(1);
  });

  test("skips it when the money is set aside for planned augmentations", () => {
    const s = snap(servers, { money: 1e6 });
    expect(fleetWant(s, engineOrders(s), [], 0)).toMatchObject({ script: UPGRADE, arg: { host: "sr-24", ram: 32 } });
    expect(fleetWant(s, engineOrders(s), [], 120_001)).toBeUndefined();
    expect(fleetWant(s, engineOrders(s), [], 120_000)).toBeDefined();
  });
});

describe("the fleet: one purchase per action", () => {
  const servers = [...slots(24, 64), { host: "sr-24", ramGb: 16 }];
  const bought = (atMs: number) =>
    ({ script: UPGRADE, arg: { host: "sr-24", ram: 32 }, atMs, reply: { ok: true, value: "sr-24" } }) as const;

  test("waits for a fleet reading taken after its last purchase, and asks for one at once", () => {
    const s = snap(servers, { lastCall: bought(NOW + 1) });
    expect(calls(s)).toEqual([]);
    expect(decide(s)).toContainEqual({ kind: "probe", name: "fleet", host: "home" });
  });

  test("buys again once that reading is in", () => {
    const s = snap(servers, { lastCall: bought(NOW - 1) });
    expect(calls(s)).toHaveLength(1);
  });

  test("judges the reading by when the probe read the game, not when its reply was collected", () => {
    // Launched just before the purchase, collected just after it: stale.
    const s = snap(servers, { lastCall: bought(NOW + 1) });
    const collectedLate = { ...s, probes: { ...s.probes, fleet: { ...fleet(servers), atMs: NOW + 900 } } };
    expect(calls(collectedLate)).toEqual([]);
  });

  test("waits while a server this conductor bought isn't in the reading yet (the game would rename a second one)", () => {
    // #54: purchaseServer renames a taken name (sr-05-0) instead of failing.
    expect(calls(snap(servers, { boughtServers: ["sr-25"] }))).toEqual([]);
    expect(calls(snap(servers, { boughtServers: ["sr-24"] }))).toHaveLength(1);
  });

  test("buys nothing while the engine's orders are off (BN8, or the route not read yet)", () => {
    const s = snap(servers);
    expect(calls({ ...s, probes: { ...s.probes, route: route(8) } })).toEqual([]);
  });

  test("the probes it needs are registered: the fleet reading and the two purchase helpers", () => {
    expect(PROBES.fleet.script).toBe("sr/h/fleet.js");
    expect(BUY).toBe("sr/h/buy-server.js");
    expect(UPGRADE).toBe("sr/h/upgrade-server.js");
    expect(WORKERS.engine.script).toBe("sr/h/engine.js");
  });
});
