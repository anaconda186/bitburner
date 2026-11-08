// The formula model (seam D): our own implementation of the game's formulas,
// so the run decides without Formulas.exe. Pure functions only; one module
// shared by every decider and the money engine's scheduler.
//
// Every function cites the Bitburner v3.0.1 source it follows, as
// <path>:<line> at commit 3162fd2 (tag v3.0.1):
// https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/<path>#L<line>
// It does the game's arithmetic in the game's order, so it matches the
// golden values from ns.formulas.* to the last bit (src/sr/formulas.test.ts).
// BitNode multipliers are an input (NodeMults), never a global.
// Add a formula the same way: cite its lines, take the multipliers it reads
// as inputs, and record its golden values in tools/golden/formulas-recorder.ts.
//
// RAM: run scripts import this module, and the game charges any identifier
// named like an NS function. Never name anything here hack, grow, weaken,
// share, getServer..., getHackTime and the like; the RAM test in
// formulas.test.ts prices every export.

/** The BitNode multipliers these formulas read (src/BitNode/BitNodeMultipliers.ts). */
export type NodeMults = {
  HackExpGain: number;
  HackingLevelMultiplier: number;
  HackingSpeedMultiplier: number;
  ScriptHackMoney: number;
  ServerGrowthRate: number;
  ServerWeakenRate: number;
  CloudServerCost: number;
  CloudServerSoftcap: number;
  CloudServerMaxRam: number;
};

/** Every multiplier at 1, as in BN1. */
export const NEUTRAL_MULTS: Readonly<NodeMults> = {
  HackExpGain: 1,
  HackingLevelMultiplier: 1,
  HackingSpeedMultiplier: 1,
  ScriptHackMoney: 1,
  ServerGrowthRate: 1,
  ServerWeakenRate: 1,
  CloudServerCost: 1,
  CloudServerSoftcap: 1,
  CloudServerMaxRam: 1,
};

/** The server fields the hacking formulas read, as ns.getServer gives them for a normal server. */
export interface Target {
  hasAdminRights: boolean;
  hackDifficulty: number;
  baseDifficulty: number;
  requiredHackingSkill: number;
  serverGrowth: number;
  moneyAvailable: number;
  moneyMax: number;
}

/**
 * The fields the hack chance, fraction and times read: all a caller needs to
 * hand them (the money engine reads just these, one cheap call each).
 */
export type HackTarget = Pick<Target, "hasAdminRights" | "hackDifficulty" | "requiredHackingSkill">;

/** The person fields the hacking formulas read, as ns.getPlayer gives them. */
export interface Hacker {
  skills: { hacking: number; intelligence: number };
  mults: { hacking_chance: number; hacking_exp: number; hacking_money: number; hacking_speed: number; hacking_grow: number };
}

/** Clamps to [lo, hi]; NaN gives lo (src/utils/helpers/clampNumber.ts:9). */
function clamp(x: number, lo: number, hi = Number.MAX_VALUE): number {
  return Number.isNaN(x) ? lo : Math.min(Math.max(x, lo), hi);
}

/** The intelligence bonus, 1 + weight·int^0.8/600. src/PersonObjects/formulas/intelligence.ts:1. */
export function intelligenceBonus(intelligence: number, weight = 1): number {
  return 1 + (weight * intelligence ** 0.8) / 600;
}

/** The fraction of security still in the way: 0 at 100 security, 1 at none. */
const securityFactor = (t: HackTarget): number => (100 - t.hackDifficulty) / 100;

/**
 * Chance (0..1) that one hack succeeds. src/Hacking.ts:9-24. Reads no BitNode
 * multiplier. 0 without root or at security 100 and above.
 */
export function hackChance(t: HackTarget, p: Hacker): number {
  if (!t.hasAdminRights || t.hackDifficulty >= 100) return 0;
  const skill = Math.max(1.75 * p.skills.hacking, 1);
  const bySkill = (skill - t.requiredHackingSkill) / skill;
  const chance = bySkill * securityFactor(t) * p.mults.hacking_chance * intelligenceBonus(p.skills.intelligence);
  return clamp(chance, 0, 1);
}

/**
 * Hacking exp for one successful hack thread: (3 + 0.3·baseDifficulty) ×
 * hacking_exp × HackExpGain. src/Hacking.ts:30-38. 0 when baseDifficulty is
 * 0. A failed hack earns a quarter of this (src/Netscript/NetscriptHelpers.tsx:564-565).
 */
export function hackExp(t: Target, p: Hacker, bn: NodeMults): number {
  if (!t.baseDifficulty) return 0;
  return (3 + t.baseDifficulty * 0.3) * p.mults.hacking_exp * bn.HackExpGain;
}

/**
 * The fraction (0..1) of the server's money one hack thread steals.
 * src/Hacking.ts:44-57 (ns.formulas.hacking.hackPercent). 0 at security 100
 * and above, and when the skill is below the server's requirement.
 */
export function hackFraction(t: HackTarget, p: Hacker, bn: NodeMults): number {
  if (t.hackDifficulty >= 100) return 0;
  const hacking = p.skills.hacking;
  const bySkill = (hacking - (t.requiredHackingSkill - 1)) / hacking;
  const fraction = (securityFactor(t) * bySkill * p.mults.hacking_money * bn.ScriptHackMoney) / 240;
  return Math.min(1, Math.max(fraction, 0));
}

/** Security each hack thread adds (src/Server/data/Constants.ts:9, ServerFortifyAmount). */
const FORTIFY_PER_THREAD = 0.002;

/**
 * Security a successful hack of `threads` adds to its server, where `fraction`
 * is one thread's share of the money (hackFraction at the moment it lands):
 * 0.002 per thread, but no more threads are counted than it takes to steal
 * everything, ceil(1/fraction). src/Netscript/NetscriptHelpers.tsx:567-572 and
 * :613 (ns.hackAnalyzeSecurity with a host, src/NetscriptFunctions.ts:230-244).
 * A failed hack adds nothing. The game caps security at 100 (src/Server/Server.ts:91-103).
 */
export function hackSecurityRise(threads: number, fraction: number): number {
  const counted = fraction > 0 ? Math.min(threads, Math.ceil(1 / fraction)) : threads;
  return FORTIFY_PER_THREAD * counted;
}

/**
 * Security a grow of `threads` adds when every thread is used: twice a
 * hack's 0.002 per thread (ns.growthAnalyzeSecurity without a host). The game
 * counts only the threads the growth actually needed, so this is the most it
 * can add. src/Server/ServerHelpers.ts:202-211, src/NetscriptFunctions.ts:325-342.
 */
export function growSecurityRise(threads: number): number {
  return 2 * FORTIFY_PER_THREAD * threads;
}

/**
 * One hack's duration in seconds, as the game computes it before formulas
 * turns it into ms. src/Hacking.ts:60-80. Darknet servers take a fixed 16 s
 * (:61), which this model doesn't cover.
 */
function hackSeconds(t: HackTarget, p: Hacker, bn: NodeMults): number {
  const difficulty = t.requiredHackingSkill * t.hackDifficulty;
  const skillFactor = (2.5 * difficulty + 500) / (p.skills.hacking + 50);
  const speed = p.mults.hacking_speed * bn.HackingSpeedMultiplier * intelligenceBonus(p.skills.intelligence);
  return (5 * skillFactor) / speed;
}

/** One hack's duration in ms (ns.formulas.hacking.hackTime). src/Hacking.ts:60, ×1000 at src/NetscriptFunctions/Formulas.ts:224. */
export function hackTimeMs(t: HackTarget, p: Hacker, bn: NodeMults): number {
  return hackSeconds(t, p, bn) * 1000;
}

/** One grow's duration in ms: 3.2 hacks. src/Hacking.ts:83-87, ×1000 at src/NetscriptFunctions/Formulas.ts:230. */
export function growTimeMs(t: HackTarget, p: Hacker, bn: NodeMults): number {
  return 3.2 * hackSeconds(t, p, bn) * 1000;
}

/** One weaken's duration in ms: 4 hacks. src/Hacking.ts:90-94, ×1000 at src/NetscriptFunctions/Formulas.ts:236. */
export function weakenTimeMs(t: HackTarget, p: Hacker, bn: NodeMults): number {
  return 4 * hackSeconds(t, p, bn) * 1000;
}

/** The thread bonus for running on a host with `cores` cores. src/Server/ServerHelpers.ts:287-290. */
export function coreBonus(cores: number): number {
  return 1 + (cores - 1) / 16;
}

/** Per-thread growth is capped at log1p(0.0035) (src/Server/data/Constants.ts:8). */
const MAX_GROW_LOG = 0.00349388925425578;

/**
 * The natural log of a grow's money multiplier. src/Server/formulas/grow.ts:8-29.
 * The thread count is multiplied in last, as there, so that this rounds the
 * same way for n threads as n × the 1-thread value.
 */
function growLog(t: Target, p: Hacker, threads: number, cores: number, bn: NodeMults): number {
  if (!t.serverGrowth) return -Infinity;
  const perThread = Math.min(Math.log1p(0.03 / t.hackDifficulty), MAX_GROW_LOG);
  const growth = (t.serverGrowth / 100) * bn.ServerGrowthRate;
  return perThread * growth * p.mults.hacking_grow * coreBonus(cores) * Math.max(threads, 0);
}

/**
 * The multiplier a grow of `threads` applies to the server's money, before the
 * +$1 per thread (ns.formulas.hacking.growPercent). src/Server/formulas/grow.ts:31-34.
 * 0 for a server that can't grow.
 */
export function growFactor(t: Target, p: Hacker, threads: number, cores: number, bn: NodeMults): number {
  if (!t.serverGrowth) return 0;
  return Math.exp(growLog(t, p, threads, cores, bn));
}

/**
 * The server's money after a grow of `threads`: (money + threads) × the grow
 * multiplier (at least 1), capped at moneyMax (ns.formulas.hacking.growAmount).
 * src/Server/formulas/grow.ts:38-58.
 */
export function grownMoney(t: Target, p: Hacker, threads: number, cores: number, bn: NodeMults): number {
  const factor = Math.max(growFactor(t, p, threads, cores, bn), 1);
  const money = (t.moneyAvailable + threads) * factor;
  return money > t.moneyMax || Number.isNaN(money) ? t.moneyMax : money;
}

/**
 * The fewest threads of one grow that take the server from its moneyAvailable
 * to `targetMoney` (capped at moneyMax) (ns.formulas.hacking.growThreads).
 * Same answer as src/Server/ServerHelpers.ts:90-199 (numCycleForGrowthCorrected):
 * 0 when there is nothing to grow, Infinity for a server that can't grow.
 *
 * After n threads the money is (start + n)·e^(k·n), k being the 1-thread grow
 * log. Newton's method on ln((start + x)/goal) + k·x finds the real root; the
 * answer is the first integer at or above it that reaches the goal, checked
 * with the very expression grownMoney uses.
 */
export function growThreadsFor(t: Target, p: Hacker, targetMoney: number, cores: number, bn: NodeMults): number {
  if (!t.serverGrowth) return Infinity;
  const start = Math.max(t.moneyAvailable, 0);
  const goal = Math.min(targetMoney, t.moneyMax);
  if (goal <= start) return 0;
  const k = growLog(t, p, 1, cores, bn);
  const reaches = (n: number) => goal <= (start + n) * Math.exp(k * n);
  // Starting left of the root, Newton climbs to it without overshooting.
  let x = (goal - start) / (1 + goal * k);
  for (let i = 0; i < 100; i++) {
    const money = start + x;
    const next = (x - money * Math.log(money / goal)) / (1 + money * k);
    const step = next - x;
    x = next;
    if (Math.abs(step) < 1e-3) break;
  }
  if (!Number.isFinite(x)) return Infinity;
  let n = Math.max(Math.ceil(x), 1);
  for (let i = 0; i < 4 && n > 1 && reaches(n - 1); i++) n--;
  for (let i = 0; i < 4 && !reaches(n); i++) n++;
  return n;
}

/**
 * Security one weaken of `threads` removes: 0.05 per thread × the core bonus ×
 * ServerWeakenRate (ns.formulas.hacking.weakenEffect). src/Server/ServerHelpers.ts:292-295,
 * 0.05 from src/Server/data/Constants.ts:10. The game stops at minDifficulty.
 */
export function weakenAmount(threads: number, cores: number, bn: NodeMults): number {
  return 0.05 * threads * coreBonus(cores) * bn.ServerWeakenRate;
}

/**
 * A stat level from its exp: floor(mult·(32·ln(exp + 534.6) − 200)), at least 1
 * (ns.formulas.skills.calculateSkill). src/PersonObjects/formulas/skill.ts:7-15.
 * A mult of 0 (BN12 at a high level) keeps the level at 1.
 * For hacking, mult is the player's hacking mult × HackingLevelMultiplier: see hackingLevel.
 */
export function skillFromExp(exp: number, mult: number): number {
  if (mult === 0) return 1;
  return clamp(Math.floor(mult * (32 * Math.log(exp + 534.6) - 200)), 1);
}

/**
 * The exp at which a stat reaches `skill`, the inverse of skillFromExp, never
 * below 0 (ns.formulas.skills.calculateExp). src/PersonObjects/formulas/skill.ts:17-34.
 * For a whole skill the result is nudged up until skillFromExp really gives
 * that skill, as the game does against rounding.
 */
export function expForSkill(skill: number, mult: number): number {
  const exact = Math.exp((skill / mult + 200) / 32) - 534.6;
  let exp = exact;
  if (Number.isInteger(skill) && Number.isFinite(exact)) {
    let step = Math.abs(exact) * Number.EPSILON || Number.MIN_VALUE;
    for (let i = 0; i < 2000 && skillFromExp(exp, mult) < skill; i++, step *= 2) exp = exact + step;
  }
  return clamp(exp, 0);
}

/**
 * The hacking level `exp` gives: skillFromExp with the player's hacking mult
 * times the BitNode's HackingLevelMultiplier. src/PersonObjects/Person.ts:60-63.
 */
export function hackingLevel(exp: number, hackingMult: number, bn: NodeMults): number {
  return skillFromExp(exp, hackingMult * bn.HackingLevelMultiplier);
}

/**
 * The most RAM a cloud server can have: 2^20 GB × CloudServerMaxRam, rounded
 * down to a power of 2 (ns.cloud.getRamLimit). src/Server/ServerPurchases.ts:100-105,
 * 2^20 from src/Server/data/Constants.ts:13. 0 if that rounds below 1 GB.
 */
export function cloudServerMaxRam(bn: NodeMults): number {
  const ram = Math.round(1048576 * bn.CloudServerMaxRam);
  return ram < 1 ? 0 : 2 ** Math.floor(Math.log2(ram));
}

/**
 * The price of a cloud server with `ram` GB: ram × $55,000 × CloudServerCost ×
 * CloudServerSoftcap^(log2(ram) − 6, when positive) (ns.cloud.getServerCost).
 * src/Server/ServerPurchases.ts:23-42, $55,000 from src/Server/data/Constants.ts:4.
 * Infinity unless ram (rounded) is a power of 2 no larger than cloudServerMaxRam.
 * Upgrading costs the difference of two prices (src/Server/ServerPurchases.ts:44-54).
 */
export function cloudServerCost(ram: number, bn: NodeMults): number {
  const gb = Math.round(ram);
  if (!(gb >= 1) || !Number.isInteger(Math.log2(gb)) || gb > cloudServerMaxRam(bn)) return Infinity;
  const softcapSteps = Math.max(0, Math.log2(gb) - 6);
  return gb * 55000 * bn.CloudServerCost * bn.CloudServerSoftcap ** softcapSteps;
}
