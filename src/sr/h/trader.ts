// Worker `trader`: the BN8 stock trader (spec #41, seam C). A long-lived
// helper the conductor starts, and starts again after a reload or a death.
// Once per market tick it reads every stock, asks `decideTrades` what to do,
// places the orders and posts a report to its status port.
//
// Launched like a helper: args[0] its JSON argument (none yet: "null"),
// args[1] its status port (WORKERS.trader in `../helpers.ts`). The oracle
// trader runs whenever the 4S TIX API is owned, so buying it mid-run switches
// the trader over on the next tick. Positions are read from the game every
// tick, so a restarted trader takes over what the last one held; a
// price-only trader only holds them until it has its 45 ticks of prices.
//
// This thin shell is covered by the in-game checks only. It imports nothing
// but `./serve.ts` and `../trades.ts` (copied with it off home: WORKERS.files).
// RAM: every stock call named here is charged once; see tools/ram-budget.ts.
import type { NS } from "@ns";
import { appendPrice, decideTrades, netWorth, type Order, type StockView, type TradeSnapshot } from "../trades.ts";
import { decodeHelperArgs, postReport } from "./serve.ts";

/** What the trader posts each tick (WorkerReport.value). */
export type TraderNews = {
  readonly ticks: number;
  readonly oracle: boolean;
  readonly cash: number;
  /** netWorth at the start of the last tick: cash plus positions as if sold. */
  readonly worth: number;
  readonly positions: number;
  /** Orders the game carried out since the trader started; `closes` of them were sales. */
  readonly orders: number;
  readonly closes: number;
  readonly failedOrders: number;
  readonly lastError: string | null;
};

function isScriptDeath(e: unknown): boolean {
  return e instanceof Error && e.name === "ScriptDeath";
}

/** A market tick is 6 s of game time; after a failed tick, wait about one. */
const RETRY_MS = 6000;

/** One stock now, with this tick's mid price added to its history. */
function readStock(ns: NS, sym: string, oracle: boolean, history: Map<string, number[]>): StockView {
  const [long, longAvg, short, shortAvg] = ns.stock.getPosition(sym);
  const ask = ns.stock.getAskPrice(sym);
  const bid = ns.stock.getBidPrice(sym);
  const prices = appendPrice(history.get(sym) ?? [], (ask + bid) / 2);
  history.set(sym, prices);
  const view: StockView = { sym, ask, bid, maxShares: ns.stock.getMaxShares(sym), long, longAvg, short, shortAvg, prices };
  if (!oracle) return view;
  return { ...view, forecast: ns.stock.getForecast(sym), volatility: ns.stock.getVolatility(sym) };
}

/**
 * Makes one trade at market; the game returns the price paid, or 0 when it
 * refused. (Not called placeOrder: that is the limit-order call, 2.5 GB.)
 */
function trade(ns: NS, o: Order): boolean {
  switch (o.kind) {
    case "buyLong":
      return ns.stock.buyStock(o.sym, o.shares) > 0;
    case "sellLong":
      return ns.stock.sellStock(o.sym, o.shares) > 0;
    case "buyShort":
      return ns.stock.buyShort(o.sym, o.shares) > 0;
    case "sellShort":
      return ns.stock.sellShort(o.sym, o.shares) > 0;
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const decoded = decodeHelperArgs(ns.args);
  if (decoded.port === undefined || !decoded.ok) {
    ns.tprint(`ERROR trader: ${decoded.ok ? "" : decoded.error}`);
    return;
  }
  const port = decoded.port;
  const history = new Map<string, number[]>();
  let news: TraderNews = {
    ticks: 0,
    oracle: false,
    cash: 0,
    worth: 0,
    positions: 0,
    orders: 0,
    closes: 0,
    failedOrders: 0,
    lastError: null,
  };
  postReport(ns, port, news);
  let failures = 0;
  for (;;) {
    try {
      await ns.stock.nextUpdate();
      const oracle = ns.stock.has4SDataTixApi();
      const stocks = ns.stock.getSymbols().map((sym) => readStock(ns, sym, oracle, history));
      const snapshot: TradeSnapshot = { cash: ns.getServerMoneyAvailable("home"), oracle, stocks };
      let failed = 0;
      let closes = 0;
      const orders = decideTrades(snapshot);
      for (const o of orders) {
        if (trade(ns, o)) {
          if (o.kind.startsWith("sell")) closes++;
          ns.print(`${o.kind} ${o.shares} ${o.sym}`);
        } else {
          failed++;
          ns.print(`WARN trader: ${o.kind} ${o.shares} ${o.sym} refused`);
        }
      }
      news = {
        ticks: news.ticks + 1,
        oracle,
        cash: snapshot.cash,
        worth: netWorth(snapshot),
        positions: stocks.filter((s) => s.long > 0 || s.short > 0).length,
        orders: news.orders + orders.length - failed,
        closes: news.closes + closes,
        failedOrders: news.failedOrders + failed,
        lastError: news.lastError,
      };
      failures = 0;
    } catch (e) {
      if (isScriptDeath(e)) throw e;
      // One bad tick is not fatal. The pause matters: a call that throws at
      // once (no TIX access) must not spin the loop.
      failures++;
      const text = e instanceof Error ? e.message : String(e);
      if (failures === 1) ns.tprint(`ERROR trader: tick failed, carrying on: ${text}`);
      else ns.print(`ERROR trader: tick failed (${failures} in a row): ${text}`);
      news = { ...news, lastError: text };
      postReport(ns, port, news);
      await ns.sleep(RETRY_MS);
      continue;
    }
    postReport(ns, port, news);
  }
}
