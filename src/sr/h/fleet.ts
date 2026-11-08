// Probe `fleet` (#57): the cloud servers owned and their RAM, how many the
// BitNode allows, the most RAM one may have, and the money on hand: what the
// fleet rule (`../fleet.ts`) decides from. getServerNames alone is 1.05 GB,
// more than the conductor has left.
// Value: ProbeValues["fleet"] in `../helpers.ts`.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => ({
    servers: ns.cloud.getServerNames().map((host) => ({ host, ramGb: ns.getServerMaxRam(host) })),
    limit: ns.cloud.getServerLimit(),
    ramLimitGb: ns.cloud.getRamLimit(),
    money: ns.getServerMoneyAvailable("home"),
  }));
}
