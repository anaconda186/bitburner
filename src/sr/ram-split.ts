// The RAM split rule (spec #41 user story 62; #22's "How spare RAM is split"):
// where the run is in the reset decides how the money engine's RAM is split
// between money, the exp farm and share. Pure; decide.ts works out the point.
//
// RAM: the conductor imports this file. No identifier may be named like an NS
// function (`share`, `hack`, `grow`...), hence `sharing` and `shareFraction`.
import { SPLIT_MONEY, SPLIT_OFF, type RamSplit } from "./money-engine.ts";

export const SPLIT_TUNABLES = {
  /** How long the exp start lasts after the fleet is bought, ms. */
  expStartMs: 600_000,
  /** The share part while working for rep under `donateFavor`. */
  shareFraction: 0.25,
  /** At this favor, faction work turns to money for donations. */
  donateFavor: 150,
} as const;
export type SplitTunables = { readonly [K in keyof typeof SPLIT_TUNABLES]: number };

/**
 * A point in the reset, as far as the split cares:
 * - `off`: nothing launches (route unknown, BN8 for now; the casino, #56);
 * - `expStart`: the first `expStartMs` after the fleet is bought;
 * - `saving`: money for planned purchases (the default);
 * - `working`: working for faction rep (#59 and later), at the faction's favor;
 * - `climb`: the final climb (#64); also BN8's exp-only engine, once on.
 */
export type ResetPoint =
  | { readonly kind: "off" }
  | { readonly kind: "expStart" }
  | { readonly kind: "saving" }
  | { readonly kind: "working"; readonly favor: number }
  | { readonly kind: "climb" };

const SPLIT_EXP: RamSplit = { money: 0, exp: 1, sharing: 0 };

export function ramSplit(point: ResetPoint, t: SplitTunables = SPLIT_TUNABLES): RamSplit {
  switch (point.kind) {
    case "off":
      return SPLIT_OFF;
    case "expStart":
    case "climb":
      return SPLIT_EXP;
    case "saving":
      return SPLIT_MONEY;
    case "working":
      return point.favor >= t.donateFavor ? SPLIT_MONEY : { money: 0, exp: 1 - t.shareFraction, sharing: t.shareFraction };
  }
}
