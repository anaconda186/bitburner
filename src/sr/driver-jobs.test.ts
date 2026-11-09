import { describe, expect, test } from "vitest";
import { nextDriverJob, readDriverNews, readDriverOrder, type DriverNews } from "./driver-jobs.ts";

/** A driver that just started on a fresh BN1.1 save: nothing bought, options not checked yet. */
function news(over: Partial<DriverNews> = {}, facts: Partial<DriverNews["facts"]> = {}): DriverNews {
  return {
    host: "sr-00",
    facts: { money: 0, city: "Sector-12", tor: false, programs: [], ...facts },
    optionsSet: false,
    done: 0,
    lastError: null,
    ...over,
  };
}

describe("nextDriverJob: the BN1.1 spending order", () => {
  test("a new driver sets the options (autoexec and the three suppress switches) first, whatever the money", () => {
    expect(nextDriverJob(news({}, { money: 1e9 }), null)).toEqual({ kind: "options" });
  });

  test("then buys TOR ($200k) once the money is there, and waits for it until then", () => {
    expect(nextDriverJob(news({ optionsSet: true }, { money: 199_999 }), null)).toBeUndefined();
    expect(nextDriverJob(news({ optionsSet: true }, { money: 200_000 }), null)).toEqual({ kind: "tor" });
  });

  test("then BruteSSH ($500k) through the terminal, before anything else costs money", () => {
    const withTor = (money: number) => news({ optionsSet: true }, { money, tor: true });
    expect(nextDriverJob(withTor(499_999), "Aevum")).toBeUndefined();
    expect(nextDriverJob(withTor(500_000), "Aevum")).toEqual({ kind: "buy", programs: ["BruteSSH.exe"] });
  });

  const brute = (money: number, city = "Sector-12", programs = ["BruteSSH.exe"]) =>
    news({ optionsSet: true }, { money, city, tor: true, programs });

  test("then travels ($200k) to the city the plan wants, if it wants one and the player is elsewhere", () => {
    expect(nextDriverJob(brute(199_999), "Aevum")).toBeUndefined();
    expect(nextDriverJob(brute(200_000), "Aevum")).toEqual({ kind: "travel", city: "Aevum" });
    expect(nextDriverJob(brute(200_000, "Aevum"), "Aevum")).not.toEqual(expect.objectContaining({ kind: "travel" }));
  });

  test("then the other port openers in price order, as many as the money covers, in one chain", () => {
    expect(nextDriverJob(brute(1_499_999), null)).toBeUndefined();
    expect(nextDriverJob(brute(1_500_000), null)).toEqual({ kind: "buy", programs: ["FTPCrack.exe"] });
    expect(nextDriverJob(brute(36_500_000), null)).toEqual({
      kind: "buy",
      programs: ["FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe"],
    });
    expect(nextDriverJob(brute(1e12, "Sector-12", ["BruteSSH.exe", "relaySMTP.exe"]), null)).toEqual({
      kind: "buy",
      programs: ["FTPCrack.exe", "HTTPWorm.exe", "SQLInject.exe"],
    });
  });

  test("has nothing to do once every port opener is owned and the player is where the plan wants", () => {
    const all = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
    expect(nextDriverJob(brute(1e12, "Aevum", all), "Aevum")).toBeUndefined();
    expect(nextDriverJob(brute(1e12, "Aevum", all), null)).toBeUndefined();
  });
});

describe("the driver's ports", () => {
  test("an order is a positive seq plus a known job; an empty port or anything else is no order", () => {
    expect(readDriverOrder({ seq: 3, job: { kind: "travel", city: "Aevum" } })).toEqual({
      seq: 3,
      job: { kind: "travel", city: "Aevum" },
    });
    expect(readDriverOrder({ seq: 1, job: { kind: "buy", programs: ["BruteSSH.exe"] } })).toBeDefined();
    for (const raw of [
      "NULL PORT DATA",
      null,
      { seq: 0, job: { kind: "tor" } },
      { seq: 2, job: { kind: "dance" } },
      { seq: 2, job: { kind: "travel" } },
      // The travel map shows cities by initial: "Nowhere" would match New Tokyo's N.
      { seq: 2, job: { kind: "travel", city: "Nowhere" } },
      { seq: 2, job: { kind: "buy", programs: "BruteSSH.exe" } },
    ]) {
      expect(readDriverOrder(raw)).toBeUndefined();
    }
  });

  test("the driver's news is read back as written, and garbled news is none", () => {
    const n = news({ done: 4, optionsSet: true }, { money: 5, tor: true, programs: ["BruteSSH.exe"] });
    expect(readDriverNews(JSON.parse(JSON.stringify(n)))).toEqual(n);
    expect(readDriverNews({ ...n, facts: { money: "lots" } })).toBeUndefined();
    expect(readDriverNews({ ...n, done: -1 })).toBeUndefined();
    expect(readDriverNews(null)).toBeUndefined();
  });
});
