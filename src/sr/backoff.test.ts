import { describe, expect, test } from "vitest";
import { backoffMs } from "./backoff.ts";

describe("backoffMs", () => {
  test("waits a second after the first failure and doubles after each further one", () => {
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  test("never waits more than 30 s, however many failures in a row", () => {
    expect(backoffMs(6)).toBe(30_000);
    expect(backoffMs(1000)).toBe(30_000);
  });
});
