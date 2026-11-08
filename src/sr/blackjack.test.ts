import { describe, expect, test } from "vitest";
import { cardValue, readCount, shouldHit } from "./blackjack.ts";

describe("shouldHit: basic strategy without doubles or splits (the dealer stands on soft 17)", () => {
  test("a hard 11 or less always hits, a hard 17 or more always stands", () => {
    for (const up of [2, 6, 7, 10, 11]) {
      expect(shouldHit([11], up)).toBe(true);
      expect(shouldHit([5], up)).toBe(true);
      expect(shouldHit([17], up)).toBe(false);
      expect(shouldHit([20], up)).toBe(false);
    }
  });

  test("a hard 12 stands only against a 4, 5 or 6", () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((up) => shouldHit([12], up))).toEqual(
      [true, true, false, false, false, true, true, true, true, true],
    );
  });

  test("a hard 13 to 16 stands against 2 to 6 and hits against 7 or more", () => {
    for (const total of [13, 14, 15, 16]) {
      expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((up) => shouldHit([total], up))).toEqual(
        [false, false, false, false, false, true, true, true, true, true],
      );
    }
  });

  test("a soft 17 or less hits, a soft 18 hits only against 9, 10 or an ace, a soft 19 stands", () => {
    for (const up of [2, 6, 8, 9, 10, 11]) {
      expect(shouldHit([7, 17], up)).toBe(true);
      expect(shouldHit([2, 12], up)).toBe(true);
      expect(shouldHit([8, 18], up)).toBe(up >= 9);
      expect(shouldHit([9, 19], up)).toBe(false);
    }
  });
});

describe("reading the table", () => {
  test("the player's Count line gives every value shown", () => {
    expect(readCount("Count: 14")).toEqual([14]);
    expect(readCount("Count: 7 or 17")).toEqual([7, 17]);
    expect(readCount("Count: 3 or 13 or 23")).toEqual([3, 13, 23]);
  });

  test("a Count line that isn't one reads as nothing", () => {
    expect(readCount("Count: ")).toBeUndefined();
    expect(readCount("Dealer")).toBeUndefined();
  });

  test("a face card is 10, an ace 11, a number its value, a hidden card nothing", () => {
    expect(["A", "K", "Q", "J", "10", "2", "9"].map(cardValue)).toEqual([11, 10, 10, 10, 10, 2, 9]);
    expect(cardValue(" - ")).toBeUndefined();
    expect(cardValue("1")).toBeUndefined();
  });
});
