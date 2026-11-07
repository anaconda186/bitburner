# BN8: the fastest way to destroy it on stocks alone (v3.0.1)

Research date: 2026-11-07. Answers [#26](https://github.com/anaconda186/bitburner/issues/26).

Sources:
- The game's source at tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1), which I read as raw files and did not run. Links below are to `https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/...`.
- The model in [`bn8-stocks-model/`](bn8-stocks-model/README.md), which copies the mechanics by hand.

**Fact** means read from the source. **Inference** means from my model or my reasoning; none of it is checked against the running game.

## Summary

1. **Fact: The Red Pill is the bill.** Faction work and hacking pay nothing in BN8, so The Red Pill (2.5e6 rep, $0) is bought with donations at $1e6 per rep: about **$2.5e12** at a rep multiplier of 1. The 30 installed augmentations Daedalus needs cost only a few $b in total if spread over 5 or more installs (table below). So the trader's job is to turn $250m into about $2.6e12 inside the one session that ends with Daedalus.
2. **Fact: stock trades do not move prices.** A trade only nudges the *forecast* (by 0.006 per 30k-216k shares, floored at 5). There is no slippage, only a 0.1%-1.2% spread each way and a $100k commission. A position in one company is capped at 20% of its shares.
3. **Fact: the 4S data a script can read costs $25b, not $1b.** `getForecast` and `getVolatility` need `has4SDataTixApi`. The $1b "4S Market Data" sets a different flag the script API never reads.
4. **Inference: with perfect forecast information, $250m reaches $2.6e12 in about 10 hours** (p10 8.4 h, p90 12.6 h, at 6 s a tick). A trader that sees only prices never got there in 25 hours. Paying $25b once it has $26b gives about 20 hours median, and only 68% of seeds finished in 25 hours.
5. **Inference: the $1b route is the standout, if a script can read the UI's forecast.** About 13 hours median (p90 19 h), every seed finished. That would answer the survey's open question 3 in favour of buying the **$1b** data first, not the $25b API. Whether a script can read it cheaply is unchecked (see open questions).
6. **Inference: hack/grow manipulation is worth at most about 2.7x** (3.8 h median with the second-order forecast pinned for free). Real RAM and having to hack each held company's server will eat much of that, so treat it as a stretch goal.
7. **Inference: the best case is still hours of real time.** The source's only speed-ups are the 4 s minimum tick gap (against 6 s) and bonus time.

## Facts from the source

### The market clock

- A tick is 6 s of game time, gated to at least 4 s of real time between ticks ([Constants.ts#L3-L12](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/data/Constants.ts#L3-L12), [StockMarket.ts#L234-L251](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarket.ts#L234-L251)). The engine feeds it game cycles and offline cycles ([engine.tsx#L100-L103](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L100-L103), [#L320-L323](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L320-L323)).
- Every 75 ticks the market "cycles": each stock flips bull/bear with probability 45%, and its second-order forecast becomes `100 - ff` ([StockMarket.ts#L219-L232](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarket.ts#L219-L232)). A direction therefore lasts about two cycles, roughly 15 minutes.
- Each tick draws one random `v`, shared by all stocks. A stock moves by `av = v * mv / 100`, up with probability `(50 ± otlkMag)/100`, else down ([StockMarket.ts#L260-L301](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarket.ts#L260-L301)). The expected move is `(2p-1) * mv/200`, about 0.1%-0.3% a tick for the best stocks (**Inference** on the size, from the table in [InitStockMetadata.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/data/InitStockMetadata.ts)).
- The forecast then drifts: `otlkMag` changes by `otlkMag * av` (10x below 5, a full 1 at 1 or below), in the direction chosen by the second-order forecast ([StockMarket.ts#L303-L312](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarket.ts#L303-L312), [Stock.ts#L174-L194](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/Stock.ts#L174-L194), [#L235-L240](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/Stock.ts#L235-L240)).
- The 33 stocks are re-rolled at every market init, which happens on every reset, so **each install re-rolls the market and wipes positions** ([StockMarket.ts#L183-L206](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarket.ts#L183-L206), [Prestige.ts#L158-L172](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L158-L172)). Starting `otlkMag` is 19 for ECorp and MegaCorp and 0-1 for the smallest caps; `mv` runs from 0.4%-0.5% (ECorp) to 2%-4% (NetLink).

### Trading

- Buy at ask, sell at bid, `spreadPerc` each way, plus $100k a transaction ([StockMarketHelpers.ts#L15-L61](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarketHelpers.ts#L15-L61)).
- A trade never changes the price. It uses up `shareTxUntilMovement` and, each time that runs out, lowers `otlkMag` by 0.006 (not below 5) and pulls the second-order forecast toward 50 ([StockMarketHelpers.ts#L70-L109](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarketHelpers.ts#L70-L109), [Stock.ts#L246-L264](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/Stock.ts#L246-L264)). **Inference:** a full position is hundreds of movements, so each full buy or sell costs a couple of forecast points and churn erodes the edge.
- Long plus short shares per company are capped at 20% of its total shares ([Stock.ts#L146-L150](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/Stock.ts#L146-L150), [BuyingAndSelling.tsx#L83-L102](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/BuyingAndSelling.tsx#L83-L102)). **Inference:** that is roughly $9e10-$4.8e11 per big company, so $2.6e12 has to be spread over many companies.
- Shorts and limit/stop orders work in BN8 with no Source-File ([NetscriptFunctions/StockMarket.ts#L151-L153](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/StockMarket.ts#L151-L153), [#L178-L180](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/StockMarket.ts#L178-L180)).

### Information costs

- `getForecast` and `getVolatility` throw unless `has4SDataTixApi` is set ([NetscriptFunctions/StockMarket.ts#L228-L247](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/StockMarket.ts#L228-L247)).
- `purchase4SMarketDataTixApi` costs `25e9 * FourSigmaMarketDataApiCost` and needs only the TIX API, not the $1b data ([NetscriptFunctions/StockMarket.ts#L275-L296](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/StockMarket.ts#L275-L296), [Constants.ts#L9-L10](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/data/Constants.ts#L9-L10)). BN8 leaves both cost multipliers at their default of 1 ([BitNodeMultipliers.ts#L85-L88](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L85-L88), [BitNode.tsx#L770-L798](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L770-L798)).
- `purchase4SMarketData` ($1b) sets only `has4SData` ([NetscriptFunctions/StockMarket.ts#L249-L273](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/StockMarket.ts#L249-L273)). **Inference:** it exists to show the forecast in the stock UI, as the flag name suggests; I did not read the UI code.

### Manipulation by hacking and growing

- `hack` and `grow` with `{stock: true}` call `influenceStockThroughServerHack/Grow` with the money *drained or added*, not the money gained, so ScriptHackMoneyGain 0 does not turn it off ([NetscriptHelpers.tsx#L614-L616](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L614-L616)).
- With probability `moneyChange / moneyMax`, the second-order forecast moves by 0.1 ([PlayerInfluencing.ts#L24-L68](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/PlayerInfluencing.ts#L24-L68)). That changes only the drift direction of `otlkMag`, not the price, so it acts slowly.

### What the finish costs

- Daedalus needs 30 installed augmentations, $100b held and hacking 2500 ([FactionInfo.tsx#L138-L148](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L138-L148), [FactionJoinCondition.ts#L116-L132](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionJoinCondition.ts#L116-L132), [BitNodeMultipliers.ts#L61](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L61)).
- The Red Pill: 2.5e6 rep, $0 ([Augmentations.ts#L1946-L1953](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1946-L1953)). Donating needs 0 favor in BN8, and one rep costs $1e6 divided by the faction rep multiplier ([donation.ts#L8-L18](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/formulas/donation.ts#L8-L18)).
- Every install in BN8 sets money back to $250m ([Prestige.ts#L38](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L38), [#L160-L163](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L160-L163)). An aug costs `base * 1.9^(queued augs)` (less with SF11), and the multiplier restarts after an install ([AugmentationHelpers.ts#L29-L36](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L29-L36), [#L127-L160](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L127-L160), [Constants.ts#L41](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L41)).
- The World Daemon needs 3000 hacking in BN8 (`WorldDaemonDifficulty` is left at 1: [BitNode.tsx#L770-L798](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L770-L798); see also the [survey](bitnode-survey.md)). Hacking exp still comes from scripts.

## Model results (all Inference)

The model: 33 stocks rolled as in the source, a tick every 6 s, a trader that holds the best-edge stocks long or short, pays spread and commission, and suffers the forecast erosion from its own trades. Target: net worth $2.6e12. 40 seeds per row, 25 h limit. Script: [`bn8-stocks-model/market_sim.py`](bn8-stocks-model/market_sim.py); output: [`out.txt`](bn8-stocks-model/out.txt). Times are real hours at 6 s a tick.

| Strategy | $1b (median) | $25b (median) | $1e12 (median) | $2.6e12: p10 / median / p90 | Seeds that got there |
|---|---|---|---|---|---|
| Oracle forecast from the start (fee ignored; not buyable) | 1.4 h | 4.5 h | 8.7 h | 8.4 / 10.1 / 12.6 h | 100% |
| Oracle + free pinning of the second-order forecast (upper bound for manipulation) | 0.7 h | 1.9 h | 3.4 h | 2.9 / 3.8 / 4.8 h | 100% |
| Price-only inference, 30-tick window | 4.2 h | 13.4 h | never | never | 0% |
| Price-only inference, 45-tick window | 3.0 h | 10.8 h | never | never | 2% |
| Infer to $26b, pay $25b, then oracle (4S API route) | 4.2 h | 13.4 h | 18.6 h | 13.5 / 19.7 / never | 68% |
| Infer to $1.2b, pay $1b, then oracle (UI route, needs a DOM read) | 4.2 h | 8.6 h | 12.1 h | 10.2 / 13.4 / 19.2 h | 100% |

What this says:
- **Information is the whole game.** With the forecast, growth is steady on the best two or three stocks, then spreads over a dozen once positions hit the 20% cap. Without it, the trader mostly pays spread chasing noise.
- **The first $1b is the slow part for a price-only trader** (median 3-4 h). The trader is crude and a better estimator might do better; I only tried window sizes 20, 30 and 45.
- **Speed-ups matter.** The 4 s minimum tick gap would cut every time by a third if bonus time supplies the cycles.

## Putting it together (Inference)

Aug budget, ignoring which faction offers what and any prerequisites: the 30 cheapest-by-money non-special augs from the [Augmentations.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts) table, bought most-expensive-first in batches that each restart the 1.9x multiplier (my arithmetic, not in the model folder):

| Installs | Augs per install | Total aug money | Largest single session |
|---|---|---|---|
| 10 | 3 | $2.0e9 | $5.1e8 |
| 6 | 5 | $4.6e9 | $1.8e9 |
| 5 | 6 | $7.2e9 | $3.3e9 |
| 3 | 10 | $4.5e10 | $3.2e10 |
| 2 | 15 | $5.9e11 | $5.4e11 |
| 1 | 30 | $8.0e14 | $8.0e14 |

Rep comes on top: the cheapest 30 need up to 22,500 rep from one faction, about $2.2e10 by donation. Faction work might be cheaper for those early augs; I did not model it.

What the numbers favour:
1. Each session starts at $250m with a fresh market. Early sessions (augs only) need single-digit $b plus rep, so keep them short and do **not** spend $25b on the API there.
2. In the last session, trade to about $2.6e12 with $100b held for the Daedalus invite, then donate for The Red Pill.
3. Buy the **$1b** data when affordable and read it from the UI, if that proves feasible. Otherwise a price-only trader is too weak, and the $25b API route (about 20 hours median) is the fallback.
4. Add hack/grow manipulation only on the companies currently held, once the exp farm has its RAM.
5. Hacking 2500 (invite) and 3000 (World Daemon) come from exp scripts running during the same hours.

## Not covered / open questions

- **The trader is crude.** Greedy ranking by expected edge, no limit/stop orders, no volatility-aware sizing. A better one would beat these times by an unknown amount.
- **Faction availability.** The aug budget ignores which factions are joinable in BN8 (city factions need money and travel; hacking factions need backdoors) and ignores prerequisites. Real costs are higher.
- **Rep multipliers.** Augs with `faction_rep` above 1 (SmartJaw 1.25, PCMatrix 1.0777, SNA 1.15) cut the $2.5e12 donation proportionally; I did not search for the best combination.
- **Can a script read the forecast from the UI?** I did not read `ui/StockTicker.tsx`, so I do not know what the UI shows after the $1b purchase or how cheaply a script can read it.
- **Manipulation cost.** The pinned-forecast row is a free upper bound. How many hack/grow threads it takes to hold a forecast near 100 is unmeasured.
- **Real tick pacing under bonus time.** Whether a run actually gets a tick every 4 s depends on stored cycles.
- **The model is untested.** It has no golden values from a lab save.
