// Action helper `buyServer`: buys one cloud server. Argument { host, ram }
// (a name and a power of 2 GB); replies the new server's hostname. The game
// returns "" when it refuses (no money, the limit reached, a bad name or
// size); that becomes a failed reply, so the conductor counts it not done.
// Shared contract with #54, which buys sr-00 for the driver through it.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, (arg) => {
    const { host, ram } = (arg ?? {}) as { host?: unknown; ram?: unknown };
    if (typeof host !== "string" || typeof ram !== "number") {
      throw new Error(`buy-server: expected { host: string, ram: number }, got ${JSON.stringify(arg)}`);
    }
    const bought = ns.cloud.purchaseServer(host, ram);
    if (bought === "") throw new Error(`buy-server: the game refused ${host} at ${ram} GB`);
    return bought;
  });
}
