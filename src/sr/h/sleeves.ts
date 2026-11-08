// Probe `sleeves`: how many sleeves the player owns (#49). The sleeve API
// throws without SF10 outside BN10, so decide launches this only where
// sleeves can exist (`sleevesPossible` in `../helpers.ts`). 5.6 GB.
// Value: ProbeValues["sleeves"] in `../helpers.ts`.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => ({ count: ns.sleeve.getNumSleeves() }));
}
