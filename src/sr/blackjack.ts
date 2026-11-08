// The casino's rules (spec #41 "Casino"), pure and ns-free: how to play a
// blackjack hand, what to bet, when the cap is reached, how a hand went, and
// what the casino reports. The worker `h/casino.ts` reads the page and the
// game and does what these say.
//
// RAM: the casino imports this file (and `decide` may, for the casino's
// report), so no identifier here may be named like an NS function.

/**
 * The casino's cap (src/Casino/Game.ts:4-18): the game refuses new hands once
 * net casino winnings since the last install pass this. The same number is
 * `ns.getMoneySources().sinceInstall.casino`, which is where the casino reads
 * it; never from the page (its dialog can sit hidden behind the Offline one).
 */
export const CASINO_CAP = 10e9;
/** The blackjack table's largest bet (src/Casino/Blackjack.tsx:16). */
export const MAX_BET = 100e6;

/** The cap is reached: `winnings` (net, since the install) is over CASINO_CAP. */
export function capReached(winnings: number): boolean {
  return winnings > CASINO_CAP;
}

/**
 * All in, up to the table's maximum, in whole dollars (the game rounds a bet).
 * 0 when there isn't a dollar to bet.
 */
export function betFor(money: number): number {
  return Math.max(0, Math.min(Math.floor(money), MAX_BET));
}

export type HandOutcome = "won" | "lost" | "push";

/**
 * How a hand went, from the player's money before Start and after the hand:
 * the bet is taken at Start and the payout added at the end, both at once.
 */
export function handOutcome(before: number, after: number): HandOutcome {
  if (after < before) return "lost";
  return after > before ? "won" : "push";
}

/**
 * The casino's argument (args[0], as JSON): `{ category }`, the run's
 * category from the state file. Save-scumming needs faked trusted clicks and
 * script reloads, which only Open allows, so any other category is refused.
 */
export function readCasinoArg(raw: unknown): { ok: true; category: "open" } | { ok: false; error: string } {
  const category = typeof raw === "object" && raw !== null ? (raw as { category?: unknown }).category : undefined;
  if (category === "open") return { ok: true, category };
  if (typeof category === "string") {
    return { ok: false, error: `the casino plays only in the Open category (faked clicks and script reloads), not ${category}` };
  }
  return { ok: false, error: `bad argument ${JSON.stringify(raw)}; expected { category: "open" }` };
}

/**
 * Where the casino is: `starting` (this load hasn't reached the table yet),
 * `playing`, `capped` (the cap is reached: it has launched boot.js, or is
 * about to, and exits) or `failed` (it threw; it launches boot.js and exits).
 */
export const CASINO_PHASES = ["starting", "playing", "capped", "failed"] as const;
export type CasinoPhase = (typeof CASINO_PHASES)[number];

/** The casino's report (its WorkerReport value). */
export type CasinoNews = {
  readonly host: string;
  readonly phase: CasinoPhase;
  /** Hands played by this load of the script (a reload starts again at 0). */
  readonly hands: number;
  /** Net casino winnings since the install, as last read (getMoneySources). */
  readonly winnings: number;
  readonly lastError: string | null;
};

/** The casino's news from its WorkerReport value; anything malformed is none. */
export function readCasinoNews(raw: unknown): CasinoNews | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const phase = CASINO_PHASES.find((p) => p === r.phase);
  if (typeof r.host !== "string" || phase === undefined || typeof r.winnings !== "number") return undefined;
  if (typeof r.hands !== "number" || !Number.isInteger(r.hands) || r.hands < 0) return undefined;
  if (r.lastError !== null && typeof r.lastError !== "string") return undefined;
  return { host: r.host, phase, hands: r.hands, winnings: r.winnings, lastError: r.lastError };
}

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
