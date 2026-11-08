// Action helper `buyServer`: buys one cloud server. Argument { host, ram };
// replies the new server's hostname, or fails when the game buys nothing (no
// money, the limit of 25, a bad size). Shared by #54 (the driver's sr-00) and
// #57 (the fleet); the run names its cloud servers sr-00 ... sr-24.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, (arg) => {
    const { host, ram } = (arg ?? {}) as { host?: unknown; ram?: unknown };
    if (typeof host !== "string" || typeof ram !== "number") {
      throw new Error(`buy-server: expected { host: string, ram: number }, got ${JSON.stringify(arg)}`);
    }
    const bought = ns.cloud.purchaseServer(host, ram);
    if (bought === "") throw new Error(`buy-server: the game bought no ${ram} GB server ${host}`);
    return bought;
  });
}
