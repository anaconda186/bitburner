import { describe, expect, it } from "vitest";
import { CASINO_HOST_RAM_GB } from "../src/sr/blackjack.ts";
import { DRIVER_HOST_RAM_GB } from "../src/sr/decide.ts";
import { RAM_BUDGETS } from "./ram-budget.ts";

describe("RAM_BUDGETS", () => {
  it("lets the conductor fit beside boot.js on an 8 GB home (spec #41)", () => {
    const boot = RAM_BUDGETS["boot.js"]?.budget ?? Infinity;
    const conductor = RAM_BUDGETS["sr/conductor.js"]?.budget ?? Infinity;
    expect(boot + conductor).toBeLessThanOrEqual(8);
  });

  it("lets the driver fit its 32 GB cloud server (spec #41)", () => {
    expect(RAM_BUDGETS["sr/h/driver.js"]?.budget ?? Infinity).toBeLessThanOrEqual(DRIVER_HOST_RAM_GB);
  });

  it("lets the casino fit its 64 GB cloud server (spec #41)", () => {
    expect(RAM_BUDGETS["sr/h/casino.js"]?.budget ?? Infinity).toBeLessThanOrEqual(CASINO_HOST_RAM_GB);
  });
});
