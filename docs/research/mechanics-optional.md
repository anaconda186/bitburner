# Can BN2, 3, 13 and 14 be finished without their own mechanics?

Research for [#25](https://github.com/anaconda186/bitburner/issues/25), part of map [#1](https://github.com/anaconda186/bitburner/issues/1). Research date: 2026-11-07. Target version: web **v3.0.1**.

Sources: the game's source at [`bitburner-official/bitburner-src`](https://github.com/bitburner-official/bitburner-src), tag **v3.0.1** (commit `3162fd2`). I read it and did not run the game. Every link below is pinned to that tag. Anything marked **Inference** is my reading or my arithmetic, not something the code states. Times for the Black Ops finish are taken from `docs/research/black-ops-timing.md` (its simulator, not a measurement), and I do not re-derive them.

This builds on `docs/research/bitnode-survey.md` and `docs/research/black-ops-timing.md`. I don't repeat their per-BitNode multiplier tables.

---

## Summary

1. **All four can be finished without their mechanic, and BN3 does not need to be a hacking finish.**
   - BN3 has `BladeburnerRank` 1, `BladeburnerSkillCost` 1 and combat level 1, because [its multiplier block](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L599-L632) sets none of them. Those are exactly BN2's Bladeburner settings ([BN2 block](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L575-L598)).
   - **Inference:** the Black Ops finish in BN3 costs the same as in BN2: about **15 h at S_ref 1000 and 8 h at S_ref 3000 with three sleeves**, plus about 0.4 h of gym to join (black-ops-timing.md, "Estimated time per BitNode" and "Joining"). The BN3 corporation is not needed at all on that route.
2. **The survey's question "worth building corporation scripts for BN3?" has a cheaper answer than either option.**
   - The Black Ops finish removes BN3's money problem, because it needs no augmentation, no Daedalus invite and no Red Pill.
   - If a BN3 hacking finish were still wanted, the corporation's one cash-producing step does not need a division. **Inference (arithmetic from the source, never run):** found the seed-funded corporation, go public, wait about two minutes and sell nearly all the player's shares, for roughly **$24–42b** (low valuation) up to **$60–104b** (valuation at the $150b starting funds). That is the size of Daedalus's $100b gate. See [BN3](#bn3-corporatocracy).
3. **BN2: the gang adds nothing to the Black Ops finish.** The only thing the gang route unlocks that matters is a shortcut to The Red Pill, which only helps a hacking finish, and black-ops-timing.md already rules the BN2 hacking finish out (effective WD level 18,750).
4. **BN13 and BN14: the mechanic is a speed-up, not a requirement, and a cheap partial use gets most of it.**
   - **BN13, Stanek's Gift:** accepting it needs no money and no augmentations bought. Four combat fragments fit in BN13's 6×5 grid. **Inference:** a small charge loop (100 threads, about 200 GB) gives about **×1.4–1.5** on each combat stat; 1000 threads gives about ×1.6–1.8.
   - **BN14, IPvGO:** the Tetrads node power is a combat multiplier. **Inference:** node power of 1000 gives ×1.31 and 10,000 gives ×1.82. Node power also accrues on losses, at half rate.
   - **Inference (interpolating the black-ops-timing simulator):** a ×1.5 combat multiplier takes each of BN13 and BN14 from about 45–48 h to about **37–40 h** at S_ref 1000 with three sleeves. A saving of 15–20%, not a different order of magnitude.
5. **New cost the earlier docs left out: the gym costs money, and BN13 starts with $200k.**
   - The Powerhouse Gym costs $2,400 per second of training ([ClassWork.tsx#L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/ClassWork.tsx#L56); [LocationsMetadata.ts#L324](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L324)).
   - **Inference:** at the gym times in black-ops-timing.md, joining Bladeburner costs about $3.5M in BN2/BN3, $8.6M in BN13 and $33M in BN14, against a BN13 start of exactly $200k ([Prestige.ts#L350-L352](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L350-L352)). See [The join costs money](#the-join-costs-money).
6. **Verdict against the map's standing decision** ("skip these mechanics unless a BitNode cannot reasonably be finished without one"): none of the four needs its mechanic. Two cheap partial uses are worth a note on the plan: Stanek's Gift in BN13 (free to accept, a few lines to charge) and, only if BN3 is ever played as a hacking finish, the share sale.

---

## Conventions

- **Black Ops finish** and **hacking finish** are the glossary's **Finish** terms. **S_ref** is black-ops-timing.md's index: the player's combat stat level in a BitNode with combat level ×1.
- A ×*m* multiplier on all four combat stats acts like multiplying S_ref by *m*, because the stat level is `floor(mult × (32·ln(exp + 534.6) − 200))` ([skill.ts#L7-L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15)) and Stanek and IPvGO both multiply `mult`. **Inference:** this is what lets me read the timing table at a higher S_ref.
- Times from black-ops-timing.md are hours from joining Bladeburner to completing Operation Daedalus, three sleeves infiltrating, with S held flat. The simulator is unvalidated. Treat the savings below as ±50%.

Black Ops finish times used (black-ops-timing.md, "Estimated time per BitNode"):

| BN | S_ref 1000, 3 sleeves | S_ref 3000, 3 sleeves |
|---|---|---|
| 2 (and 3, same multipliers) | 15 h | 8 h |
| 13 (r 0.45, k 2, combat 0.7) | 48 h | 25 h |
| 14 (r 0.6, k 2, combat 0.5) | 45 h | 30 h |

---

## BN3: Corporatocracy

### The route without the corporation

- **Facts:**
  - The BN3 block sets hacking level 0.8, growth 0.2, max money 0.04, script hack money 0.2, company/crime/hacknet money 0.25, augmentation money and rep cost 3, and a World Daemon difficulty of 2. It sets nothing for Bladeburner ([BitNode.tsx#L599-L632](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L599-L632)).
  - The Black Ops finish needs no Red Pill, no Daedalus and no port openers (bitnode-survey.md, "Conventions"). Bladeburner needs SF6/SF7, which the BitNode order has by then.
- **Inference:** BN3's Bladeburner side is identical to BN2's and BN6's. black-ops-timing.md gives **about 15 h** at S_ref 1000 and 8 h at S_ref 3000 with three sleeves for those multipliers, plus the join. The BitNode order already puts 3.x near the back, after SF7.3 and SF10.3 are owned (black-ops-timing.md, "What this means for the BitNode order").
- **Hacking finish for comparison (Inference, same method as black-ops-timing.md):** BN3's effective WD level is 7,500 with `HackExpGain` 1. At 1e7 exp/s, finishing the climb in one day needs a total hacking multiplier of about **11** (BN1 needs about 4.4 and BN4 about 14 on the same table). On top of that, aug prices are ×3 and the invite needs $100b ([FactionInfo.tsx#L138-L149](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L138-L149)). I did not price the 30 augmentations; the cost depends on how many installs the plan uses.

### The corporation's cash, without any division

The survey said a corporation is the only big money source in BN3. For the one thing a hacking finish most needs, a lump sum, the code offers a short path that touches no division, office or warehouse.

1. **Founding is free in BN3.** `createCorporation(name, false)` is seed-funded and costs the player nothing; elsewhere it must be self-funded at $150b ([helpers.ts#L30-L51](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/helpers.ts#L30-L51); [Actions.ts#L53-L65](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Actions.ts#L53-L65)).
   - A new corporation holds $150b of funds ([Corporation.ts#L41](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Corporation.ts#L41)).
   - Seed funding adds 500M investor shares, so 1.5e9 shares exist and the player owns 1e9 ([PlayerObjectCorporationMethods.ts#L26-L29](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectCorporationMethods.ts#L26-L29); [Constants.ts#L44](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/data/Constants.ts#L44), `initialShares = 1e9`).
2. **Going public and selling shares need no unlock.** `goPublic` and `sellShares` call `checkAccess(ctx)` with no API argument, so the Office and Warehouse unlocks are not involved ([NetscriptFunctions/Corporation.ts#L157-L163](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Corporation.ts#L157-L163), [#L776-L788](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Corporation.ts#L776-L788)).
   - `sellShares` pays the **player** directly: `Player.gainMoney(profit)` ([Actions.ts#L367-L379](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Actions.ts#L367-L379)). `goPublic` instead puts the proceeds in corporation funds ([Actions.ts#L144-L158](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Actions.ts#L144-L158)), so call it with 0 shares.
   - The limits are: the player keeps at least one share, one sale per hour (`sellSharesCooldown = 18e3` game cycles), and the corporation must be public ([helpers.ts#L94-L103](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/helpers.ts#L94-L103); [Constants.ts#L50](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/data/Constants.ts#L50)).
3. **Price.**
   - Target share price is `valuation × (0.5 + √ownership) / totalShares` ([Corporation.ts#L251-L262](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Corporation.ts#L251-L262)).
   - While private, valuation is `10e9 + funds/3` (about $60b); once public it is `funds + assetDelta × 85e3` (about $150b with no operations). The reported valuation is the average of the last 10 market cycles of 10 s each, so it takes about 100 s to settle ([Corporation.ts#L207-L233](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Corporation.ts#L207-L233); [Constants.ts#L54](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/data/Constants.ts#L54), [#L73](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/data/Constants.ts#L73)).
   - A sale walks the price in steps of 1M shares, ±0.5% toward the new target as ownership falls ([Corporation.ts#L285-L325](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Corporation.ts#L285-L325)).

**Inference (my arithmetic, a short script re-implementing `calculateShareSale`; not run in the game):**

| Valuation | Sell 500M shares | Sell 990M shares |
|---|---|---|
| $60b (just after going public) | $24b | $42b |
| $150b (after about 100 s) | $60b | $104b |

- **Cost:** three one-call scripts at 20 GB each (`createCorporation`, `goPublic`, `sellShares` are `CorporationAction` = 20 GB; [RamCostGenerator.ts#L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L14), [#L469-L490](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L469-L490)), or one 60 GB script. Compare with the full corporation opening the survey described.
- **What it leaves out:** later hourly sales are worth less because ownership has fallen, dividends shrink, and I did not check whether the player's remaining stake matters to anything else.
- **Inference:** this is enough for the $100b invite, not for 30 augmentations at ×3. It does not make a BN3 hacking finish competitive with a 15 h Black Ops finish, so it is a fallback, not a recommendation.

**Dividends (fact):** BN3's tribute modifier is `1 − CorporationSoftcap + 0.15` with `CorporationSoftcap` unset (= 1), so 0.15; dividends paid to the player are `(own share of dividends)^(1 − 0.15)` ([Corporation.ts#L54](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Corporation.ts#L54), [#L189-L196](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Corporation.ts#L189-L196)). Elsewhere (softcap 0.9) the exponent is 0.75. I did not model how much income a running business gives.

---

## BN2: Rise of the Underworld

- **Route without the gang:** Black Ops finish, **about 15 h at S_ref 1000 and 8 h at S_ref 3000 with three sleeves** (black-ops-timing.md). Combat level is ×1 and rank and skill cost are ×1 ([BitNode.tsx#L575-L598](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L575-L598)).
- **Route with the gang:** the gang's faction sells The Red Pill in BN2 with no Daedalus requirements, which only shortens the hacking finish (bitnode-survey.md, BN2; [FactionHelpers.tsx#L173-L200](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionHelpers.tsx#L173-L200)). That finish needs hacking 15,000 at ×0.8, an effective level of 18,750 and a hacking multiplier of about 28 for a one-day climb (black-ops-timing.md, "The hacking finish in the same BitNodes"). **Inference:** the gang route is not a faster finish, it is a slower one with an easier gate.
- **Cheap partial use:** none found that helps the Black Ops finish. The gang pays for stats and augmentations, but the finish needs neither beyond the 100 combat stats ([The join costs money](#the-join-costs-money)). BN2 has crime money ×3 and `FactionPassiveRepGain` 0 ([BitNode.tsx#L575-L598](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L575-L598)).
- **Answer:** BN2 needs nothing from the gang.

---

## BN13: They're lunatics

### The route without Stanek's Gift

- Black Ops finish at ×0.7 combat level, rank ×0.45, skill cost ×2: **about 48 h at S_ref 1000 and 25 h at S_ref 3000 with three sleeves** (black-ops-timing.md). The hacking finish is out of reach (effective WD level 36,000, `HackExpGain` 0.1).
- The gift is not required. Declining it only costs the Church, and only if non-NFG augmentations are installed ([Prestige.ts#L185-L191](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L185-L191)); the Black Ops finish installs none.

### A cheap partial use

- **Accepting:** possible only with no non-NFG augmentation owned or queued, so it must happen at the very start ([Helper.tsx#L59-L74](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/Helper.tsx#L59-L74)). The invite needs a visit to the church in Chongqing ([FactionInfo.tsx#L726-L771](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L726-L771)). The BN13 start money is exactly the travel cost, $200k ([Prestige.ts#L350-L352](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L350-L352); [Constants.ts#L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L28)), so it is affordable once.
- **Grid:** `9 + StaneksGiftExtraSize + SF13 level` = 10 in BN13 with no SF13, giving a **6 wide × 5 high** grid ([StaneksGift.ts#L22-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/StaneksGift.ts#L22-L31); [BitNode.tsx#L1038-L1039](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L996-L1043)).
- **Fit (Inference):** the strength (T), defense (L), dexterity (L) and agility (S) fragments are each 4 cells in a 3×2 box, limit 1 each ([Fragment.ts#L148-L187](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/Fragment.ts#L148-L187); [Shapes.ts#L17-L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/data/Shapes.ts#L17-L37)). Four 3×2 boxes tile a 6×4 area, so all four fit without rotating. I did not run `canPlaceFragment`.
- **Effect:** `1 + ln(h+1)/60 × ((n+1)/5)^0.07 × power × boost × StaneksGiftPowerMultiplier`, with power 2, BN13's multiplier 2 and no booster ([effect.ts#L3-L12](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/formulas/effect.ts#L3-L12)). `h` is the largest thread count used in one charge and `n` is the charge count, which rises by 1 per charge call at constant threads ([StaneksGift.ts#L33-L39](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/StaneksGift.ts#L33-L39)). The fragment multiplies both the stat's level and exp multiplier ([StaneksGift.ts#L155-L200](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/StaneksGift.ts#L155-L200)).

**Inference (evaluating that formula; each cell is the multiplier on one combat stat):**

| Threads per charge | after 100 charges | 1000 charges | 10,000 charges |
|---|---|---|---|
| 10 | 1.20 | 1.23 | 1.27 |
| 100 | 1.38 | 1.45 | 1.52 |
| 1000 | 1.57 | 1.67 | 1.78 |
| 10,000 | 1.76 | 1.89 | 2.05 |

- **RAM:** `chargeFragment` is 0.4 GB and a script's base is 1.6 GB, so about 2 GB per thread ([RamCostGenerator.ts#L11](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L11), [#L65](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L65)). 100 threads is about 200 GB; 1000 threads is about 2 TB.
- **Time per charge:** 1 s, or 0.2 s while stored bonus time lasts ([Stanek.ts#L47-L52](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Stanek.ts#L32-L57)). So 1000 charges per fragment is about 17 min of one fragment, and one script per fragment keeps all four going.
- **Effect on the finish (Inference):** ×1.4–1.5 is like reading the BN13 row at S_ref 1400–1500. Interpolating 48 h (S_ref 1000) to 25 h (S_ref 3000) on a log scale gives **about 39–40 h**, saving 8–9 h. At ×1.8 it is about 37 h.
- **Cost of the cheap version:** accept the gift, place four fragments, run four small loops. That is the survey's "fixed fragment layout plus charge loop" without any layout search.

**Answer:** BN13 is finishable without the gift at about 48 h of Bladeburner time (plus join), and the gift is a free 15–20% for a small script. It is optional.

---

## BN14: IPvGO Subnet Takeover

### The route without IPvGO

- Black Ops finish at ×0.5 combat level, rank ×0.6, skill cost ×2: **about 45 h at S_ref 1000 and 30 h at S_ref 3000 with three sleeves** (black-ops-timing.md). The hacking finish is the hardest in the game (effective WD level 37,500).
- Faction and company work reputation are ×0.2 ([BitNode.tsx#L1044-L1087](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1044-L1087)), which slows augmentations but not the Black Ops finish.

### A cheap partial use

- **The bonus:** `1 + ln(p+1) × (p+1)^0.3 × 0.002 × power × GoPower`, with `p` the node power against that opponent, `GoPower` 4 in BN14 and ×2 more with SF14 ([effect.ts#L16-L22](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/effect.ts#L16-L22); [BitNode.tsx#L1046](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1044-L1087)). Tetrads has power 0.7 and multiplies strength, defense, dexterity and agility ([effect.ts#L82-L87](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/effect.ts#L82-L87); [Constants.ts#L39-L47](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/Constants.ts#L39-L47)).
- **How power is earned:** each finished game adds `black sum × (komi + 0.5) × 0.25 × streak multiplier`. For Tetrads (komi 5.5) the difficulty factor is 1.5. The streak multiplier is 1 + 0.25 per win up to ×3, ×0.5 on a losing streak, and up to ×5 for the first win after a dry streak ([scoring.ts#L86-L91](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/boardAnalysis/scoring.ts#L86-L91); [effect.ts#L119-L134](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/effect.ts#L119-L134)).
- **Fact, worth noting:** the node-power line sits after the win/loss branch, so **a loss also adds power, at half rate** (the streak multiplier is already negative) ([scoring.ts#L52-L91](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/boardAnalysis/scoring.ts#L52-L91); [#L118-L128](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/boardAnalysis/scoring.ts#L118-L128)).
- **Reset:** node power is zeroed on every augmentation install and every BitNode entry ([Go.ts#L25-L58](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/Go.ts#L25-L58)). A run that installs nothing during the Black Ops finish keeps it.

**Inference (evaluating the formula for Tetrads in BN14, no SF14):**

| Node power vs Tetrads | Combat multiplier |
|---|---|
| 300 | ×1.18 |
| 1,000 | ×1.31 |
| 3,000 | ×1.50 |
| 10,000 | ×1.82 |
| 30,000 | ×2.27 |

- **How many games (Inference):** a 13×13 board has 169 points, so a game with a black sum around 90 adds about 135 at streak 1 and about 400 at the ×3 cap. That puts node power of 3,000 (×1.5) at roughly 10 won games. I did not measure what a script that wins against Tetrads looks like, or how long a game takes.
- **Effect on the finish (Inference):** ×1.5 is like S_ref 1500: interpolating 45 h to 30 h on a log scale gives **about 39–40 h**, saving 5–6 h. ×1.8 gives about 37 h.
- **Cost:** a Go bot that beats an AI opponent is real work; a bot that only plays out games and accepts losses gets half rate. The saving is smaller than the cost of building one unless the bot is needed for something else (the hacking-level opponent, or the faction-work reputation the survey wanted).

**Answer:** BN14 is finishable without IPvGO at about 45 h of Bladeburner time (plus join). Go is a modest optional speed-up here, and not a cheap one to script.

---

## The join costs money

black-ops-timing.md modelled the gym in time only. The code also charges for it.

- **Fact:** the gym's money per second is `120 × costMult` and its exp per second per stat is `expMult` ([ClassWork.tsx#L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/ClassWork.tsx#L56); [Formulas.ts#L100-L121](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/Formulas.ts#L100-L121)). A backdoored gym server gives 10% off. Powerhouse (Sector-12) is cost 20, exp 10: **$2,400/s for 10 exp/s** ([LocationsMetadata.ts#L322-L328](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L322-L328)). Iron Gym (cost 1, exp 1) is $120 per exp against Powerhouse's $240 ([#L293-L297](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L293-L297)). The other gyms are in between ([#L38-L40](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L38-L40), [#L105-L107](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L105-L107), [#L376-L378](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L376-L378)).
- **Inference (gym times from black-ops-timing.md, "Joining", at $2,400/s):**

| BN | Gym time for 4 stats | Money at Powerhouse |
|---|---|---|
| 2, 3 | ~0.4 h | ~$3.5M |
| 13 | ~1 h | ~$8.6M |
| 14 | ~3.8 h | ~$33M |

  At Iron Gym the cost halves and the time grows tenfold.
- **Why it matters (Inference):** BN13 starts with $200k and money sources at ×0.4. Crime pays comparable money per second ([Crimes.ts#L5-L60](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Crime/Crimes.ts#L5-L60): mugging is $36k per 4 s before the BN multiplier), but success chance at the start is low and I did not model it. BN3 has crime ×0.25. This is the one place where a Black Ops finish plausibly stalls early, and it is a money problem the plan has to solve in every BitNode anyway. I did not check whether sleeves can train and what they pay.

---

## What this means for the plan (Inference)

1. **Keep the standing decision.** None of BN2, 3, 13 or 14 needs its mechanic. Finish all four by Black Ops. That also removes the only reason the survey gave for building corporation scripts.
2. **Move BN3 in the BitNode order next to BN2/6.2/6.3** as a Black Ops finish. It was at the back because of a hacking finish; on the Black Ops route its cost is BN2's.
3. **Optional, in this order of value for effort:**
   - **BN13 Stanek fixed layout:** free to accept and a small charge loop, 15–20% shorter.
   - **BN14 Go:** only if a Go bot is wanted for other reasons.
   - **BN3 share sale:** only if a hacking finish in BN3 is ever wanted. Not needed otherwise.
4. **Schedule the gym money.** Add the join cost to the BN13 and BN14 starts in the plan.

---

## Not verified from source, or inferred

- **Every time here comes from black-ops-timing.md's simulator**, which is uncalibrated against a real run. I interpolated its S_ref columns on a log scale to turn a combat multiplier into hours. That treats a Stanek or Go multiplier as an S_ref change, which holds for the stat level but ignores that Bladeburner skill and stamina effects also depend on exp.
- **The share-sale figures** are my own re-implementation of `calculateShareSale` and the valuation formulas, run for a corporation with no divisions and no investment rounds. I did not run the game or check that `goPublic(0)` leaves the price where I assumed.
- **The Stanek layout** was checked by bounding boxes, not by `canPlaceFragment`. Which exact cells to use was not chosen.
- **The cost of winning at IPvGO** (strength of a script that beats Tetrads, game length) is not researched. The node-power figures assume the games are won or lost as stated, and the 10-game figure assumes a black sum of about 90 on 13×13, which I guessed.
- **Gym money:** `120 × costMult` per second comes from the class definition plus `calculateCost`; I did not confirm it in play. Whether a sleeve's gym training is charged the same was not checked.
- **I did not price the 30 augmentations** of a BN3 hacking finish.

## Open questions

1. Can BN13 and BN14 earn the $9M and $33M gym money from their starts, and how long does that take? This is the first thing a BN13 milestone save should time.
2. What is the cheapest bot that wins at IPvGO against Tetrads, and is it worth it for the combat bonus alone?
3. Does the share sale in BN3 give what the arithmetic says? One run in a lab save would confirm it (a lab save per the glossary, never a run).
4. With the BN3 hacking finish off the table, is a corporation worth building at all, in any later BitNode? The survey's other reason was money in weak-hacking BitNodes, which this doc does not cover.
