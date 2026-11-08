import { describe, expect, test } from "vitest";
import {
  betFor, capReached, cardValue, handOutcome, readCasinoArg, readCasinoNews, readCount, shouldHit, type CasinoNews,
} from "./blackjack.ts";

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

describe("the bet and the cap", () => {
  test("bets everything up to the table's $100m maximum, in whole dollars", () => {
    expect(betFor(300_000)).toBe(300_000);
    expect(betFor(98_765_432.9)).toBe(98_765_432);
    expect(betFor(100e6)).toBe(100e6);
    expect(betFor(4.2e9)).toBe(100e6);
  });

  test("has nothing to bet under $1", () => {
    expect(betFor(0.99)).toBe(0);
    expect(betFor(0)).toBe(0);
  });

  test("the cap is reached once net casino winnings since the install pass $10b, as the game counts it", () => {
    expect(capReached(9.9e9)).toBe(false);
    expect(capReached(10e9)).toBe(false);
    expect(capReached(10e9 + 1)).toBe(true);
  });
});

describe("handOutcome: how a hand went, from the money before Start and after the hand", () => {
  test("less money is a loss, the same a push, more a win", () => {
    expect(handOutcome(300_000, 0)).toBe("lost");
    expect(handOutcome(300_000, 300_000)).toBe("push");
    expect(handOutcome(300_000, 600_000)).toBe("won");
    expect(handOutcome(1e9, 1.15e9)).toBe("won");
  });
});

describe("the casino's argument", () => {
  test("plays in the Open category", () => {
    expect(readCasinoArg({ category: "open" })).toEqual({ ok: true, category: "open" });
  });

  test("refuses Strict (no faked clicks, no script reloads) and anything malformed", () => {
    const strict = readCasinoArg({ category: "strict" });
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error).toMatch(/Open/);
    for (const bad of [null, {}, { category: 1 }, "open"]) expect(readCasinoArg(bad).ok).toBe(false);
  });
});

describe("readCasinoNews: the casino's report as the conductor reads it", () => {
  const news: CasinoNews = { host: "sr-01", phase: "playing", hands: 12, winnings: 4.5e8, lastError: null };

  test("reads back what the casino posts, in every phase", () => {
    expect(readCasinoNews(news)).toEqual(news);
    for (const phase of ["starting", "playing", "capped", "failed"] as const) {
      expect(readCasinoNews({ ...news, phase })?.phase).toBe(phase);
    }
    expect(readCasinoNews({ ...news, phase: "failed", lastError: "timed out" })?.lastError).toBe("timed out");
  });

  test("anything malformed (an empty port too) is no news", () => {
    for (const bad of ["NULL PORT DATA", null, { ...news, phase: "done" }, { ...news, hands: -1 }, { ...news, winnings: "1" }]) {
      expect(readCasinoNews(bad)).toBeUndefined();
    }
  });
});
