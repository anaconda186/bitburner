// The formula model (seam D): our own copy of the game's formulas, so the run
// decides without Formulas.exe. Pure functions only.
//
// Every function cites the Bitburner v3.0.1 source it follows, as
// <path>:<line> at commit 3162fd2 (tag v3.0.1):
// https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/<path>#L<line>
// BitNode multipliers are an input (NodeMults), never a global. They are
// checked against golden values from ns.formulas.* (src/sr/formulas.test.ts).
// Add a formula the same way: cite its line, take the multipliers it reads,
// and record its golden values in tools/golden/formulas-recorder.ts.
//
// RAM: this module is imported by run scripts, and the game charges any
// identifier named like an NS function. Never name anything here hack, grow,
// weaken, share, getServer..., getHackTime and the like; the test
// "costs no RAM to import" prices the whole module.

/** The BitNode multipliers these formulas read (src/BitNode/BitNodeMultipliers.ts). */
export interface NodeMults {
  HackExpGain: number;
  HackingLevelMultiplier: number;
  HackingSpeedMultiplier: number;
  ScriptHackMoney: number;
  ServerGrowthRate: number;
  ServerWeakenRate: number;
  CloudServerCost: number;
  CloudServerSoftcap: number;
  CloudServerMaxRam: number;
}

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

/** The server fields the hacking formulas read; ns.getServer's result fits. */
export interface Target {
  hasAdminRights: boolean;
  hackDifficulty: number;
  baseDifficulty: number;
  requiredHackingSkill: number;
  serverGrowth: number;
  moneyAvailable: number;
  moneyMax: number;
}

/** The person fields the hacking formulas read; ns.getPlayer's result fits. */
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
const securityFactor = (t: Target): number => (100 - t.hackDifficulty) / 100;

/**
 * Chance (0..1) that one hack succeeds. src/Hacking.ts:9-24. Reads no BitNode
 * multiplier. 0 without root or at security 100 and above.
 */
export function hackChance(t: Target, p: Hacker): number {
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
export function hackFraction(t: Target, p: Hacker, bn: NodeMults): number {
  if (t.hackDifficulty >= 100) return 0;
  const hacking = p.skills.hacking;
  const bySkill = (hacking - (t.requiredHackingSkill - 1)) / hacking;
  const fraction = (securityFactor(t) * bySkill * p.mults.hacking_money * bn.ScriptHackMoney) / 240;
  return Math.min(1, Math.max(fraction, 0));
}

/**
 * One hack's duration in seconds, as the game computes it before formulas
 * turns it into ms. src/Hacking.ts:60-80. Darknet servers take a fixed 16 s
 * (:61), which this model doesn't cover.
 */
function hackSeconds(t: Target, p: Hacker, bn: NodeMults): number {
  const difficulty = t.requiredHackingSkill * t.hackDifficulty;
  const skillFactor = (2.5 * difficulty + 500) / (p.skills.hacking + 50);
  const speed = p.mults.hacking_speed * bn.HackingSpeedMultiplier * intelligenceBonus(p.skills.intelligence);
  return (5 * skillFactor) / speed;
}

/** One hack's duration in ms (ns.formulas.hacking.hackTime). src/Hacking.ts:60, ×1000 at src/NetscriptFunctions/Formulas.ts:224. */
export function hackTimeMs(t: Target, p: Hacker, bn: NodeMults): number {
  return hackSeconds(t, p, bn) * 1000;
}

/** One grow's duration in ms: 3.2 hacks. src/Hacking.ts:83-87, ×1000 at src/NetscriptFunctions/Formulas.ts:230. */
export function growTimeMs(t: Target, p: Hacker, bn: NodeMults): number {
  return 3.2 * hackSeconds(t, p, bn) * 1000;
}

/** One weaken's duration in ms: 4 hacks. src/Hacking.ts:90-94, ×1000 at src/NetscriptFunctions/Formulas.ts:236. */
export function weakenTimeMs(t: Target, p: Hacker, bn: NodeMults): number {
  return 4 * hackSeconds(t, p, bn) * 1000;
}
