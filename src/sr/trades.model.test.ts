// Seam C against the BN8 model (docs/research/bn8-stocks-model/): the cases in
// golden.json are markets the model's own traders saw, with what they did.
// Regenerate with `python golden.py` in that folder. The model is INFERENCE
// (hand-copied mechanics), so this checks that the trader agrees with it in
// direction, not that either is right about the game.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { decideTrades, tickEdge, TRADER_TUNABLES, type StockView } from "./trades.ts";

type Side = "long" | "short";
type ModelCase = {
  seed: number;
  tick: number;
  mode: "oracle" | "infer";
  cash: number;
  stocks: StockView[];
  modelEdges: number[];
  closed: { sym: string; side: Side }[];
  opened: { sym: string; side: Side }[];
};

const golden = JSON.parse(
  readFileSync(new URL("../../docs/research/bn8-stocks-model/golden.json", import.meta.url), "utf8"),
) as { meta: { commission: number; horizonTicks: number; trendTicks: number }; cases: ModelCase[] };

const label = (c: ModelCase) => `${c.mode} seed ${c.seed} tick ${c.tick}`;
const sideOf = (kind: string): Side => (kind.endsWith("Long") ? "long" : "short");

describe("decideTrades agrees with the BN8 model", () => {
  test("the model uses the same commission, horizon and trend window", () => {
    expect(golden.meta).toMatchObject({
      commission: TRADER_TUNABLES.commission,
      horizonTicks: TRADER_TUNABLES.horizonTicks,
      trendTicks: TRADER_TUNABLES.trendTicks,
    });
  });

  for (const c of golden.cases) {
    const oracle = c.mode === "oracle";
    const orders = decideTrades({ cash: c.cash, oracle, stocks: c.stocks });
    const sells = orders.filter((o) => o.kind.startsWith("sell")).map((o) => ({ sym: o.sym, side: sideOf(o.kind) }));
    const buys = orders.filter((o) => o.kind.startsWith("buy")).map((o) => ({ sym: o.sym, side: sideOf(o.kind) }));

    test(`${label(c)}: every stock's edge points the model's way`, () => {
      c.stocks.forEach((s, i) => {
        const ours = tickEdge(s, oracle) ?? 0;
        const model = c.modelEdges[i] ?? NaN;
        expect(Math.sign(ours), s.sym).toBe(Math.sign(model));
        if (oracle) expect(Math.abs(ours - model), s.sym).toBeLessThanOrEqual(1e-8 * Math.abs(model) + 1e-12); // golden.json keeps 10 digits
      });
    });

    test(`${label(c)}: closes what the model closes`, () => {
      expect(sells).toEqual(c.closed);
    });

    // The model ranks by edge alone; the trader ranks by edge net of the
    // spread (spec #41), so their first picks can differ. Each buy must be
    // one the model's own entry rule (edge × horizon beats the round-trip
    // spread) would make, on the same side.
    test(`${label(c)}: opens positions only where the model would, on the model's side`, () => {
      expect(buys.length > 0, "the model opened a position, so should the trader").toBe(c.opened.length > 0);
      for (const b of buys) {
        const i = c.stocks.findIndex((s) => s.sym === b.sym);
        const s = c.stocks[i] as StockView;
        const edge = c.modelEdges[i] ?? NaN;
        const spread = (s.ask - s.bid) / (s.ask + s.bid);
        expect(Math.abs(edge) * golden.meta.horizonTicks, b.sym).toBeGreaterThan(2 * spread);
        expect(b.side, b.sym).toBe(edge > 0 ? "long" : "short");
      }
    });
  }
});
