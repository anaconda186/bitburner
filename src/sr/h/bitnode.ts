// Probe `bitnode` (#57): the BitNode multipliers the formulas read
// (NodeMults in `../formulas.ts`). getBitNodeMultipliers needs SF5 or BN5
// and costs 4 GB, so this runs only there, once per conductor; elsewhere
// `../node-mults.ts` has a table. Only the NodeMults fields go out, so the
// reply stays small plain JSON.
// Value: ProbeValues["bitnode"] in `../helpers.ts`.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

const FIELDS = [
  "HackExpGain",
  "HackingLevelMultiplier",
  "HackingSpeedMultiplier",
  "ScriptHackMoney",
  "ServerGrowthRate",
  "ServerWeakenRate",
  "CloudServerCost",
  "CloudServerSoftcap",
  "CloudServerMaxRam",
] as const;

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => {
    const all = ns.getBitNodeMultipliers();
    return Object.fromEntries(FIELDS.map((f) => [f, all[f]]));
  });
}
