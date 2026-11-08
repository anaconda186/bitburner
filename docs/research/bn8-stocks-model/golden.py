"""Export decision cases from the model's traders, for the trader's unit tests
(seam C, issue #72: "behaviour agrees in direction with the model").

Each case is the market as the model's trader saw it just before one of its
steps, plus what that step did: which positions it closed and which it
opened, long or short, and its signed edge for every stock. The TypeScript
test feeds the same market to `decideTrades` and checks the directions agree.

Run:  python golden.py      (writes golden.json next to this file, a few seconds)
"""
import json
import numpy as np
from market_sim import Market, Trader, COMMISSION

SEEDS = (1000, 1001)
CASES_PER_RUN = 5
MAX_TICKS = 3000


def sig(x, digits=10):
    return float(f"{x:.{digits}g}")


def case(m, t, prices, mode, seed, tick):
    cash = t.cash
    stocks = []
    for i in range(m.n):
        s = {
            "sym": f"S{i:02d}",
            "ask": sig(m.ask()[i]),
            "bid": sig(m.bid()[i]),
            "maxShares": float(m.maxsh[i]),
            "long": float(m.long[i]),
            "longAvg": 0.0,
            "short": float(m.short[i]),
            "shortAvg": sig(m.avg_short[i]),
        }
        if mode == "oracle":
            s["forecast"] = sig(m.absf()[i] / 100)
            s["volatility"] = sig(m.mv[i] / 100)
        else:
            s["prices"] = [sig(p) for p in prices[-(t.W + 1):, i]]
        stocks.append(s)
    edges = t.edges()
    before_long, before_short = m.long.copy(), m.short.copy()
    t.step()
    closed, opened = [], []
    for i in range(m.n):
        sym = f"S{i:02d}"
        if before_long[i] > 0 and m.long[i] == 0:
            closed.append({"sym": sym, "side": "long"})
        if before_short[i] > 0 and m.short[i] == 0:
            closed.append({"sym": sym, "side": "short"})
        if before_long[i] == 0 and m.long[i] > 0:
            opened.append({"sym": sym, "side": "long"})
        if before_short[i] == 0 and m.short[i] > 0:
            opened.append({"sym": sym, "side": "short"})
    return {
        "seed": seed,
        "tick": tick,
        "mode": mode,
        "cash": sig(cash),
        "stocks": stocks,
        "modelEdges": [sig(e) for e in edges],
        "closed": closed,
        "opened": opened,
    }


def run(seed, mode):
    """The first CASES_PER_RUN steps at which the model's trader closed or opened something."""
    rng = np.random.default_rng(seed)
    m = Market(rng)
    t = Trader(m, mode, window=45)
    prices = [m.price.copy()]
    out = []
    for k in range(1, MAX_TICKS + 1):
        m.tick()
        prices.append(m.price.copy())
        c = case(m, t, np.array(prices), mode, seed, k)
        if c["closed"] or c["opened"]:
            out.append(c)
            if len(out) == CASES_PER_RUN:
                break
    return out


if __name__ == "__main__":
    cases = []
    for seed in SEEDS:
        cases += run(seed, "oracle")
        cases += run(seed, "infer")
    meta = {
        "source": "docs/research/bn8-stocks-model/golden.py",
        "commission": COMMISSION,
        "horizonTicks": 100,
        "trendTicks": 45,
        "note": "INFERENCE: cases from the hand-copied model, not from the game.",
    }
    with open("golden.json", "w") as f:
        json.dump({"meta": meta, "cases": cases}, f, separators=(",", ":"))
    print(f"wrote {len(cases)} cases")
