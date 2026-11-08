// The casino's rules (spec #41 "Casino"), pure and ns-free: how to play a
// blackjack hand, what to bet, when the cap is reached, how a hand went, and
// what the casino reports. The worker `h/casino.ts` reads the page and the
// game and does what these say.
//
// RAM: the casino imports this file (and `decide` may, for the casino's
// report), so no identifier here may be named like an NS function.

/**
 * Basic strategy for the game's blackjack (src/Casino/Blackjack.tsx): no
 * double, split or surrender, and the dealer stands on every 17, soft
 * included. `counts` is the player's "Count:" line (every value of 21 or
 * less; two when an ace can still count 11), `up` the dealer's face-up card
 * (2-10, an ace 11).
 */
export function shouldHit(counts: readonly number[], up: number): boolean {
  const best = Math.max(...counts);
  if (counts.length > 1) {
    // Soft: an ace still counts 11.
    if (best <= 17) return true;
    if (best === 18) return up >= 9;
    return false;
  }
  if (best <= 11) return true;
  if (best === 12) return !(up >= 4 && up <= 6);
  if (best <= 16) return up >= 7;
  return false;
}

/**
 * The values on a hand's "Count:" line ("Count: 7 or 17"), or undefined for
 * any other text.
 */
export function readCount(text: string): number[] | undefined {
  const m = /^Count:\s*(\d+(?:\s+or\s+\d+)*)\s*$/.exec(text.trim());
  if (m === null) return undefined;
  return (m[1] as string).split(/\s+or\s+/).map(Number);
}

/** A card's face as the table shows it ("A", "2"-"10", "J", "Q", "K"); undefined for a hidden card. */
export function cardValue(face: string): number | undefined {
  const f = face.trim();
  if (f === "A") return 11;
  if (f === "J" || f === "Q" || f === "K") return 10;
  const n = /^\d+$/.test(f) ? Number(f) : NaN;
  return n >= 2 && n <= 10 ? n : undefined;
}
