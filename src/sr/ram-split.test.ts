// Seam A: the RAM split rule (spec #41 user story 62, #22's "How spare RAM is
// split"). A point in the reset in, the engine's split out.
import { describe, expect, test } from "vitest";
import { ramSplit, SPLIT_TUNABLES } from "./ram-split.ts";

describe("the RAM split at each point in the reset", () => {
  test("its tunables start at #22's modelled values", () => {
    expect(SPLIT_TUNABLES).toEqual({ expStartMs: 600_000, shareFraction: 0.25, donateFavor: 150 });
  });

  test("off: nothing", () => {
    expect(ramSplit({ kind: "off" })).toEqual({ money: 0, exp: 0, sharing: 0 });
  });

  test("right after buying the fleet: all exp", () => {
    expect(ramSplit({ kind: "expStart" })).toEqual({ money: 0, exp: 1, sharing: 0 });
  });

  test("saving for planned purchases: all money", () => {
    expect(ramSplit({ kind: "saving" })).toEqual({ money: 1, exp: 0, sharing: 0 });
  });

  test("working for rep under 150 favor: about 25% share, the rest exp", () => {
    expect(ramSplit({ kind: "working", favor: 0 })).toEqual({ money: 0, exp: 0.75, sharing: 0.25 });
    expect(ramSplit({ kind: "working", favor: 149.9 })).toEqual({ money: 0, exp: 0.75, sharing: 0.25 });
  });

  test("working for rep at 150 favor: all money (to donate)", () => {
    expect(ramSplit({ kind: "working", favor: 150 })).toEqual({ money: 1, exp: 0, sharing: 0 });
  });

  test("the final climb: all exp", () => {
    expect(ramSplit({ kind: "climb" })).toEqual({ money: 0, exp: 1, sharing: 0 });
  });

  test("the share fraction and the favor line are tunables", () => {
    const t = { ...SPLIT_TUNABLES, shareFraction: 0.1, donateFavor: 75 };
    expect(ramSplit({ kind: "working", favor: 74 }, t)).toEqual({ money: 0, exp: 0.9, sharing: 0.1 });
    expect(ramSplit({ kind: "working", favor: 75 }, t)).toEqual({ money: 1, exp: 0, sharing: 0 });
  });
});
