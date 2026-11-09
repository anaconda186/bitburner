// Probe `stats`: the stats a split records (#49), all but the sleeves:
// hacking level, money, the player's hacking multiplier M and home's max RAM.
// getPlayer costs 0.5 GB, which the conductor can't afford. #56 adds the
// player's city and the net casino winnings since the install
// (getMoneySources, 1 GB), which tell decide where the casino stands.
// Value: ProbeValues["stats"] in `../helpers.ts`.
//
// RAM: the key "hack" is quoted on purpose. As a bare identifier it is
// charged like ns.hack (0.1 GB).
import type { NS } from "@ns";
import type { ProbeValues } from "../helpers.ts";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, (): ProbeValues["stats"] => {
    const player = ns.getPlayer();
    return {
      "hack": player.skills.hacking,
      money: player.money,
      M: player.mults.hacking,
      homeRam: ns.getServerMaxRam("home"),
      city: player.city,
      casinoWinnings: ns.getMoneySources().sinceInstall.casino,
    };
  });
}
