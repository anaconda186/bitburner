# BN8 stock model

The script behind the numbers in [BN8: the fastest way to destroy it on stocks alone](../bn8-stocks.md), for issue [#26](https://github.com/anaconda186/bitburner/issues/26).

| File | What it is |
|---|---|
| `market_sim.py` | The market (33 stocks, tick, forecast drift, trade effects) and the traders. `python market_sim.py` runs the table (several minutes); `python market_sim.py quick` runs 6 seeds |
| `stocks_data.py` | The stock table, generated from `InitStockMetadata.ts` at tag v3.0.1 |
| `out.txt` | The output the findings quote |
| `golden.py` | Exports `golden.json`: markets the model's oracle and price-only traders saw, with what they did. The trader's unit tests (`src/sr/trades.model.test.ts`, #72) check that `decideTrades` agrees with them in direction. `python golden.py` regenerates it |
| `golden.json` | The exported cases |

Needs Python 3 and numpy.

## What to trust

- **Mechanics:** copied by hand from the source at v3.0.1; not checked against golden values from a lab save.
- **Traders:** simple greedy rules. They are an estimate of what a trader can do, not a bound.
- **Left out:** order types, RAM cost of hack/grow manipulation, bonus time, and everything outside the stock market.
