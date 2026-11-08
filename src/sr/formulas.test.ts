// Seam D: the formula model against the game. The golden values in
// test/golden/formulas.json were recorded with ns.formulas.* in v3.0.1 on two
// lab saves (`npm run record-formulas`): BN1, where every BitNode multiplier is
// 1, and BN12 level 30, where most hacking multipliers are 1.02^±30. Person
// multipliers vary in both. The hand-written cases below cover the BitNode
// multipliers neither save reaches (HackingSpeedMultiplier, ScriptHackMoney
// and friends at other values), with expected values worked out by hand.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expForSkill,
  growFactor,
  growThreadsFor,
  grownMoney,
  growTimeMs,
  hackChance,
  hackExp,
  hackFraction,
  hackTimeMs,
  skillFromExp,
  weakenAmount,
  weakenTimeMs,
  type Hacker, type NodeMults, type Target } from "./formulas.ts";

type Num = number | string;
interface HackingCase {
  server: Target & { hostname: string };
  person: Hacker;
  threads: number;
  cores: number;
  targetMoney: number;
  out: Record<string, Num>;
}
interface Context {
  name: string;
  nodeMults: NodeMults;
  cloudMaxRam: number;
  hacking: HackingCase[];
  weaken: { threads: number; cores: number; out: Num }[];
  skills: { exp: number; mult: number; out: Num }[];
  exps: { skill: number; mult: number; out: Num }[];
  cloud: { ram: number; out: Num }[];
}

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "test", "golden", "formulas.json"), "utf8")) as {
  contexts: Context[];
};
/** The recorder writes non-finite numbers as strings. */
const num = (v: Num): number => (typeof v === "string" ? Number(v) : v);

/** Equal, or within 1e-12 relative: the same arithmetic, but not always in the same order. */
const same = (a: number, b: number): boolean =>
  Object.is(a, b) || Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b));

/** The golden cases our value disagrees with, for a readable failure. */
function misses<T>(cases: T[], ours: (c: T) => number, theirs: (c: T) => Num, exact = false) {
  return cases
    .map((c) => ({ c, ours: ours(c), game: num(theirs(c)) }))
    .filter((r) => (exact ? !Object.is(r.ours, r.game) : !same(r.ours, r.game)));
}

it("the fixture holds both lab saves", () => {
  expect(fixture.contexts.map((c) => c.name)).toEqual(["BN1 (multipliers 1)", "BN12 level 30"]);
  for (const c of fixture.contexts) expect(c.hacking.length).toBeGreaterThan(300);
});

describe.each(fixture.contexts)("golden values: $name", (ctx) => {
  const h = ctx.hacking;

  it("hack chance", () => {
    expect(misses(h, (c) => hackChance(c.server, c.person), (c) => c.out.hackChance!)).toEqual([]);
  });
  it("hack exp", () => {
    expect(misses(h, (c) => hackExp(c.server, c.person, ctx.nodeMults), (c) => c.out.hackExp!)).toEqual([]);
  });
  it("fraction of money hacked", () => {
    expect(misses(h, (c) => hackFraction(c.server, c.person, ctx.nodeMults), (c) => c.out.hackPercent!)).toEqual([]);
  });
  it("hack, grow and weaken times in ms", () => {
    expect(misses(h, (c) => hackTimeMs(c.server, c.person, ctx.nodeMults), (c) => c.out.hackTime!)).toEqual([]);
    expect(misses(h, (c) => growTimeMs(c.server, c.person, ctx.nodeMults), (c) => c.out.growTime!)).toEqual([]);
    expect(misses(h, (c) => weakenTimeMs(c.server, c.person, ctx.nodeMults), (c) => c.out.weakenTime!)).toEqual([]);
  });
  it("grow multiplier", () => {
    const ours = (c: HackingCase) => growFactor(c.server, c.person, c.threads, c.cores, ctx.nodeMults);
    expect(misses(h, ours, (c) => c.out.growPercent!)).toEqual([]);
  });
  it("money after a grow", () => {
    const ours = (c: HackingCase) => grownMoney(c.server, c.person, c.threads, c.cores, ctx.nodeMults);
    expect(misses(h, ours, (c) => c.out.growAmount!)).toEqual([]);
  });
  it("grow threads, exactly", () => {
    const ours = (c: HackingCase) => growThreadsFor(c.server, c.person, c.targetMoney, c.cores, ctx.nodeMults);
    expect(misses(h, ours, (c) => c.out.growThreads!, true)).toEqual([]);
  });
  it("security removed by a weaken", () => {
    const ours = (c: Context["weaken"][number]) => weakenAmount(c.threads, c.cores, ctx.nodeMults);
    expect(misses(ctx.weaken, ours, (c) => c.out)).toEqual([]);
  });
  it("skill from exp, exactly", () => {
    expect(misses(ctx.skills, (c) => skillFromExp(c.exp, c.mult), (c) => c.out, true)).toEqual([]);
  });
  it("exp for a skill", () => {
    expect(misses(ctx.exps, (c) => expForSkill(c.skill, c.mult), (c) => c.out)).toEqual([]);
  });
});
