// Job script: one weaken of args[0], landing args[1] ms later than it would
// (additionalMsec). The money engine launches it with the threads it wants.
// Nothing else here: it is the smallest script that weakens (1.75 GB).
import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  await ns.weaken(String(ns.args[0]), { additionalMsec: Number(ns.args[1] ?? 0) });
}
