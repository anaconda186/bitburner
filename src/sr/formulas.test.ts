// Seam D: the formula model against the game. The golden values in
// test/golden/formulas.json were recorded with ns.formulas.* in v3.0.1 on two
// lab saves (`npm run record-formulas`): BN1, where every BitNode multiplier is
// 1, and BN12 level 30, where most hacking multipliers are 1.02^±30. Person
// multipliers vary in both. The hand-written cases below cover the BitNode
// multipliers neither save reaches (HackingSpeedMultiplier, ScriptHackMoney
// and friends at other values), with expected values worked out by hand.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";
import { loadRamCalculator } from "../../tools/ram-calc.ts";
import * as formulas from "./formulas.ts";
import {
  cloudServerCost,
  cloudServerMaxRam,
  expForSkill,
  growFactor,
  growThreadsFor,
  grownMoney,
  growTimeMs,
  hackChance,
  hackExp,
  hackFraction,
  hackingLevel,
  hackTimeMs,
  NEUTRAL_MULTS,
  skillFromExp,
  weakenAmount,
  weakenTimeMs,
  type Hacker,
  type NodeMults,
  type Target,
} from "./formulas.ts";

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

/**
 * The golden cases our value differs from, for a readable failure. The
 * comparison is exact: the model does the game's arithmetic in the game's
 * order, so every recorded value matches to the last bit.
 */
function misses<T>(cases: T[], ours: (c: T) => number, theirs: (c: T) => Num) {
  return cases.map((c) => ({ c, ours: ours(c), game: num(theirs(c)) })).filter((r) => !Object.is(r.ours, r.game));
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
  it("grow threads", () => {
    const ours = (c: HackingCase) => growThreadsFor(c.server, c.person, c.targetMoney, c.cores, ctx.nodeMults);
    expect(misses(h, ours, (c) => c.out.growThreads!)).toEqual([]);
  });
  it("security removed by a weaken", () => {
    const ours = (c: Context["weaken"][number]) => weakenAmount(c.threads, c.cores, ctx.nodeMults);
    expect(misses(ctx.weaken, ours, (c) => c.out)).toEqual([]);
  });
  it("skill from exp", () => {
    expect(misses(ctx.skills, (c) => skillFromExp(c.exp, c.mult), (c) => c.out)).toEqual([]);
  });
  it("exp for a skill", () => {
    expect(misses(ctx.exps, (c) => expForSkill(c.skill, c.mult), (c) => c.out)).toEqual([]);
  });
  it("cloud server cost and RAM limit", () => {
    expect(cloudServerMaxRam(ctx.nodeMults)).toBe(ctx.cloudMaxRam);
    expect(misses(ctx.cloud, (c) => cloudServerCost(c.ram, ctx.nodeMults), (c) => c.out)).toEqual([]);
  });
});

// Multipliers the lab saves don't reach. Expected values are worked by hand
// from the formulas' definitions (or, for grow threads, by counting threads
// one at a time), not from the model.
describe("BitNode multipliers other than 1 (hand-worked)", () => {
  const target: Target = {
    hasAdminRights: true,
    hackDifficulty: 10, // security factor 0.9
    baseDifficulty: 20,
    requiredHackingSkill: 100,
    serverGrowth: 50,
    moneyAvailable: 1e6,
    moneyMax: 1e7,
  };
  const person: Hacker = {
    skills: { hacking: 200, intelligence: 0 },
    mults: { hacking_chance: 1, hacking_exp: 1, hacking_money: 1, hacking_speed: 1, hacking_grow: 1 },
  };
  const bn = (m: Partial<NodeMults>): NodeMults => ({ ...NEUTRAL_MULTS, ...m });

  it("HackingSpeedMultiplier 0.5 doubles every time", () => {
    // skill factor (2.5·100·10 + 500)/(200 + 50) = 12; hack = 5·12/0.5 = 120 s.
    expect(hackTimeMs(target, person, NEUTRAL_MULTS)).toBeCloseTo(60_000, 6);
    expect(hackTimeMs(target, person, bn({ HackingSpeedMultiplier: 0.5 }))).toBeCloseTo(120_000, 6);
    expect(growTimeMs(target, person, bn({ HackingSpeedMultiplier: 0.5 }))).toBeCloseTo(384_000, 6);
    expect(weakenTimeMs(target, person, bn({ HackingSpeedMultiplier: 0.5 }))).toBeCloseTo(480_000, 6);
  });

  it("HackingSpeedMultiplier 0.3 with intelligence 100", () => {
    // 60 s / 0.3 / (1 + 100^0.8/600 = 1.0663511950922495)
    const smart = { ...person, skills: { hacking: 200, intelligence: 100 } };
    expect(hackTimeMs(target, smart, bn({ HackingSpeedMultiplier: 0.3 }))).toBeCloseTo(187_555.470393, 3);
  });

  it("ScriptHackMoney 0.5 halves the fraction hacked", () => {
    // 0.9 · (200 − 99)/200 / 240 = 0.00189375
    expect(hackFraction(target, person, NEUTRAL_MULTS)).toBeCloseTo(0.00189375, 12);
    expect(hackFraction(target, person, bn({ ScriptHackMoney: 0.5 }))).toBeCloseTo(0.000946875, 12);
  });

  it("ScriptHackMoney 0 steals nothing", () => {
    expect(hackFraction(target, person, bn({ ScriptHackMoney: 0 }))).toBe(0);
  });

  it("HackExpGain 0.25", () => {
    // (3 + 0.3·20) · 0.25
    expect(hackExp(target, person, bn({ HackExpGain: 0.25 }))).toBeCloseTo(2.25, 12);
  });

  it("hack chance reads no BitNode multiplier", () => {
    // (350 − 100)/350 · 0.9
    expect(hackChance(target, person)).toBeCloseTo(0.6428571428571429, 12);
  });

  it("ServerGrowthRate 0.5 halves the grow log", () => {
    // log1p(0.03/10) · 0.5 (serverGrowth 50) · rate · 100 threads
    expect(growFactor(target, person, 100, 1, NEUTRAL_MULTS)).toBeCloseTo(1.16157338096502, 12);
    expect(growFactor(target, person, 100, 1, bn({ ServerGrowthRate: 0.5 }))).toBeCloseTo(1.0777631376907544, 12);
    expect(grownMoney(target, person, 100, 1, bn({ ServerGrowthRate: 0.5 }))).toBeCloseTo(1_077_870.9140045235, 4);
  });

  it("ServerGrowthRate 0.5 about doubles the threads to double the money", () => {
    // The first n with (1e6 + n)·e^(k·n) ≥ 2e6, counted one thread at a time.
    expect(growThreadsFor(target, person, 2e6, 1, NEUTRAL_MULTS)).toBe(463);
    expect(growThreadsFor(target, person, 2e6, 1, bn({ ServerGrowthRate: 0.5 }))).toBe(925);
  });

  it("ServerWeakenRate 2 doubles a weaken", () => {
    // 0.05 · 10 threads · 2; with 17 cores the core bonus is 2 as well.
    expect(weakenAmount(10, 1, bn({ ServerWeakenRate: 2 }))).toBeCloseTo(1, 12);
    expect(weakenAmount(10, 17, bn({ ServerWeakenRate: 2 }))).toBeCloseTo(2, 12);
  });

  it("HackingLevelMultiplier 0.5 halves the level before flooring", () => {
    // 32·ln(1e6 + 534.6) − 200 = 242.1...
    expect(hackingLevel(1e6, 1, NEUTRAL_MULTS)).toBe(242);
    expect(hackingLevel(1e6, 1, bn({ HackingLevelMultiplier: 0.5 }))).toBe(121);
    expect(hackingLevel(1e6, 2, bn({ HackingLevelMultiplier: 0.25 }))).toBe(121);
  });

  it("CloudServerCost 2 and CloudServerSoftcap 1.5", () => {
    const m = bn({ CloudServerCost: 2, CloudServerSoftcap: 1.5 });
    expect(cloudServerCost(64, m)).toBe(7_040_000); // 64 · 55,000 · 2, no softcap up to 64 GB
    expect(cloudServerCost(256, m)).toBeCloseTo(63_360_000, 4); // 256 · 55,000 · 2 · 1.5²
  });

  it("CloudServerMaxRam 0.3 caps cloud servers at 2^18 GB", () => {
    // round(2^20 · 0.3) = 314,573, rounded down to a power of 2
    const m = bn({ CloudServerMaxRam: 0.3 });
    expect(cloudServerMaxRam(m)).toBe(262_144);
    expect(cloudServerCost(2 ** 18, m)).toBeLessThan(Infinity);
    expect(cloudServerCost(2 ** 19, m)).toBe(Infinity);
  });
});

describe("RAM", () => {
  // Run scripts import this module, and the game charges any identifier named
  // like an NS function, so every export is priced as a consumer would use it.
  const price = async (moduleTs: string, names: string[]) => {
    const calc = await loadRamCalculator();
    const js = (await transform(moduleTs, { loader: "ts", format: "esm", tsconfigRaw: {} })).code;
    const user = `import { ${names.join(", ")} } from "./formulas.js";
export async function main(ns) { ns.print([${names.join(", ")}]); }`;
    return calc(new Map([["sr/user.js", user], ["sr/formulas.js", js]]), "sr/user.js", { bitNodeN: 1 });
  };

  it("importing the whole model costs nothing beyond the base 1.6 GB", async () => {
    const source = readFileSync(join(import.meta.dirname, "formulas.ts"), "utf8");
    expect(await price(source, Object.keys(formulas))).toMatchObject({ ok: true, cost: 1.6 });
  });

  it("would be charged for an export named like an NS function (control)", async () => {
    expect(await price("export function weaken() { return 0; }", ["weaken"])).toMatchObject({ ok: true, cost: 1.75 });
  });
});
