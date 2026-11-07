import { describe, expect, test } from "vitest";
import { BITNODE_ORDER, position } from "./order.ts";

// The order as spec #41 writes it (fixed front, enabler tier, draft back).
const SPEC_ORDER = [
  "1.1", "4.1", "4.2", "4.3",
  "5.1", "1.2", "1.3", "6.1", "10.1", "10.2", "10.3", "7.1", "7.2", "7.3", "9.1", "9.2",
  "5.2", "5.3", "12.1", "12.2", "12.3", "6.2", "6.3", "2.1", "2.2", "2.3", "3.1", "3.2", "3.3", "9.3",
  "8.1", "8.2", "8.3", "11.1", "11.2", "11.3", "13.1", "13.2", "13.3", "14.1", "14.2", "14.3",
  "15.1", "15.2", "15.3",
];

describe("the BitNode order", () => {
  test("is the spec's 45 destructions, in the spec's order", () => {
    expect(BITNODE_ORDER.map((e) => `${e.bn}.${e.level}`)).toEqual(SPEC_ORDER);
    expect(BITNODE_ORDER).toHaveLength(45);
  });

  test("raises each Source-File one level at a time and ends at the finish line, SF3 in every BitNode", () => {
    const owned: Record<number, number> = {};
    for (const { bn, level } of BITNODE_ORDER) {
      expect(level).toBe((owned[bn] ?? 0) + 1);
      owned[bn] = level;
    }
    expect(owned).toEqual({
      1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3, 11: 3, 12: 3, 13: 3, 14: 3, 15: 3,
    });
  });

  test("gives every entry its BitNode's finish", () => {
    const hacking = [1, 4, 5, 8, 11, 12];
    const blackOps = [2, 3, 6, 7, 9, 10, 13, 14, 15];
    for (const entry of BITNODE_ORDER) {
      if (hacking.includes(entry.bn)) expect(entry.finish).toBe("hacking");
      else if (blackOps.includes(entry.bn)) expect(entry.finish).toBe("blackops");
      else throw new Error(`BN${entry.bn} has no finish in the spec`);
    }
  });
});

/** The Source-Files owned after the first `n` destructions of the spec's order. */
function ownedAfter(n: number): Record<number, number> {
  const owned: Record<number, number> = {};
  for (const step of SPEC_ORDER.slice(0, n)) {
    const [bn, level] = step.split(".").map(Number) as [number, number];
    owned[bn] = level;
  }
  return owned;
}

const bnOf = (step: string): number => Number(step.split(".")[0]);
const named = (e: { bn: number; level: number } | null): string | null => (e === null ? null : `${e.bn}.${e.level}`);

describe("position", () => {
  test("at every point of the order, follows from the owned Source-Files and the current BitNode", () => {
    SPEC_ORDER.forEach((step, i) => {
      const at = position({ currentNode: bnOf(step), ownedSF: ownedAfter(i) });
      expect({ index: at.index, playing: named(at.playing), onRoute: at.onRoute, finished: at.finished }).toEqual({
        index: i,
        playing: step,
        onRoute: true,
        finished: false,
      });
      expect(named(at.next)).toBe(SPEC_ORDER[i + 1] ?? null);
    });
  });

  test("a fresh save is BN1.1, the first of 45, entering BN4 next", () => {
    const at = position({ currentNode: 1, ownedSF: {} });
    expect(at.index).toBe(0);
    expect(at.playing).toEqual({ bn: 1, level: 1, finish: "hacking" });
    expect(at.next).toEqual({ bn: 4, level: 1, finish: "hacking" });
  });

  test("past the last destruction the run is at the finish line, with nothing next", () => {
    const at = position({ currentNode: 7, ownedSF: ownedAfter(45) });
    expect(at.finished).toBe(true);
    expect(at.index).toBe(-1);
    expect(at.onRoute).toBe(false);
    expect(at.next).toBeNull();
  });

  test("off the order, the next BitNode is still the first destruction not yet owned", () => {
    // In BN5 with only SF1.1: BN5.1 comes later in the order, and BN4.1 is still due.
    const early = position({ currentNode: 5, ownedSF: { 1: 1 } });
    expect(named(early.playing)).toBe("5.1");
    expect(early.index).toBe(4);
    expect(early.onRoute).toBe(false);
    expect(named(early.next)).toBe("4.1");

    // A destruction that gives no new level (SF3 already at 3) is in no entry.
    const spent = position({ currentNode: 3, ownedSF: ownedAfter(29) });
    expect(spent.index).toBe(-1);
    expect(spent.onRoute).toBe(false);
    expect(named(spent.next)).toBe("9.3");
  });
});
