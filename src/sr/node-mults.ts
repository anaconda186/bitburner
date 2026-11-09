// The BitNode multipliers the formulas read (NodeMults), for the money engine
// and the fleet rule. Pure: no `ns` here.
//
// The game gives them through ns.getBitNodeMultipliers(), which needs SF5 (or
// being in BN5) and costs 4 GB, so the `bitnode` probe reads them once that
// works. Before that the run is only ever in BN1.1 or BN4.1-4.3 (the fixed
// front of the BitNode order), so a parameter table holds those two. Any
// other BitNode without a reading falls back to BN1's values.
import { NEUTRAL_MULTS, type NodeMults } from "./formulas.ts";
import type { RouteFacts } from "./order.ts";

/**
 * Where the probe can't read: per BitNode, the multipliers that differ from
 * 1. Values from src/BitNode/BitNode.tsx:570-662 at v3.0.1 (BN1 is all 1;
 * BN4 at :633). Neither depends on the SF level.
 */
export const NODE_MULTS_TABLE: Readonly<Record<number, Readonly<NodeMults>>> = {
  1: NEUTRAL_MULTS,
  4: { ...NEUTRAL_MULTS, ScriptHackMoney: 0.2, HackExpGain: 0.4, CloudServerSoftcap: 1.2 },
};

/** ns.getBitNodeMultipliers() works: SF5 owned, or in BN5 (src/NetscriptFunctions.ts:914+). */
export function multsReadable(route: RouteFacts): boolean {
  return route.currentNode === 5 || (route.ownedSF[5] ?? 0) >= 1;
}

const MULT_KEYS = Object.keys(NEUTRAL_MULTS) as (keyof NodeMults)[];

/** The NodeMults fields of a getBitNodeMultipliers() result, or undefined if any is missing. */
export function pickMults(raw: unknown): NodeMults | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const out: Partial<NodeMults> = {};
  for (const key of MULT_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
    out[key] = v;
  }
  return out as NodeMults;
}

/** The multipliers in force: the probe's reading when there is one, else the table, else BN1's. */
export function nodeMults(route: RouteFacts, reading: unknown): NodeMults {
  return pickMults(reading) ?? NODE_MULTS_TABLE[route.currentNode] ?? NEUTRAL_MULTS;
}
