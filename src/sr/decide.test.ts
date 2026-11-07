import { describe, expect, test } from "vitest";
import { decide } from "./decide.ts";

describe("decide", () => {
  test("has nothing to do yet: the heartbeat conductor only waits", () => {
    expect(decide({ nowMs: 1_700_000_000_000 })).toEqual([]);
  });
});
