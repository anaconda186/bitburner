// Probe `route`: the current BitNode and the owned Source-Files, which give
// the run's place in the BitNode order (`../order.ts`). getResetInfo costs
// 1 GB, too much for the conductor, so it is read here. `ownedSF` is a Map in
// the game; the reply must be plain JSON, so it goes out as an object. The
// reset times (#49) let the conductor tell a start after a reset from one
// after a page reload.
// Value: ProbeValues["route"] in `../helpers.ts`.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => {
    const info = ns.getResetInfo();
    return {
      currentNode: info.currentNode,
      ownedSF: Object.fromEntries(info.ownedSF),
      lastAugReset: info.lastAugReset,
      lastNodeReset: info.lastNodeReset,
    };
  });
}
