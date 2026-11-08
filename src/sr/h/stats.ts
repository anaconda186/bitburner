// Probe `stats`: the stats a split records (#49), all but the sleeves:
// hacking level, money, the player's hacking multiplier M and home's max RAM.
// getPlayer costs 0.5 GB, which the conductor can't afford.
// Value: ProbeValues["stats"] in `../helpers.ts`.
//
// RAM: the key "hack" is quoted on purpose. As a bare identifier it is
// charged like ns.hack (0.1 GB).
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => {
    const player = ns.getPlayer();
    return {
      "hack": player.skills.hacking,
      money: player.money,
      M: player.mults.hacking,
      homeRam: ns.getServerMaxRam("home"),
    };
  });
}
