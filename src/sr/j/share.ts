// Job script: one share of this server's RAM with the player's factions
// (10 s; reputation from faction work rises with the threads shared). The
// money engine launches it with the threads its share part wants (#58).
// Nothing else here: it is the smallest script that shares (4.00 GB).
import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  await ns.share();
}
