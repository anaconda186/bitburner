// The trader's decision core (seam C): a plain market snapshot in, plain
// orders out. No `ns` here: the trader helper (`h/trader.ts`) reads the
// market, calls `decideTrades` once per market tick and places the orders.
//
// The rule (spec #41, "BN8 hooks and trader"; the model in
// docs/research/bn8-stocks-model/):
//   - A stock's edge is its expected move per tick, (2·forecast − 1) ·
//     volatility / 2: positive means long, negative short. The forecast and
//     volatility come from the 4S TIX API (the oracle trader) or are
//     estimated from the last `trendTicks` prices (the price-only trader).
//   - Over `horizonTicks` a position earns |edge| · horizon of its value and
//     pays the spread both ways and the commission on each transaction.
//     Stocks are ranked by that net rate, long and short, and the cash goes
//     to the best first, up to each stock's cap (long plus short shares are at
//     most `maxShares`, 20% of the company). A buy is made only if it earns
//     more than its commissions.
//   - Every tick the book is rebalanced: a position whose edge has flipped,
//     or fallen to `holdFraction` of the entry threshold, is sold, then the
//     free cash is invested. No limit or stop orders, no manipulation.
//
// RAM: the trader imports this file and pays for every identifier in it
// named like an NS function. Never name anything `window` (a 25 GB DOM charge).

/** Named tunables of the trader, with the spec's and the model's starting values. */
export const TRADER_TUNABLES = {
  /** Price-only forecast: prices this many ticks back (spec: 45). */
  trendTicks: 45,
  /** A price-only trend counts only if the share of up-ticks is this many standard errors from even (model: 1). */
  trendZ: 1,
  /** Ticks a position is expected to be held, to weigh the edge against costs (model: 100). */
  horizonTicks: 100,
  /** Hold a position while its edge beats this fraction of the entry threshold (model: 0.5). */
  holdFraction: 0.5,
  /** Per transaction (StockMarketConstants.StockMarketCommission). */
  commission: 100_000,
} as const;

export type TraderTunables = { readonly [K in keyof typeof TRADER_TUNABLES]: number };

/** One stock as the trader sees it this tick. */
export type StockView = {
  readonly sym: string;
  readonly ask: number;
  readonly bid: number;
  /** Long plus short shares may not exceed this (20% of the company). */
  readonly maxShares: number;
  readonly long: number;
  readonly longAvg: number;
  readonly short: number;
  readonly shortAvg: number;
  /** Oracle only: the chance of an up-tick (`getForecast`). */
  readonly forecast?: number;
  /** Oracle only: the largest fractional move in a tick (`getVolatility`). */
  readonly volatility?: number;
  /** Price-only: mid prices of past ticks, oldest first, this tick's last. */
  readonly prices?: readonly number[];
};

export type TradeSnapshot = {
  /** Money on hand. */
  readonly cash: number;
  /** True when the forecast and volatility come from the 4S TIX API. */
  readonly oracle: boolean;
  readonly stocks: readonly StockView[];
};

export type OrderKind = "sellLong" | "sellShort" | "buyLong" | "buyShort";
export type Order = { readonly kind: OrderKind; readonly sym: string; readonly shares: number };

/** Half the gap between ask and bid, as a fraction of the mid price: paid on each side of a trade. */
function spreadOf(s: StockView): number {
  return (s.ask - s.bid) / (s.ask + s.bid);
}

/**
 * The expected fractional move per tick, signed (positive: up), or null
 * when it can't be known yet (a price-only trader without enough history).
 */
export function tickEdge(s: StockView, oracle: boolean, t: TraderTunables = TRADER_TUNABLES): number | null {
  if (oracle) {
    if (s.forecast === undefined || s.volatility === undefined) return null;
    return ((2 * s.forecast - 1) * s.volatility) / 2;
  }
  return trendEdge(s.prices ?? [], t);
}

/**
 * The price-only estimate over the last `trendTicks` moves. The share of
 * up-ticks estimates the forecast; it counts only if it is more than `trendZ`
 * standard errors from even, else the edge is 0. Each tick moves the price by
 * a uniform fraction of the volatility, so the mean absolute log move is half
 * the volatility, and the edge is (2·ups/n − 1) times that mean.
 */
function trendEdge(prices: readonly number[], t: TraderTunables): number | null {
  const n = t.trendTicks;
  if (prices.length < n + 1) return null;
  const recent = prices.slice(prices.length - n - 1);
  let ups = 0;
  let moved = 0;
  for (let i = 1; i <= n; i++) {
    const now = recent[i] ?? 0;
    const before = recent[i - 1] ?? 0;
    if (now > before) ups++;
    moved += Math.abs(Math.log(now / before));
  }
  const upShare = ups / n;
  if (Math.abs(upShare - 0.5) <= t.trendZ * Math.sqrt(0.25 / n)) return 0;
  return (2 * upShare - 1) * (moved / n);
}

/** What selling a whole long position brings in. */
function longProceeds(s: StockView, t: TraderTunables): number {
  return s.long * s.bid - t.commission;
}

/** What covering a whole short position brings in: the stake back plus the gain. */
function shortProceeds(s: StockView, t: TraderTunables): number {
  return s.short * s.shortAvg + (s.shortAvg - s.ask) * s.short - t.commission;
}

/** Cash plus what every position would fetch if it were sold now. */
export function netWorth(snapshot: TradeSnapshot, t: TraderTunables = TRADER_TUNABLES): number {
  let worth = snapshot.cash;
  for (const s of snapshot.stocks) {
    if (s.long > 0) worth += longProceeds(s, t);
    if (s.short > 0) worth += shortProceeds(s, t);
  }
  return worth;
}

/** The price history after one more tick: only as much as the trend window needs. */
export function appendPrice(prices: readonly number[], mid: number, t: TraderTunables = TRADER_TUNABLES): number[] {
  return [...prices, mid].slice(-(t.trendTicks + 1));
}

/**
 * Whether a held position (long when `long`) has lost its edge: the edge has
 * flipped or gone flat, or no longer beats `holdFraction` of the round-trip
 * spread. An unknown edge keeps the position.
 */
function shouldExit(s: StockView, edge: number | null, long: boolean, t: TraderTunables): boolean {
  if (edge === null) return false;
  if (long ? edge <= 0 : edge >= 0) return true;
  return Math.abs(edge) * t.horizonTicks <= t.holdFraction * 2 * spreadOf(s);
}

export function decideTrades(snapshot: TradeSnapshot, t: TraderTunables = TRADER_TUNABLES): Order[] {
  const orders: Order[] = [];
  let cash = snapshot.cash;
  const views = snapshot.stocks.map((s) => {
    const edge = tickEdge(s, snapshot.oracle, t);
    let after = s;
    if (s.long > 0 && shouldExit(s, edge, true, t)) {
      orders.push({ kind: "sellLong", sym: s.sym, shares: s.long });
      cash += longProceeds(s, t);
      after = { ...after, long: 0, longAvg: 0 };
    }
    if (s.short > 0 && shouldExit(s, edge, false, t)) {
      orders.push({ kind: "sellShort", sym: s.sym, shares: s.short });
      cash += shortProceeds(s, t);
      after = { ...after, short: 0, shortAvg: 0 };
    }
    return { s: after, edge, net: edge === null ? 0 : Math.abs(edge) * t.horizonTicks - 2 * spreadOf(s) };
  });
  const ranked = views.filter((r) => r.edge !== null && r.edge !== 0 && r.net > 0).sort((a, b) => b.net - a.net);
  for (const { s, edge, net } of ranked) {
    const goLong = (edge ?? 0) > 0;
    // Never hold both sides of one stock.
    if (goLong ? s.short > 0 : s.long > 0) continue;
    const px = goLong ? s.ask : s.bid;
    const room = s.maxShares - s.long - s.short;
    const shares = Math.min(room, Math.floor((cash - t.commission) / px));
    if (!(shares > 0)) continue;
    // A new position pays a commission to open and one to close; a top-up
    // pays only its own, since the whole position is sold in one go.
    const held = goLong ? s.long > 0 : s.short > 0;
    if (shares * px * net <= (held ? 1 : 2) * t.commission) continue;
    orders.push({ kind: goLong ? "buyLong" : "buyShort", sym: s.sym, shares });
    cash -= shares * px + t.commission;
  }
  return orders;
}
