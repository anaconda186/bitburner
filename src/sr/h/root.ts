// Action helper `root`: on each server in its argument ({ hosts }), opens
// every port it has the program for, then NUKEs. Replies { rooted }, the ones
// it now holds root on. A missing program or too few open ports just leaves a
// server unrooted (the game returns false); a server that isn't a normal one
// (a hacknet server) throws and is skipped. The conductor asks again later.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, (arg) => {
    const hosts = (arg as { hosts?: unknown } | null)?.hosts;
    if (!Array.isArray(hosts)) throw new Error(`root: expected { hosts: string[] }, got ${JSON.stringify(arg)}`);
    const rooted: string[] = [];
    for (const host of hosts.map(String)) {
      try {
        ns.brutessh(host);
        ns.ftpcrack(host);
        ns.relaysmtp(host);
        ns.httpworm(host);
        ns.sqlinject(host);
        if (ns.nuke(host)) rooted.push(host);
      } catch (e) {
        if (e instanceof Error && e.name === "ScriptDeath") throw e;
      }
    }
    return { rooted };
  });
}
