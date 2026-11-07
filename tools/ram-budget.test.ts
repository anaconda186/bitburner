import { describe, expect, it } from "vitest";
import { RAM_BUDGETS } from "./ram-budget.ts";

describe("RAM_BUDGETS", () => {
  it("lets the conductor fit beside boot.js on an 8 GB home (spec #41)", () => {
    const boot = RAM_BUDGETS["boot.js"]?.budget ?? Infinity;
    const conductor = RAM_BUDGETS["sr/conductor.js"]?.budget ?? Infinity;
    expect(boot + conductor).toBeLessThanOrEqual(8);
  });
});
