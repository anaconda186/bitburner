// The fleet rule (spec #41 user story 63, #57): which cloud server to buy or
// double next. Pure: a sub-decider of `decide`, a function of the snapshot
// plus the tunables.
//
// - The cheapest next doubling across the slots: doubling an owned server,
//   or filling an empty slot at the size of the smallest server owned (the
//   base size while there is none). The cheapest is right both where the price
//   per GB is flat (BN1) and where it rises with size (BN4's softcap).
// - Only if it pays back within the tunable payback at current income, judged
//   on the money engine's outlook: what one more GB earns.
// - Only with the money left after setting aside money for planned
//   augmentations.
// - One purchase per action helper, and the next only once the fleet probe
//   has read the fleet again after it.
//
// Slots are named sr-00 ... sr-24. While the driver is wanted (BN1.1),
// sr-00 is its slot (#54 buys it at 32 GB): this rule never buys it then, but
// doubles it like any other once it exists. Elsewhere it is a slot like any. RAM: the conductor imports this file; nothing here may be named
// like an NS function (upgradeServer, purchaseServer, getServerCost ...).
import type { Snapshot, Want } from "./decide.ts";
import { cloudServerCost, type NodeMults } from "./formulas.ts";
import { CALLS, type CloudServer, type FleetFacts, type HelperScript } from "./helpers.ts";
import { readOutlook, type EngineOrders, type EngineOutlook } from "./money-engine.ts";

/** The fleet's tunables (spec #41 "Tunables": fleet payback 10 min). */
export const FLEET_TUNABLES = {
  /** A purchase must pay for itself within this many seconds. */
  paybackS: 600,
  /** The size an empty fleet starts at, GB: 4 job threads. */
  baseRamGb: 8,
} as const;

export type FleetTunables = { readonly [K in keyof typeof FLEET_TUNABLES]: number };

/** The cloud slot names, in buying order. */
export const FLEET_HOSTS: readonly string[] = Array.from({ length: 25 }, (_, i) => `sr-${String(i).padStart(2, "0")}`);

/** One step: buy `host` at `ramGb`, or double it to `ramGb`. */
export type Doubling = {
  readonly kind: "buy" | "double";
  readonly host: string;
  readonly ramGb: number;
  readonly addedGb: number;
  readonly cost: number;
};

/**
 * The cheapest next doubling, or undefined when every slot is full and at the
 * limit. `reserved` slots are bought by someone else (the driver's sr-00):
 * never bought here, and their room kept free until they are.
 */
export function nextDoubling(
  f: FleetFacts, mults: NodeMults, reserved: readonly string[] = [], t: FleetTunables = FLEET_TUNABLES,
): Doubling | undefined {
  const steps: Doubling[] = [];
  const owned = new Set(f.servers.map((s) => s.host));
  const freeSlots = f.limit - f.servers.length - reserved.filter((h) => !owned.has(h)).length;
  const empty = FLEET_HOSTS.find((h) => !reserved.includes(h) && !owned.has(h));
  if (freeSlots > 0 && empty !== undefined) {
    const smallest = Math.min(...f.servers.map((s) => s.ramGb));
    const ramGb = Math.min(f.servers.length > 0 ? Math.max(smallest, 1) : t.baseRamGb, f.ramLimitGb);
    steps.push({ kind: "buy", host: empty, ramGb, addedGb: ramGb, cost: cloudServerCost(ramGb, mults) });
  }
  for (const s of [...f.servers].sort(byHost)) {
    const ramGb = s.ramGb * 2;
    if (ramGb > f.ramLimitGb) continue;
    steps.push({ kind: "double", host: s.host, ramGb, addedGb: s.ramGb, cost: cloudServerCost(ramGb, mults) - cloudServerCost(s.ramGb, mults) });
  }
  // Cheapest first; the buy comes first in the list, so it wins a tie.
  let best: Doubling | undefined;
  for (const step of steps) if (Number.isFinite(step.cost) && (best === undefined || step.cost < best.cost)) best = step;
  return best;
}

const byHost = (a: CloudServer, b: CloudServer): number => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0);

/**
 * Seconds a step takes to pay for itself: its cost over what its GB earn,
 * at the engine's marginal income per GB. Infinity when more RAM earns nothing.
 */
export function paybackS(step: Doubling, outlook: EngineOutlook): number {
  if (!(outlook.poolGb > 0)) return Infinity;
  const perGb = (outlook.incomeAt2xPerSec - outlook.incomePerSec) / outlook.poolGb;
  return perGb > 0 ? step.cost / (step.addedGb * perGb) : Infinity;
}

/** Rounding slack for the payback comparison. */
const PAYBACK_EPSILON = 1e-9;

/** The next purchase, if the rule allows one now: the cheapest doubling, paid back in time and affordable. */
export function fleetPurchase(
  f: FleetFacts,
  mults: NodeMults,
  outlook: EngineOutlook | undefined,
  reserve: number,
  reserved: readonly string[] = [],
  t: FleetTunables = FLEET_TUNABLES,
): Doubling | undefined {
  if (outlook === undefined) return undefined;
  const step = nextDoubling(f, mults, reserved, t);
  if (step === undefined) return undefined;
  if (paybackS(step, outlook) > t.paybackS * (1 + PAYBACK_EPSILON)) return undefined;
  if (f.money - reserve < step.cost) return undefined;
  return step;
}

const BUY_SCRIPT = CALLS.buyServer as HelperScript;
const DOUBLE_SCRIPT = CALLS.fleetUpgrade as HelperScript;
/** The purchase helpers: the fleet probe reads again after either. */
export const FLEET_CALLS: readonly HelperScript[] = [BUY_SCRIPT, DOUBLE_SCRIPT];

/**
 * Money set aside for planned augmentations. No plan buys augmentations yet
 * (the aug plans, #60 and later, set this); until then nothing is set aside.
 */
export function plannedAugReserve(_s: Snapshot): number {
  return 0;
}

/**
 * The fleet's want this loop: one purchase call, or nothing. It needs a fleet
 * reading the probe took after the last purchase call finished (its own
 * `readAtMs`: a probe launched just before a purchase may read before it) and
 * listing every server this conductor bought (`snapshot.boughtServers`, #54:
 * the game renames a second purchase of a taken name rather than refuse it,
 * so a stale reading would buy a slot twice), the engine's money split on
 * in `orders` (decide's engineOrders: not in BN8, nor before the route is
 * read), and the engine's outlook. Prices use the BitNode multipliers in the
 * orders. (`orders` is an argument, not computed here: importing decide.ts
 * would close an import loop, which the game refuses to load.)
 */
export function fleetWant(
  s: Snapshot, orders: EngineOrders, reserved: readonly string[], reserve: number = plannedAugReserve(s),
): Want | undefined {
  const facts = freshFleet(s);
  if (!(orders.split.money > 0) || facts === undefined) return undefined;
  const step = fleetPurchase(facts, orders.mults, engineOutlook(s), reserve, reserved);
  if (step === undefined) return undefined;
  return { kind: "call", script: step.kind === "buy" ? BUY_SCRIPT : DOUBLE_SCRIPT, arg: { host: step.host, ram: step.ramGb } };
}

/**
 * The fleet is bought (#58: the exp start begins): a fresh reading shows every
 * slot owned, and the rule has no purchase it would make now (none pays back
 * in time or none is affordable). Only `orders.mults` is read, so the money
 * split may be off.
 */
export function fleetBought(s: Snapshot, orders: EngineOrders, reserve: number = plannedAugReserve(s)): boolean {
  const facts = freshFleet(s);
  if (facts === undefined || facts.servers.length < facts.limit) return false;
  return fleetPurchase(facts, orders.mults, engineOutlook(s), reserve) === undefined;
}

/**
 * The fleet reading, if it is fresh: taken after the last purchase call
 * finished (its own `readAtMs`) and listing every server this conductor
 * bought.
 */
function freshFleet(s: Snapshot): FleetFacts | undefined {
  const reading = s.probes.fleet;
  if (reading?.ok !== true) return undefined;
  const last = s.lastCall;
  if (last !== undefined && FLEET_CALLS.includes(last.script) && last.atMs >= reading.value.readAtMs) return undefined;
  const listed = new Set(reading.value.servers.map((x) => x.host));
  if ((s.boughtServers ?? []).some((h) => !listed.has(h))) return undefined;
  return reading.value;
}

/** The outlook in the engine's latest report. */
function engineOutlook(s: Snapshot): EngineOutlook | undefined {
  const report = s.workers.engine?.report?.value;
  return typeof report === "object" && report !== null ? readOutlook((report as { outlook?: unknown }).outlook) : undefined;
}
