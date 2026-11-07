// Probe `market`: whether the TIX API is owned, which every stock call needs
// and which the BN8 trader waits for. Value: ProbeValues["market"] in
// `../helpers.ts`. (The BitNode comes from the `route` probe.)
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => ({ hasTixApi: ns.stock.hasTixApiAccess() }));
}
