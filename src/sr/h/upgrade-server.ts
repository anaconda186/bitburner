// Action helper `fleetUpgrade`: raises one cloud server's RAM. Argument
// { host, ram } (the new size, a power of 2 GB above the current one);
// replies the hostname. The game returns false when it refuses (no money, a
// size not above the current one); that becomes a failed reply.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, (arg) => {
    const { host, ram } = (arg ?? {}) as { host?: unknown; ram?: unknown };
    if (typeof host !== "string" || typeof ram !== "number") {
      throw new Error(`upgrade-server: expected { host: string, ram: number }, got ${JSON.stringify(arg)}`);
    }
    if (!ns.cloud.upgradeServer(host, ram)) throw new Error(`upgrade-server: the game refused ${host} at ${ram} GB`);
    return host;
  });
}
