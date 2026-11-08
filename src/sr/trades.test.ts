// Seam C: a market snapshot in, trade orders out (spec #41, "BN8 hooks and
// trader"). Expected values are worked by hand from the edge rule:
// edge per tick = (2·forecast − 1) · volatility / 2, held for 100 ticks,
// less the spread both ways and $100k commission per transaction.
import { describe, expect, test } from "vitest";
import { appendPrice, decideTrades, netWorth, TRADER_TUNABLES, type StockView, type TradeSnapshot } from "./trades.ts";

/** A stock at mid price 100 with a 0.5% spread, no edge, no position, no cap to speak of. */
function stock(sym: string, over: Partial<StockView> = {}): StockView {
  return { sym, ask: 100.5, bid: 99.5, maxShares: 1e9, long: 0, longAvg: 0, short: 0, shortAvg: 0, forecast: 0.5, volatility: 0.02, ...over };
}

function oracle(cash: number, stocks: StockView[]): TradeSnapshot {
  return { cash, oracle: true, stocks };
}

describe("decideTrades: edge ranking", () => {
  test("puts the cash into the stock with the larger edge, long", () => {
    // A: (0.1)(0.01) = 0.001/tick; B: (0.3)(0.01) = 0.003/tick.
    const orders = decideTrades(oracle(1e9, [stock("A", { forecast: 0.55 }), stock("B", { forecast: 0.65 })]));
    // floor((1e9 − 1e5) / 100.5) = 9_949_253
    expect(orders).toEqual([{ kind: "buyLong", sym: "B", shares: 9_949_253 }]);
  });

  test("weighs the forecast by volatility: a weaker forecast that moves more wins", () => {
    // A: (0.2)(0.005) = 0.001/tick; B: (0.1)(0.02) = 0.002/tick.
    const orders = decideTrades(oracle(1e9, [stock("A", { forecast: 0.6, volatility: 0.01 }), stock("B", { forecast: 0.55, volatility: 0.04 })]));
    expect(orders.map((o) => o.sym)).toEqual(["B"]);
  });

  test("shorts a stock forecast to fall, at the bid", () => {
    const orders = decideTrades(oracle(1e9, [stock("A", { forecast: 0.55 }), stock("B", { forecast: 0.3 })]));
    // floor((1e9 − 1e5) / 99.5) = 10_049_246
    expect(orders).toEqual([{ kind: "buyShort", sym: "B", shares: 10_049_246 }]);
  });

  test("leaves a stock alone when its edge doesn't beat the spread", () => {
    // (0.02)(0.01)·100 = 0.02 over the horizon, against 2 × 1.5% = 0.03 of spread.
    expect(decideTrades(oracle(1e9, [stock("A", { forecast: 0.51, ask: 101.5, bid: 98.5 })]))).toEqual([]);
  });

  test("uses the real tunables: a 45-tick trend window and $100k commission", () => {
    expect(TRADER_TUNABLES.trendTicks).toBe(45);
    expect(TRADER_TUNABLES.commission).toBe(100_000);
  });
});

describe("decideTrades: the 20% cap", () => {
  test("buys no more than the cap and puts the rest into the next-best stock", () => {
    const orders = decideTrades(oracle(1e9, [stock("A", { forecast: 0.55 }), stock("B", { forecast: 0.65, maxShares: 1_000_000 })]));
    // B: 1e6 × 100.5 + 1e5 = 100_600_000 spent; A gets floor((899_400_000 − 1e5) / 100.5) = 8_948_258.
    expect(orders).toEqual([
      { kind: "buyLong", sym: "B", shares: 1_000_000 },
      { kind: "buyLong", sym: "A", shares: 8_948_258 },
    ]);
  });

  test("counts shares already held, long and short, against the cap", () => {
    const held = stock("B", { forecast: 0.65, maxShares: 1_000_000, long: 600_000, longAvg: 100 });
    expect(decideTrades(oracle(1e9, [held]))).toEqual([{ kind: "buyLong", sym: "B", shares: 400_000 }]);
    const full = stock("B", { forecast: 0.35, maxShares: 1_000_000, short: 1_000_000, shortAvg: 100 });
    expect(decideTrades(oracle(1e9, [full]))).toEqual([]);
  });
});

describe("decideTrades: commission", () => {
  // Edge (0.3)(0.01) = 0.003/tick: 0.3 over 100 ticks, less 2 × 0.5% spread = 0.29.
  const good = () => stock("A", { forecast: 0.65 });

  test("makes no new position whose expected gain doesn't cover two commissions", () => {
    // $600k buys 4_975 shares: 4_975 × 100.5 × 0.29 ≈ $145k, under the $200k round trip.
    expect(decideTrades(oracle(600_000, [good()]))).toEqual([]);
    // $1m buys 8_955 shares: ≈ $261k expected, so it trades.
    expect(decideTrades(oracle(1_000_000, [good()]))).toEqual([{ kind: "buyLong", sym: "A", shares: 8_955 }]);
  });

  test("tops up a position only when the extra shares cover their one commission", () => {
    const held = stock("A", { forecast: 0.65, long: 1_000_000, longAvg: 100 });
    // $400k more buys 2_985 shares, ≈ $87k expected: under $100k.
    expect(decideTrades(oracle(400_000, [held]))).toEqual([]);
    // $500k buys 3_980 shares, ≈ $116k expected.
    expect(decideTrades(oracle(500_000, [held]))).toEqual([{ kind: "buyLong", sym: "A", shares: 3_980 }]);
  });

  test("never spends the commission it can't pay", () => {
    expect(decideTrades(oracle(100_000, [good()]))).toEqual([]);
  });
});

describe("decideTrades: rebalancing every tick", () => {
  test("sells a long whose forecast has turned, then shorts it with the proceeds", () => {
    const held = stock("A", { forecast: 0.4, long: 1_000_000, longAvg: 90 });
    // Sale: 1e6 × 99.5 − 1e5 = 99_400_000; short floor((99_400_000 − 1e5) / 99.5) = 997_989.
    expect(decideTrades(oracle(0, [held]))).toEqual([
      { kind: "sellLong", sym: "A", shares: 1_000_000 },
      { kind: "buyShort", sym: "A", shares: 997_989 },
    ]);
  });

  test("covers a short whose forecast has turned, then goes long with the proceeds", () => {
    const held = stock("A", { forecast: 0.6, short: 1_000_000, shortAvg: 100 });
    // Cover: 1e6 × 100 + (100 − 100.5) × 1e6 − 1e5 = 99_400_000; long floor((… − 1e5) / 100.5) = 988_059.
    expect(decideTrades(oracle(0, [held]))).toEqual([
      { kind: "sellShort", sym: "A", shares: 1_000_000 },
      { kind: "buyLong", sym: "A", shares: 988_059 },
    ]);
  });

  test("holds a weakened position until its edge falls below half the entry threshold", () => {
    // Entry needs |edge| × 100 > 2 × 0.5% = 0.01; holding needs > 0.005.
    // 0.504: (0.008)(0.01) × 100 = 0.008, kept (and too weak to add to). 0.502: 0.004, sold.
    const held = (forecast: number) => stock("A", { forecast, long: 1_000_000, longAvg: 100 });
    expect(decideTrades(oracle(1e9, [held(0.504)]))).toEqual([]);
    expect(decideTrades(oracle(0, [held(0.502)]))).toEqual([{ kind: "sellLong", sym: "A", shares: 1_000_000 }]);
  });

  test("sells first and moves the freed cash into the best stock", () => {
    const orders = decideTrades(
      oracle(0, [stock("A", { forecast: 0.5, long: 1_000_000, longAvg: 100 }), stock("B", { forecast: 0.3 })]),
    );
    expect(orders).toEqual([
      { kind: "sellLong", sym: "A", shares: 1_000_000 },
      { kind: "buyShort", sym: "B", shares: 997_989 },
    ]);
  });

  test("keeps a good position rather than swapping it for a slightly better one", () => {
    const orders = decideTrades(
      oracle(0, [stock("A", { forecast: 0.6, long: 1_000_000, longAvg: 100 }), stock("B", { forecast: 0.65 })]),
    );
    expect(orders).toEqual([]);
  });
});

/** Mid prices from 100 for 45 ticks, the first `ups` up and the rest down, each by `step`. */
function walk(ups: number, step = 0.01, ticks = 45): number[] {
  const prices = [100];
  for (let i = 0; i < ticks; i++) {
    const last = prices[prices.length - 1] ?? 100;
    prices.push(i < ups ? last * (1 + step) : last / (1 + step));
  }
  return prices;
}

function priceOnly(cash: number, stocks: StockView[]): TradeSnapshot {
  return { cash, oracle: false, stocks: stocks.map(({ forecast: _f, volatility: _v, ...rest }) => rest) };
}

describe("decideTrades: price-only versus oracle forecasts", () => {
  test("goes long on a stock that rose on 35 of the last 45 ticks", () => {
    expect(decideTrades(priceOnly(1e9, [stock("A", { prices: walk(35) })]))).toEqual([
      { kind: "buyLong", sym: "A", shares: 9_949_253 },
    ]);
  });

  test("goes short on a stock that fell on 35 of the last 45 ticks", () => {
    expect(decideTrades(priceOnly(1e9, [stock("A", { prices: walk(10) })]))).toEqual([
      { kind: "buyShort", sym: "A", shares: 10_049_246 },
    ]);
  });

  test("the oracle trader follows the API forecast, not the price history", () => {
    const a = stock("A", { prices: walk(35), forecast: 0.3 });
    expect(decideTrades(oracle(1e9, [a])).map((o) => o.kind)).toEqual(["buyShort"]);
    expect(decideTrades(priceOnly(1e9, [a])).map((o) => o.kind)).toEqual(["buyLong"]);
  });

  test("makes no new trade until it has 45 ticks of prices, and keeps what it holds", () => {
    const short = walk(35).slice(1); // 44 moves
    expect(decideTrades(priceOnly(1e9, [stock("A", { prices: short })]))).toEqual([]);
    expect(decideTrades(priceOnly(0, [stock("A", { prices: [], long: 1_000_000, longAvg: 100 })]))).toEqual([]);
  });

  test("uses only the last 45 ticks", () => {
    const old = [...walk(0, 0.01, 30), ...walk(35).slice(1).map((p) => p * 0.74)];
    expect(decideTrades(priceOnly(1e9, [stock("A", { prices: old })])).map((o) => o.kind)).toEqual(["buyLong"]);
  });

  test("reads 25 up-ticks of 45 as noise: no trade, and a held position is sold", () => {
    // 25/45 = 0.556 is within one standard error, sqrt(0.25/45) = 0.075, of even.
    expect(decideTrades(priceOnly(1e9, [stock("A", { prices: walk(25) })]))).toEqual([]);
    expect(decideTrades(priceOnly(0, [stock("A", { prices: walk(25), long: 1_000_000, longAvg: 100 })]))).toEqual([
      { kind: "sellLong", sym: "A", shares: 1_000_000 },
    ]);
  });

  test("estimates volatility from the size of the moves: the same trend in bigger steps wins", () => {
    const orders = decideTrades(priceOnly(1e9, [stock("A", { prices: walk(40, 0.005) }), stock("B", { prices: walk(40, 0.02) })]));
    expect(orders.map((o) => o.sym)).toEqual(["B"]);
  });

  test("the trader keeps just enough history: the last 46 prices", () => {
    let prices: number[] = [];
    for (let i = 1; i <= 50; i++) prices = appendPrice(prices, i);
    expect(prices).toEqual(Array.from({ length: 46 }, (_, i) => i + 5));
  });
});

describe("netWorth: what everything would fetch if sold now", () => {
  test("cash plus each position at the bid (long) or the ask (short), less a commission each", () => {
    const s = oracle(1e6, [
      stock("A", { long: 1_000_000, longAvg: 90 }), // 99_500_000 − 100_000
      stock("B", { short: 1_000_000, shortAvg: 100 }), // 100_000_000 − 500_000 − 100_000
      stock("C"),
    ]);
    expect(netWorth(s)).toBe(1e6 + 99_400_000 + 99_400_000);
  });
});
