// Probe `market`: the BitNode the player is in and whether the TIX API is
// owned, which is what starting the BN8 trader turns on. Value:
// ProbeValues["market"] in `../helpers.ts`.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => ({
    currentNode: ns.getResetInfo().currentNode,
    hasTixApi: ns.stock.hasTixApiAccess(),
  }));
}
