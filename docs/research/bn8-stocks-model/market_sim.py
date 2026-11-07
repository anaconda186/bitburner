"""Monte Carlo model of the BN8 stock market and a trader, for issue #26.

Mechanics are copied by hand from the game's source at tag v3.0.1 (see the
findings file for the links). Nothing here has been run against the game.
Every number this prints is INFERENCE.

Run:  python market_sim.py            (about 5-10 minutes, numpy needed)
      python market_sim.py quick      (a few seeds, for a smoke check)

Trader strategies
  oracle   reads the exact forecast (needs 4S Market Data TIX API, $25b in BN8)
  infer    sees only prices and estimates direction from the last W ticks
  oracle+pin  oracle, plus an upper bound on hack/grow manipulation: the
           second-order forecast of every held stock is forced to 100 (long)
           or 0 (short) every tick, at no RAM cost
"""
import sys
import numpy as np
from stocks_data import STOCKS

TICK_S = 6.0            # msPerStockUpdate / 1000 (Constants.ts)
TICKS_PER_CYCLE = 75
COMMISSION = 100e3
START_CASH = 250e6
API_COST = 25e9         # MarketDataTixApi4SCost * FourSigmaMarketDataApiCost(1)
UI_4S_COST = 1e9        # MarketData4SCost: UI only, no API access


class Market:
    def __init__(self, rng):
        self.rng = rng
        n = len(STOCKS)
        self.n = n
        draw = lambda r: (rng.integers(int(r[0]), int(r[1]) + 1, size=1)[0] / r[2]) if r[0] != r[1] else r[0] / r[2]
        self.price = np.array([draw(s[2]) for s in STOCKS])
        self.mv = np.array([draw(s[4]) for s in STOCKS])            # percent
        self.spread = np.array([draw(s[6]) for s in STOCKS])        # percent
        self.shtx = np.array([draw(s[7]) for s in STOCKS])
        self.b = np.array([s[1] for s in STOCKS])
        self.otl = np.array([s[5] for s in STOCKS], dtype=float)
        self.cap = np.array([rng.integers(int(p * 1e3), int(p * 25e3) + 1) for p in self.price], dtype=float)
        mc = np.array([s[3] for s in STOCKS])
        total = np.round(mc / self.price / 1e5) * 1e5
        self.maxsh = np.round(total * 0.2 / 1e5) * 1e5
        self.ff = self.absf()
        self.until = self.shtx.copy()
        self.ticks_to_cycle = int(rng.integers(1, TICKS_PER_CYCLE + 1))
        self.long = np.zeros(n)
        self.short = np.zeros(n)
        self.avg_short = np.zeros(n)
        self.hist = []
        self.cum = [np.zeros(n)]

    def absf(self):
        return np.where(self.b, 50 + self.otl, 50 - self.otl)

    def ask(self):
        return self.price * (1 + self.spread / 100)

    def bid(self):
        return self.price * (1 - self.spread / 100)

    # StockMarket.ts processStockPrices
    def tick(self):
        rng, n = self.rng, self.n
        self.ticks_to_cycle -= 1
        if self.ticks_to_cycle <= 0:
            flip = rng.random(n) < 0.45
            self.b = np.where(flip, ~self.b, self.b)
            self.ff = np.where(flip, 100 - self.ff, self.ff)
            self.ticks_to_cycle = TICKS_PER_CYCLE
        v = rng.random()
        av = v * self.mv / 100
        chc = np.where(self.b, 50 + self.otl, 50 - self.otl) / 100
        capped = self.price >= self.cap
        chc = np.where(capped, 0.1, chc)
        self.b = np.where(capped, False, self.b)
        up = rng.random(n) < chc
        old = self.price
        self.price = np.where(up, old * (1 + av), old / (1 + av))
        self.hist.append(up)
        self.cum.append(self.cum[-1] + up)
        # forecast drift (Stock.cycleForecast / cycleForecastForecast)
        chg = self.otl * av
        chg = np.where(self.otl < 5, np.where(self.otl <= 1, 1.0, chg * 10), chg)
        inc = (50 + np.clip(self.ff - self.absf(), -45, 45)) / 100
        r = rng.random(n) < inc
        delta = np.where(r == self.b, chg, -chg)       # increase+bull or decrease+bear -> +chg
        self.otl = np.minimum(self.otl + delta, 50)
        neg = self.otl < 0
        self.otl = np.where(neg, -self.otl, self.otl)
        self.b = np.where(neg, ~self.b, self.b)
        self.ff = np.clip(self.ff + np.where(rng.random(n) < 0.5, chg / 2, -chg / 2), 0, 100)
        self.until = np.minimum(self.until + 10, self.shtx)

    # StockMarketHelpers.processTransactionForecastMovement
    def influence(self, i, shares):
        shares = min(shares, self.maxsh[i])
        if shares <= 0:
            return
        first = self.until[i]
        if shares <= first:
            self.until[i] -= shares
            if self.until[i] <= 0:
                self.until[i] = self.shtx[i]
                self._infl(i, 0.006)
            return
        rem = shares - first
        iters = 1 + np.ceil(rem / self.shtx[i])
        self.until[i] = self.shtx[i] - ((shares - self.until[i]) % self.shtx[i])
        if self.until[i] == self.shtx[i] or self.until[i] <= 0:
            iters += 1
            self.until[i] = self.shtx[i]
        self._infl(i, 0.006 * (iters - 1))

    def _infl(self, i, change):
        if self.otl[i] > 5:
            self.otl[i] = max(5, self.otl[i] - change)
        d = change * self.mv[i] / 100
        if self.ff[i] > 50:
            self.ff[i] = max(50, self.ff[i] - d)
        elif self.ff[i] < 50:
            self.ff[i] = min(50, self.ff[i] + d)

    def worth(self, cash):
        lv = (self.long * self.bid() - COMMISSION * (self.long > 0)).sum()
        sv = (self.short * self.avg_short + (self.avg_short - self.ask()) * self.short
              - COMMISSION * (self.short > 0)).sum()
        return cash + lv + sv


class Trader:
    def __init__(self, m, mode, window=30, horizon=100, zthr=1.0, pin=False):
        self.m, self.mode, self.W, self.H, self.z, self.pin = m, mode, window, horizon, zthr, pin
        self.cash = START_CASH
        self.has_api = False
        self.paid_api = False

    def edges(self):
        m = self.m
        if self.mode == "oracle":
            f = m.absf() / 100
            return (2 * f - 1) * m.mv / 200           # signed expected fractional return per tick: (2p-1) * E[av], E[av] = mv/200 (av = v*mv/100)
        # price-only estimate over the last W ticks
        if len(m.hist) < self.W:
            return np.zeros(m.n)
        ph = (m.cum[-1] - m.cum[-1 - self.W]) / self.W
        sig = np.sqrt(0.25 / self.W)
        e = (2 * ph - 1)
        # the average step size is observable from prices; use mv/200 as its mean
        edge = e * m.mv / 200
        edge = np.where(np.abs(ph - 0.5) > self.z * sig, edge, 0.0)
        return edge

    def sell_all(self, i):
        m = self.m
        if m.long[i] > 0:
            g = m.long[i] * m.bid()[i] - COMMISSION
            self.cash += g
            m.influence(i, m.long[i])
            m.long[i] = 0
        if m.short[i] > 0:
            g = m.short[i] * m.avg_short[i] + (m.avg_short[i] - m.ask()[i]) * m.short[i] - COMMISSION
            self.cash += g
            m.influence(i, m.short[i])
            m.short[i] = 0
            m.avg_short[i] = 0

    def step(self):
        m = self.m
        e = self.edges()
        cost = 2 * m.spread / 100
        good = np.abs(e) * self.H > cost
        # exit positions that lost their edge or flipped
        for i in np.nonzero((m.long > 0) | (m.short > 0))[0]:
            held_long = m.long[i] > 0
            if (held_long and e[i] <= 0) or ((not held_long) and e[i] >= 0) or not (np.abs(e[i]) * self.H > cost[i] * 0.5):
                self.sell_all(i)
        wealth = m.worth(self.cash)
        order = np.argsort(-np.abs(e))
        for i in order:
            if not good[i] or self.cash < 2 * COMMISSION + 1e6:
                continue
            if m.long[i] > 0 or m.short[i] > 0:
                continue
            px = m.ask()[i] if e[i] > 0 else m.bid()[i]
            cap_sh = m.maxsh[i]
            shares = min(np.floor((self.cash - COMMISSION) / px), cap_sh)
            if shares < 1:
                continue
            if e[i] > 0:
                self.cash -= shares * px + COMMISSION
                m.long[i] = shares
            else:
                self.cash -= shares * px + COMMISSION
                m.short[i] = shares
                m.avg_short[i] = px
            m.influence(i, shares)
        if self.pin:
            m.ff = np.where(m.long > 0, 100.0, np.where(m.short > 0, 0.0, m.ff))


def run(seed, mode, window=30, horizon=100, zthr=1.0, pin=False, switch_to_oracle_at=None,
        buy_at=None, goal=2.6e12, max_ticks=15000):
    """Returns dict of milestone -> tick. switch_to_oracle_at: net worth at which the
    trader pays API_COST and switches from 'infer' to 'oracle' (None = never).
    buy_at overrides the price paid for the switch (e.g. UI_4S_COST for the DOM-scrape idea)."""
    rng = np.random.default_rng(seed)
    m = Market(rng)
    t = Trader(m, mode, window, horizon, zthr, pin)
    marks = {1e9: None, 25e9: None, 100e9: None, 1e12: None, goal: None}
    for k in range(1, max_ticks + 1):
        m.tick()
        t.step()
        w = m.worth(t.cash)
        if switch_to_oracle_at and t.mode == "infer" and w >= switch_to_oracle_at:
            # liquidate to pay, then continue with perfect information
            for i in range(m.n):
                t.sell_all(i)
            price = buy_at if buy_at is not None else API_COST
            if t.cash > price:
                t.cash -= price
                t.mode = "oracle"
        for key in marks:
            if marks[key] is None and w >= key:
                marks[key] = k
        if marks[goal] is not None:
            break
    return marks


def summarise(label, results, goal):
    keys = sorted(results[0].keys())
    print(f"\n{label}  ({len(results)} seeds, tick = {TICK_S:.0f} s; 'never' = not reached in the tick limit)")
    for key in keys:
        ts = np.array([r[key] if r[key] is not None else np.inf for r in results], dtype=float)
        ok = np.isfinite(ts)
        if ok.sum() == 0:
            print(f"  reach {key:9.2e}: never")
            continue
        srt = np.sort(ts); q = [srt[int(len(srt) * f)] for f in (0.1, 0.5, 0.9)]
        fmt = lambda x: "never" if not np.isfinite(x) else f"{x * TICK_S / 3600:5.1f} h"
        print(f"  reach {key:9.2e}: p10 {fmt(q[0])}  median {fmt(q[1])}  p90 {fmt(q[2])}  reached {ok.mean():.0%}")


if __name__ == "__main__":
    quick = len(sys.argv) > 1 and sys.argv[1] == "quick"
    N = 6 if quick else 40
    seeds = range(1000, 1000 + N)
    cfgs = [
        ("oracle from t=0 (not buyable: ignores the $25b entry fee)", dict(mode="oracle")),
        ("oracle+pin from t=0 (upper bound, ignores fee and RAM)", dict(mode="oracle", pin=True)),
        ("infer only, W=30", dict(mode="infer", window=30)),
        ("infer only, W=20", dict(mode="infer", window=20)),
        ("infer only, W=45", dict(mode="infer", window=45)),
        ("infer to $25b + fee, then oracle (4S API route)", dict(mode="infer", window=30, switch_to_oracle_at=26e9)),
        ("infer to $1b + $1b fee then oracle (UI-4S + DOM scrape idea)", dict(mode="infer", window=30, switch_to_oracle_at=1.2e9, buy_at=UI_4S_COST)),
    ]
    for label, kw in cfgs:
        res = [run(s, **kw) for s in seeds]
        summarise(label, res, 2.6e12)
