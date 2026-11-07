import { describe, expect, test } from "vitest";
import type { Snapshot } from "./decide.ts";
import { MILESTONES, milestonesReached, registry, scoped, SPINE, type Milestone } from "./milestones.ts";
import type { RouteFacts } from "./order.ts";

const T0 = 1_700_000_000_000;

/** A snapshot whose route probe read `route` (or nothing yet); override any field. */
function snap(route: RouteFacts | null, over: Partial<Snapshot> = {}): Snapshot {
  return {
    nowMs: T0,
    freeRamGb: { home: 4 },
    helperRamGb: {},
    probes: route === null ? {} : { route: { ok: true, value: route, atMs: T0 } },
    probesInFlight: [],
    callRunning: false,
    ...over,
  };
}

const inBN = (currentNode: number, ownedSF: Record<number, number> = {}): RouteFacts => ({ currentNode, ownedSF });

describe("spine milestones", () => {
  test("are bn<N>.<L>, one per destruction of the order, first to last", () => {
    const names = SPINE.map((m) => m.name);
    expect(names).toHaveLength(45);
    expect(names.slice(0, 5)).toEqual(["bn1.1", "bn4.1", "bn4.2", "bn4.3", "bn5.1"]);
    expect(names.at(-1)).toBe("bn15.3");
  });

  test("none is reached on a fresh save", () => {
    expect(milestonesReached(MILESTONES, snap(inBN(1)), [])).toEqual([]);
  });

  test("bn<N>.<L> is reached once the game shows SF N at level L, in the next BitNode", () => {
    expect(milestonesReached(MILESTONES, snap(inBN(4, { 1: 1 })), [])).toEqual(["bn1.1"]);
    expect(milestonesReached(MILESTONES, snap(inBN(4, { 1: 1, 4: 1 })), ["bn1.1"])).toEqual(["bn4.1"]);
  });

  test("the last one is reached at the finish line", () => {
    const all = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, 3]));
    const before = SPINE.map((m) => m.name).filter((n) => n !== "bn15.3");
    expect(milestonesReached(MILESTONES, snap(inBN(15, all)), before)).toEqual(["bn15.3"]);
  });
});

describe("recording milestones", () => {
  test("a milestone is due only the first time its test passes", () => {
    const s = snap(inBN(4, { 1: 1 }));
    expect(milestonesReached(MILESTONES, s, [])).toEqual(["bn1.1"]);
    expect(milestonesReached(MILESTONES, s, ["bn1.1"])).toEqual([]);
  });

  test("nothing is due before the route probe has read the game, or when its reading failed", () => {
    expect(milestonesReached(MILESTONES, snap(null), [])).toEqual([]);
    const failed = snap(null, { probes: { route: { ok: false, error: "boom", atMs: T0 } } });
    expect(milestonesReached(MILESTONES, failed, [])).toEqual([]);
  });

  test("each test is checked on its own: a later one is due even when an earlier one never passed", () => {
    const money = (min: number) => (s: Snapshot) => s.freeRamGb.home! >= min;
    const plan = registry([scoped(1, 1, "small", money(2)), scoped(1, 1, "big", money(100)), scoped(1, 1, "mid", money(3))]);
    expect(milestonesReached(plan, snap(inBN(1)), [])).toEqual(["bn1.1:small", "bn1.1:mid"]);
  });
});

describe("plan extras", () => {
  const casino = scoped(1, 1, "casino", () => true);
  const joined = scoped(6, undefined, "joined", () => true);
  const plan = registry(SPINE, [casino, joined]);

  test("are named after the BitNode they belong to", () => {
    expect(casino.name).toBe("bn1.1:casino");
    expect(joined.name).toBe("bn6.joined");
  });

  test("are checked only while the run is playing their BitNode (and level, when given)", () => {
    expect(milestonesReached(plan, snap(inBN(1)), [])).toEqual(["bn1.1:casino"]);
    // BN1.2: the BitNode matches but the level doesn't.
    expect(milestonesReached(plan, snap(inBN(1, { 1: 1, 4: 3, 5: 1 })), ["bn1.1", "bn4.1", "bn4.2", "bn4.3", "bn5.1"])).toEqual([]);
    // BN6 at any level.
    expect(milestonesReached(plan, snap(inBN(6, { 6: 1 })), [])).toEqual(["bn6.1", "bn6.joined"]);
  });

  test("a skipped extra is just absent: once the run has left its BitNode it is never due", () => {
    const skipped = registry(SPINE, [scoped(1, 1, "casino", (s) => s.freeRamGb.home! > 1e9)]);
    expect(milestonesReached(skipped, snap(inBN(1)), [])).toEqual([]);
    expect(milestonesReached(skipped, snap(inBN(4, { 1: 1 }), { freeRamGb: { home: 2e9 } }), [])).toEqual(["bn1.1"]);
  });

  test("a registry refuses two milestones with one name", () => {
    const twice: Milestone = scoped(1, 1, "casino", () => false);
    expect(() => registry([casino], [twice])).toThrow(/bn1\.1:casino/);
  });
});
