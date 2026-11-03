# How long the Black Ops finish takes, BitNode by BitNode

Research for [#14](https://github.com/anaconda186/bitburner/issues/14), part of map [#1](https://github.com/anaconda186/bitburner/issues/1). Research date: 2026-11-02. Target version: web **v3.0.1**.

Sources: the game's source at [`bitburner-official/bitburner-src`](https://github.com/bitburner-official/bitburner-src), tag **v3.0.1** (commit `3162fd2`). I read it and did not run the game. Every link below is pinned to that tag. Community measurements are thin and old, and I cite the few I found. Anything marked **Inference** is my reading or my model, not something the code states. Time estimates come from a small simulator I wrote from the formulas below (see [The simulator](#the-simulator-and-its-limits)). They are order-of-magnitude figures, not splits.

This builds on `docs/research/bitnode-survey.md` (per-BN multipliers, effective WD level) and the BitNode order from [#9](https://github.com/anaconda186/bitburner/issues/9#issuecomment-6591992657). I don't repeat those here.

---

## Summary

1. **The Black Ops finish is the right finish for BN2, 6, 7, 9, 10, 13 and 14.** It is not close.
   - **Inference:** to reach the WD hacking level in about a day of exp farming, a run would need a total hacking multiplier of about 25–28 in BN2/6/7/10, about 20 in BN9 and about 60 in BN13/14. The same budget needs about 4.4 in BN1 (see [Hacking finish](#the-hacking-finish-in-the-same-bitnodes)). Every hacking aug in the game multiplied together is ×43.
   - **Inference (simulator):** at middling stats the Black Ops finish takes about **1.5–3.5 days** of Bladeburner time without sleeves. With 3 sleeves it takes **15–25 h in BN2/BN10** and **about 2 days in BN13/BN14**. Join time and the aug side come on top.
2. **Without sleeves, what limits the climb is the number of contracts and operations, not stats or Black Op difficulty.**
   - Each success *and* each failure uses up one count ([Bladeburner.ts#L930-L976](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L930-L976)).
   - Counts regrow slowly: on average about 30 per hour for each contract and **about 8 per hour for Assassination and Stealth Retirement** ([Operations.ts#L189-L226](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Operations.ts#L189-L226); [Bladeburner.ts#L1387-L1393](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1387-L1393)).
   - **Inference (simulator):** without sleeves the player spends about 40% of a BN6 run with every action at count 0.
3. **Rank per success grows exponentially with the action's level, and level grows with total successes.** So halving `BladeburnerRank` adds a few levels' worth of successes, not double the time.
   - Rank = `rankGain × rewardFac^(level−1) × BladeburnerRank` ([Formulas.ts#L9-L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L9-L28)).
   - Level *L* needs about `L²/2` total successes ([LevelableAction.ts#L49-L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/LevelableAction.ts#L49-L56)).
   - **Inference (simulator):** BN7 (rank ×0.6, skill cost ×2) takes about 1.8× as long as BN6. The naive figure would be 1/0.6 × 2 ≈ 3.3×. That matches the one community report that BN7 is "about a day longer than 6" ([BN6/Bladeburner guide, 2022](https://docs.google.com/document/d/e/2PACX-1vQVY-It-H_Q5u6DPXVDeaFvGRN8NgXXXYAHqRMdDs2WfZVAcDZl90LT0MEd2zPCJP-wMj2tm7bOGSkN/pub)).
4. **Sleeves are the biggest lever, through "Infiltrate Synthoids".**
   - Each infiltrating sleeve adds `n^−0.5 / 2` to *every* contract and operation count once a minute. With *n* sleeves that is `√n / 2` per minute ([SleeveInfiltrateWork.ts#L7](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveInfiltrateWork.ts#L7), [#L20-L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveInfiltrateWork.ts#L20-L28); [Bladeburner.ts#L1253-L1265](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1253-L1265)).
   - One sleeve gives 30 Assassinations per hour, about 4× the natural rate. Three sleeves give 52 per hour, 6.6×.
   - **Inference (simulator):** 3 sleeves cut a run by roughly 2–3×, for example BN9 from about 50 h to about 17 h and BN7 from about 70 h to about 36 h.
5. **The 21 Black Ops themselves are not the bottleneck.**
   - By the time rank reaches 400k the player has about 133k skill points. Spent across the success skills, that covers Operation Daedalus (difficulty 80,000) with raw combat stats in the low hundreds, even at skill cost ×2.
   - Without skills, Daedalus would need combat stats of about 1.7 million ([BlackOperations.ts#L704-L731](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/BlackOperations.ts#L704-L731); [Action.ts#L169-L196](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Action.ts#L169-L196)). **Inference:** arithmetic in [Black Ops](#the-21-black-ops).
6. **Smaller levers:**
   - **BN9 hashes buy rank, but only up to about 10% of the time.** Each purchase is +100 rank that ignores `BladeburnerRank`, and the *n*-th costs 250·*n* hashes ([HashUpgradesMetadata.tsx#L90-L107](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/HashUpgradesMetadata.tsx#L90-L107); [HashUpgrade.ts#L72-L82](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HashUpgrade.ts#L72-L82); [HacknetHelpers.tsx#L539-L555](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L539-L555)). **Inference (simulator):** 50–200 hashes/s save about 10–13%.
   - **Incite Violence adds counts, but its chaos cost caps the gain at about 10–20%** in my model ([Bladeburner.ts#L1221-L1237](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1221-L1237)).
   - **BN13's Stanek combat fragments** are about ×1.5–2 on each combat stat. That roughly cancels BN13's ×0.7 combat level, which matters little while counts bind.
   - **Blades' Simulacrum** (SF7.3) does not speed up Bladeburner itself. It lets the player train or work at the same time ([Bladeburner.ts#L1355-L1368](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1355-L1368)).
7. **BN9 and BN10 have a large fixed cost before Bladeburner can start: the 100 combat stats to join.**
   - Combat levels are ×0.45 and ×0.4 there ([BitNode.tsx#L801-L888](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L801-L888)), and stat level is logarithmic in exp ([skill.ts#L7-L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15)).
   - **Inference:** gym-only training from zero to 100 in all four combat stats takes about 6 h in BN9 and about 12 h in BN10, against 20–30 min in BN6/7/2 (with SF1.3 and SF6.1, before any exp augs or hash gym boosts).
8. **Inference, for the BitNode order** (details in [What this means for the BitNode order](#what-this-means-for-the-bitnode-order)):
   - **(a) Move BN10 ahead of BN7 and BN9:** 5.1 → 1.2 → 1.3 → 6.1 → **10.1–10.3** → 7.1–7.3 → 9.1–9.2. Its sleeves would speed up the five Bladeburner runs after it. The model puts the saving at about 150 h across the enabler tier.
   - **(b) Move BN2 up the back** next to 6.2/6.3. With SF7.3 and three sleeves it is the cheapest Bladeburner BitNode, with the same Bladeburner multipliers as BN6.
   - **(c) BN13 and BN14 cost about the same by Black Ops** (about 2 days with 3 sleeves at S_ref 1000, not counting the join and aug side). BN14's last place came from its hacking requirement. On Bladeburner cost alone it ties BN13, though its ×0.2 work rep still argues for keeping it late.
   - **(d) The Black Ops finish is the wrong choice only for BN15** (rank ×0.2, skill cost ×3), which is not in this ticket's list. The model puts it at about 5 days with 3 sleeves at S_ref 1000, and about 3.4 days at S_ref 3000.

---

## Conventions

- **Count**: how many times a contract or operation can still be done. **Level**: the difficulty and reward tier the player picks for it, up to its **max level**.
- **Competence**: the success-chance numerator in [Action.ts#L169-L196](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Action.ts#L169-L196). Success chance = `min(1, competence / difficulty)`.
- **S**: the player's combat stat level (str, def, dex and agi taken as equal) before Bladeburner skills. **S_ref** is S in a BitNode with combat level ×1. A BitNode with combat level ×*c* gives S = *c* · S_ref.
- **r** = `BladeburnerRank`, **k** = `BladeburnerSkillCost` (BitNode multipliers, [BitNodeMultipliers.ts#L19-L22](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L19-L22)).
- Time is real time at normal game speed. Bladeburner processes 1 s per second and up to 5 s per second only while spending stored bonus time ([Bladeburner.ts#L1376-L1381](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1376-L1381); see `realtime-throughput.md`).

---

## The Bladeburner multipliers per BitNode

All values are from [BitNode.tsx](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L570-L1127). A multiplier not listed is 1.

| BN | r (rank) | k (skill cost) | Combat level | Aug $ | Other Bladeburner-relevant | Draft order position (#9) | SFs owned on entry (draft order) |
|---|---|---|---|---|---|---|---|
| 2 | 1 | 1 | 1 | 1 | crime $ ×3; gang (TRP from gang) | back | everything up to 3.x, incl. SF7.3, SF9.2, SF10.3 |
| 6 | 1 | 1 | 1 | 1 | — | 6.1 in enabler tier | SF1.3, 4.3, 5.1 (no SF6/7, no sleeves) |
| 7 | **0.6** | **2** | 1 | **3** | — | 7.1–7.3 | + SF6.1 (+ SF7.1 / 7.2 on repeats) |
| 9 | 0.9 | **1.2** | **0.45** | 1 | hashes buy rank and SP; no cloud servers | 9.1–9.2 | + SF7.3 (no sleeves) |
| 10 | 0.8 | 1 | **0.4** | **5** (rep ×2) | 1/2/3 own sleeves in 10.1/10.2/10.3 | 10.1–10.3 | + SF9.2 |
| 13 | **0.45** | **2** | 0.7 | 1 | Stanek power ×2, gift size +1 | back | + SF10.3 and most others |
| 14 | 0.6 | **2** | 0.5 | 1.5 | faction/company work rep ×0.2 | back (last) | + SF10.3 and most others |
| 15 | **0.2** | **3** | 0.7 | 3 | (for comparison) | back | — |

Sources:
- BN2 [L575-L598](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L575-L598), BN6 [L694-L727](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L694-L727), BN7 [L728-L769](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L728-L769) and BN9 [L801-L843](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L801-L843). BN9's `BladeburnerSkillCost` 1.2 is not in bitnode-survey.md.
- BN10 [L844-L888](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L844-L888), BN13 [L996-L1043](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L996-L1043), BN14 [L1044-L1087](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1044-L1087) and BN15 [L1089-L1122](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1089-L1122).
- Sleeve count is `min(3, SF10 level + (in BN10 ? 1 : 0))` plus Covenant sleeves ([SleeveCovenantPurchases.tsx#L58-L72](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L58-L72)). Covenant sleeves are bought only in BN10, from $10t, rising ×10 each, up to 5 ([#L13-L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L13-L27)). The count is a player field, so it survives BitNode resets ([PlayerObject.ts#L66](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObject.ts#L66)).

**Side note:** BN13's `ClassGymExpGain` 0.5 appears to do nothing in v3.0.1. It is set in BitNode.tsx, but no game code outside the BitNode definitions and the type file reads it (grep of `src/` at the tag). Not verified at runtime.

---

## Rank-rate model (sourced)

### Rank per action

- **Contracts and operations:** `rankGain × rewardFac^(level−1) × BladeburnerRank`, with ±10% noise (`addOffset(…, 10)`) ([Formulas.ts#L9-L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L9-L28); [Bladeburner.ts#L950-L952](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L950-L952)).
- **Failed operations lose** `rankLoss × rewardFac^(level−1)`. This loss is **not** scaled by `BladeburnerRank` ([Formulas.ts#L30-L44](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L30-L44)). Contracts have no rank loss.
- **Black Ops:** `rankGain × BladeburnerRank` ([Formulas.ts#L24-L25](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L24-L25)).
  - The first 20 Black Ops give 73,660 × r rank in total, about 18% of the 400k at r = 1. Daedalus's own 40k comes after the requirement (table below).
- **Field Analysis:** 0.1 × r per 30 s. Negligible ([Formulas.ts#L12-L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L12-L14)).
- **Skill points:** one per 3 rank of *max* rank ever reached ([Bladeburner.ts#L1284-L1293](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1284-L1293); [Constants.ts#L47](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L47)).
- **Faction rep:** 2 Bladeburners rep per rank ([Constants.ts#L41](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L41)).
- **Rank and skills survive aug installs.** `prestigeAugmentation` only stops the action and re-joins the faction ([Bladeburner.ts#L259-L263](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L259-L263); [Prestige.ts#L156-L157](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L156-L157)).

The rank-earning actions ([Contracts.ts#L8-L109](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Contracts.ts#L8-L109); [Operations.ts#L9-L226](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Operations.ts#L9-L226)):

| Action | Base difficulty | difficultyFac | Base rank | rewardFac | Count regrowth (avg / 480 s) | Initial count | Rank grows per difficulty as difficulty^x, x = |
|---|---|---|---|---|---|---|---|
| Tracking (contract) | 125 | 1.02 | 0.3 | 1.041 | 4.0 | 25–150 | 2.03 |
| Bounty Hunter (contract) | 250 | 1.04 | 0.9 | 1.085 | 4.0 | 5–150 | 2.08 |
| Retirement (contract) | 200 | 1.03 | 0.6 | 1.065 | 4.0 | 5–150 | 2.13 |
| Investigation | 400 | 1.03 | 2.2 | 1.07 | 2.5 | 1–100 | 2.29 |
| Undercover | 500 | 1.04 | 4.4 | 1.09 | 2.5 | 1–100 | 2.20 |
| Sting | 650 | 1.04 | 5.5 | 1.095 | 2.15 | 1–150 | 2.31 |
| Raid | 800 | 1.045 | 55 | 1.1 | 2.1 | 1–150 | 2.17 |
| Stealth Retirement | 1000 | 1.05 | 22 | 1.11 | 1.05 | 1–150 | 2.14 |
| Assassination | 1500 | 1.06 | 44 | 1.14 | 1.05 | 1–150 | 2.25 |

- The last column is my arithmetic (**Inference**): `ln(rewardFac)/ln(difficultyFac)`. For every action, rank per success grows faster than difficulty. That is why the climb rewards pushing levels.
- Count regrowth is `growthFunction()/480` per second, with `growthFunction` drawn uniformly at random each tick ([Bladeburner.ts#L1387-L1393](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1387-L1393); [Constants.ts#L39](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L39)).
- The initial count is `random(minCount, maxCount)` ([LevelableAction.ts#L19-L40](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/LevelableAction.ts#L19-L40)).

### Levels

- A level's difficulty is `baseDifficulty × difficultyFac^(level−1)` ([LevelableAction.ts#L58-L64](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/LevelableAction.ts#L58-L64)).
- Max level rises by one when total successes, at any level, reach `ceil(0.5 × maxLevel × (2 × perLevel + maxLevel − 1))`. `perLevel` is 3 for contracts and 2.5 for operations ([LevelableAction.ts#L49-L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/LevelableAction.ts#L49-L56); [Constants.ts#L44-L45](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L44-L45)).
- **Inference:** reaching level *L* takes about `L²/2 + 2.5L` successes of that action, so levels grow with the square root of successes. Contract and operation objects are shared, so a sleeve's contract successes also raise the contract's max level ([SleeveBladeburnerWork.ts#L54](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveBladeburnerWork.ts#L54)).

### Success chance

`competence / difficulty`, capped at 1 ([Action.ts#L169-L196](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Action.ts#L169-L196)).

- **Competence** is `Σ weight_stat × effectiveStat^decay_stat`. Combat decays are 0.8–0.91, so competence grows about as S^0.8–0.9. It is then multiplied by:
  - **Intelligence:** `1 + 0.75·int^0.8/600` ([intelligence.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/intelligence.ts)).
  - **Stamina penalty:** `min(1, stamina / (0.5·maxStamina))` ([Bladeburner.ts#L167-L169](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L167-L169)).
  - **Team:** `(teamCount+1)^0.05`, for operations and Black Ops only ([Operation.ts#L96-L98](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Operation.ts#L96-L98)).
  - **City population:** `(pop/1e9)^0.7`. Black Ops ignore it ([Action.ts#L88-L92](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Action.ts#L88-L92); [BlackOperation.ts#L55-L61](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/BlackOperation.ts#L55-L61)). Cities start at 1.0–1.5 billion ([City.ts#L18-L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/City.ts#L18-L27)).
  - **Skills and augs:** the success-chance skill multipliers and the aug multiplier `bladeburner_success_chance`.
- **Difficulty** is multiplied by `√(1 + chaos − 50)` once city chaos passes 50 ([Action.ts#L94-L103](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Action.ts#L94-L103); [Constants.ts#L29-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L29-L31)).
- **Effective stats** are multiplied by Reaper (+2% per level to every combat stat) and Evasive System (+4% per level to dex and agi) ([Bladeburner.ts#L759-L774](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L759-L774)).

### Action time

```
time = ceil( max(1, (difficulty/10) × skillFac / statFac) × penalty )
statFac = 0.5 × (agi^0.04 + dex^0.035 + agi/1e4 + dex/1e4)
```

- `penalty` is 1.5 for Black Ops ([Action.ts#L105-L122](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Action.ts#L105-L122); [BlackOperation.ts#L51-L53](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/BlackOperation.ts#L51-L53)).
- `skillFac` is `1 − 0.01 × Overclock level`. Overclock is capped at 90, so the best is ×0.1 ([Skills.ts#L44-L53](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Skills.ts#L44-L53); [Bladeburner.ts#L776-L786](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L776-L786)).
- **Inference:** time grows with difficulty, and so with `difficultyFac^level`. The linear terms in `statFac` dominate above about 10k effective agi and dex, so time falls roughly as 1/stats there.

### Stamina

- **Cost:** every player contract, operation and Black Op costs `0.285 × (D^0.28 + D/650)` stamina, where D is its difficulty. The cost is taken *before* the success roll, so a low stamina pool penalises that same action ([Bladeburner.ts#L913-L930](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L913-L930), [#L1014-L1024](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1014-L1024); [Constants.ts#L4-L16](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L4-L16)).
- **Max stamina:** `effAgi^0.8 × CybersEdge × bladeburner_max_stamina` ([Bladeburner.ts#L1329-L1345](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1329-L1345)).
- **Regen:** `(0.0085 + max/70000) × effAgi^0.17 × CybersEdge × bladeburner_stamina_gain` per second ([Bladeburner.ts#L1319-L1327](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1319-L1327)).
- **Hyperbolic Regeneration Chamber:** adds 1% of max stamina per 60 s action ([Bladeburner.ts#L1199-L1220](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1199-L1220); [GeneralActions.ts#L46-L47](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/GeneralActions.ts#L46-L47)).
- At 0 stamina the action is cancelled ([Bladeburner.ts#L1370-L1374](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1370-L1374)).
- **Sleeves pay no stamina for their contracts:** the drain is inside `if (isPlayer)` ([Bladeburner.ts#L921-L927](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L921-L927)). Stamina is one pool on the Bladeburner object, so a sleeve doing Hyperbolic Regeneration refills the player's stamina, and a sleeve doing Training drains it ([#L1095](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1095)).
- **Inference (simulator):** with Cyber's Edge bought greedily, stamina was never the binding limit. The player was waiting on stamina only about 2% of the time.

### Skills

- The cost of a skill's next level is `round(k × (baseCost + costInc × level))` ([Skill.ts#L37-L81](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Skill.ts#L37-L81)). So *N* levels cost about `k·costInc·N²/2`, and **the level reachable from a fixed number of skill points scales as 1/√k.**
- Skills that matter for the climb ([Skills.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Skills.ts)):
  - Blade's Intuition: +3% success, all actions.
  - Digital Observer: +4%, operations and Black Ops.
  - Cloak: +5.5%, stealth actions.
  - Short-Circuit: +5.5%, kill actions.
  - Tracer: +4%, contracts.
  - Reaper and Evasive System: effective stats.
  - Overclock: time, max 90.
  - Cyber's Edge: +2% max stamina and stamina regen.
  - Hyperdrive: exp.
- Each level adds its percentage linearly, and different skills multiply ([Bladeburner.ts#L776-L786](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L776-L786)).

### Counts and the general actions that change them

- **Natural regrowth** is the table above.
- **Incite Violence** (60 s, no stamina) adds 180 s of regrowth to every contract and operation ([Bladeburner.ts#L1221-L1237](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1221-L1237); [GeneralActions.ts#L53-L54](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/GeneralActions.ts#L53-L54)).
  - It also raises chaos in **every** city by 10 and then by `chaos/log10(chaos)`.
  - Diplomacy (60 s) removes only `cha^0.045 + cha/1000` **percent** of chaos in the current city ([Bladeburner.ts#L737-L745](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L737-L745), [#L1187-L1198](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1187-L1198)).
  - Stealth Retirement removes 1–3% per op ([Bladeburner.ts#L848-L856](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L848-L856)).
- **Sleeve "Infiltrate Synthoids"**: every 60 s each such sleeve adds `n^−0.5/2` to every contract and operation, where *n* is the number of infiltrating sleeves ([SleeveInfiltrateWork.ts#L7](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveInfiltrateWork.ts#L7), [#L20-L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveInfiltrateWork.ts#L20-L28); [Bladeburner.ts#L1253-L1265](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1253-L1265)). In total that is **√n/2 per action per minute**: 0.5 for 1 sleeve, 0.71 for 2, 0.87 for 3, 1.41 for 8.
- **Other sleeve Bladeburner tasks** ([Sleeve.ts#L488-L540](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L488-L540)):
  - Contracts, but no operations, and no two sleeves on the same contract ([SleeveBladeburnerWork.ts#L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveBladeburnerWork.ts#L14); [NetscriptFunctions/Sleeve.ts#L271-L302](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L271-L302)).
  - Training, Field Analysis, Recruitment, Diplomacy and Hyperbolic Regeneration.
  - "Support main sleeve", which adds 1 to team size ([SleeveSupportWork.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveSupportWork.ts)).
  - Sleeves cannot Incite Violence.
- **Correction to the 2022 community guide:** it says failures don't use up a count. In v3.0.1 they do: `--action.count` is on both branches ([Bladeburner.ts#L933](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L933), [#L976](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L976)).

### Joining

- **Requirement:** 100 in each combat stat (bitnode-survey.md, "Conventions").
- **Stat levels:** `floor(mult × (32·ln(exp + 534.6) − 200))`, where `mult` includes the BitNode's combat level multiplier ([skill.ts#L7-L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15); [Person.ts#L66-L80](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Person.ts#L66-L80)).
- **The gym:** Powerhouse Gym gives 10 exp/s to one stat at a time, times `*_exp` mults and the hash gym bonus ([LocationsMetadata.ts#L322-L328](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L322-L328); [ClassWork.tsx#L53-L57](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/ClassWork.tsx#L53-L57); [Work/Formulas.ts#L108-L121](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/Formulas.ts#L108-L121)).

| BN | Combat mult (BN × SF1.3 × SF6.1) | Base level needed | Exp per stat | Gym time for 4 stats, no augs (**Inference**) |
|---|---|---|---|---|
| 6.1 | 1 × 1.28 | 78 | 5.4k | ~0.5 h |
| 7, 2 | 1 × 1.38 | 72 | 4.4k | ~0.4 h |
| 13, 15 | 0.7 × 1.38 | 103 | 12.6k | ~1 h |
| 14 | 0.5 × 1.38 | 145 | 47k | ~3.8 h |
| 9 | 0.45 × 1.38 | 161 | 78k | ~6.3 h |
| 10 | 0.4 × 1.38 | 181 | 147k | ~11.8 h |

**Inference:** exp augs, the hash "Improve Gym Training" upgrade (+20% per level, [HashUpgradesMetadata.tsx#L70-L80](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/HashUpgradesMetadata.tsx#L70-L80)) and starting the gym the moment the BN begins all shorten this. In BN9 and BN10 it is still a step of hours that a script should start first.

---

## The 21 Black Ops

They are done in order, one at a time, each once its rank requirement is met ([BlackOperation.ts#L44-L49](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/BlackOperation.ts#L42-L49)). The finish needs all 21 ([BlackOperations.ts#L735](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/BlackOperations.ts#L735)). Data is from [BlackOperations.ts#L7-L731](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/BlackOperations.ts#L7-L731).

| # | Name | Rank needed | Difficulty | Rank gain (×r) | Rank loss | HP loss |
|---|---|---|---|---|---|---|
| 1 | Typhoon | 2.5k | 2,000 | 50 | 10 | 100 |
| 2 | Zero | 5k | 2,500 | 60 | 15 | 50 |
| 3 | X | 7.5k | 3,000 | 75 | 15 | 100 |
| 4 | Titan | 10k | 4,000 | 100 | 20 | 100 |
| 5 | Ares | 12.5k | 5,000 | 125 | 20 | 200 |
| 6 | Archangel | 15k | 7,500 | 200 | 20 | 25 |
| 7 | Juggernaut | 20k | 10,000 | 300 | 40 | 300 |
| 8 | Red Dragon | 25k | 12,500 | 500 | 50 | 500 |
| 9 | K | 30k | 15,000 | 750 | 60 | 1,000 |
| 10 | Deckard | 40k | 20,000 | 1,000 | 75 | 200 |
| 11 | Tyrell | 50k | 25,000 | 1,500 | 100 | 500 |
| 12 | Wallace | 75k | 30,000 | 2,000 | 150 | 1,500 |
| 13 | Shoulder of Orion | 100k | 35,000 | 2,500 | 500 | 1,500 |
| 14 | Hyron | 125k | 40,000 | 3,000 | 1,000 | 500 |
| 15 | Morpheus | 150k | 45,000 | 4,000 | 1,000 | 100 |
| 16 | Ion Storm | 175k | 50,000 | 5,000 | 1,000 | 5,000 |
| 17 | Annihilus | 200k | 55,000 | 7,500 | 1,000 | 10,000 |
| 18 | Ultron | 250k | 60,000 | 10,000 | 2,000 | 10,000 |
| 19 | Centurion | 300k | 70,000 | 15,000 | 5,000 | 10,000 |
| 20 | Vindictus | 350k | 75,000 | 20,000 | 20,000 | 20,000 |
| 21 | Daedalus | 400k | 80,000 | 40,000 | 10,000 | 100,000 |

- **Stat weights:** every Black Op weights combat at 0.8–1.0 in total, with decay 0.8 and charisma 0. Hacking and intelligence carry the rest.
- **What they ignore:** city population and chaos ([BlackOperation.ts#L55-L61](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/BlackOperation.ts#L55-L61)).
- **Time:** ×1.5. Each Black Op stops the action when it ends, win or lose ([Bladeburner.ts#L1083](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1083)).
- **Inference: stats needed for 100% on Daedalus.** I assumed the player's skill points (maxRank/3) are spread evenly over Blade's Intuition, Digital Observer, Short-Circuit, Reaper and Evasive System, with int 100 and hacking 500.

| k | Skill points at 100k rank → min raw combat S | at 400k rank → min raw combat S |
|---|---|---|
| 1 (BN2, 6, 10) | ~1,100 | ~50 |
| 1.2 (BN9) | ~1,600 | ~80 |
| 2 (BN7, 13, 14) | ~4,300 | ~260 |
| 3 (BN15) | ~8,800 | ~630 |

With no skills, Daedalus needs S ≈ 1.7 million. **Inference:** the Black Op difficulty only bites if a script hoards skill points or spends them on Overclock and Cyber's Edge alone. The Black Ops add one 1.5×-time action per rank band, and their 74k total rank is a useful boost along the way.

---

## What limits the climb (Inference, from the model and the simulator)

1. **Start (0 to about 2.5k rank, the first few hours):** success chance limits the climb. Stats are close to the 100 join minimum and there are no skill points. Contracts first.
2. **Middle (most of the run, no sleeves):** the counts. Assassination and Stealth Retirement regrow at about 8 per hour, so their levels climb as √(successes) and rank per hour rises slowly but steadily.
   - In the BN6 simulation at S = 1000, the player had **every action at count 0 for 39% of the time**, did actions 53% of the time and waited on stamina 2% of the time.
   - Higher stats did not help: S = 3000 and S = 10000 both finish in about 38–39 h.
3. **With sleeves infiltrating:** counts stop binding. The limit becomes **action time and success chance**, that is stats and Overclock. The player then does actions about 85–93% of the time, and higher S keeps helping.
4. **The rank multiplier works through levels.** To make up a factor 1/r, an action needs `ln(1/r)/ln(rewardFac)` more levels: about 4 Assassination levels for r = 0.6 and 6 for r = 0.45. Since level ∝ √successes, that costs extra successes in proportion to the current level, not 1/r more time.

---

## Estimated time per BitNode (Inference, simulator)

Hours from joining Bladeburner to completing Daedalus. Each cell is the median of 3 runs. S_ref is held constant through the run (see limits). The SF7 bonus is applied where owned: +12% success and stamina at 7.3, +14% after it. "Sleeves" means that many sleeves on Infiltrate Synthoids for the whole run. BN9 hashes are left out here and covered separately.

| BN (r, k, combat) | S_ref 300 | 300 + sleeves | S_ref 1000 | 1000 + sleeves | S_ref 3000 | 3000 + sleeves | S_ref 10000 | 10000 + sleeves |
|---|---|---|---|---|---|---|---|---|
| 6.1 (1, 1, 1), no sleeves owned | 60 | — | 38 | — | 38 | — | 39 | — |
| 7.1 (0.6, 2, 1), no sleeves owned | 97 | — | 73 | — | 52 | — | 51 | — |
| 7.3 (as 7.1, SF7.2 owned) | 96 | — | 69 | — | 50 | — | 51 | — |
| 9.x (0.9, 1.2, 0.45), no sleeves owned | 77 | — | 57 | — | 40 | — | 41 | — |
| 10.1 (0.8, 1, 0.4), 1 own sleeve | 77 | 57 | 56 | 25 | 43 | 15 | 43 | 10 |
| 10.3 (as 10.1), 3 own sleeves | 79 | 58 | 55 | 25 | 43 | 15 | 43 | 8 |
| 2.x (1, 1, 1), 3 sleeves | 56 | 25 | 38 | 15 | 38 | 8 | 38 | 6 |
| 13.x (0.45, 2, 0.7), 3 sleeves | 125† | 159† | 85 | 48 | 63 | 25 | 58 | 9 |
| 14.x (0.6, 2, 0.5), 3 sleeves | 129† | 162† | 81 | 45 | 60 | 30 | 50 | 13 |
| 15.x (0.2, 3, 0.7), 3 sleeves (for comparison) | 466† | 435† | 151 | 121 | 101 | 81 | 80 | 26 |

† At S ≈ 150–210 held flat, the first Black Op alone takes about 100 h. Success chance is the limit: Assassination is about 4% at level 1. The simulator's one-step-greedy picker then stalls on contracts, and with sleeves it spends the whole run on Bounty Hunter. Read these cells as "stats must grow first", not as a time.

Other runs at S_ref = 1000 unless noted, median of 2:

- **BN9 with hashes** (S = 450, 9.x settings): 0 h/s → 56 h; 50 h/s → 50 h; 100 h/s → 50 h; 200 h/s → 49 h.
- **BN9 with 3 sleeves** (the order change below) and 100 h/s: **17 h**.
- **BN7 with 3 sleeves:** 36 h, against 69–73 h without.
- **BN10 with no SF7** (BN10 before BN7) at S = 400: 28–30 h with 1 sleeve, 27–28 h with 3. That compares with 25 h when SF7.3 is owned.
- **Incite Violence when every count is 0**, using Diplomacy to keep chaos under a cap:
  - BN6 at cap 50: 38 → 37 h with cha 300, and 36 h with cha 3000.
  - At S_ref 3000 with cha 3000: cap 200 gives 32 h and cap 1000 gives 31 h, against 38 h without.

**Reading it:**
- **Without sleeves, the BB BitNodes take 1.5–4 days of Bladeburner time.** BN6 is about 1.6 days, BN7 about 3 days, BN9 about 2–2.5 days and BN10 about 2.3 days.
- **With three sleeves, BN2 and BN10 drop under a day** at middling stats: about 15 h and 25 h at S_ref 1000. BN13 and BN14 stay near 2 days (45–48 h) at S_ref 1000. They fall to about 1 day (25–30 h) only at S_ref 3000, because with sleeves the limit becomes stats and their combat levels are ×0.7 and ×0.5.
- Add to each:
  - the join time (table above);
  - the money and aug side, which the model leaves out (stats held flat);
  - the scripted travel, skill buying and Black Op handling.
- The single community figure, BN7 "about a day longer than 6" with a good script ([2022 guide](https://docs.google.com/document/d/e/2PACX-1vQVY-It-H_Q5u6DPXVDeaFvGRN8NgXXXYAHqRMdDs2WfZVAcDZl90LT0MEd2zPCJP-wMj2tm7bOGSkN/pub)), agrees with the model's 38 h vs 50–73 h. The guide predates 3.0 and its count rule is stale.
- The in-game guide calls Bladeburner "slow" but "rarely nerfed", and "a good choice in extremely hard BitNodes (e.g., BitNode 9, BitNode 13)" ([bitnode_recommendation_comprehensive_guide.md#L91-L100](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/bitnode_recommendation_comprehensive_guide.md#L91-L100)).

---

## The hacking finish in the same BitNodes

The WD climb needs hacking exp of `e^((WD req / M_total + 200)/32)` ([skill.ts#L7-L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15)), where M_total = player hacking mult × `HackingLevelMultiplier`. Exp income is scaled by `HackExpGain` ([Hacking.ts#L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacking.ts#L37)).

**Inference:** I take a late-BN exp farm of about 1e7 exp/s before `HackExpGain`. That is the bn1-bootstrap.md estimate for about 1.75 PB at hacking ≈ 1000. The table gives the player hacking multiplier *M* (augs × SF1/SF5 × NFG) needed to finish the climb in about **one day**, plus log10 of the exp needed at fixed *M*.

| BN | Eff. WD level | HackExpGain | *M* for ~1 day | log10 exp needed at M=10 | at M=20 | at M=40 |
|---|---|---|---|---|---|---|
| 1 | 3,000 | 1 | 4.4 | 6.8 | 4.8 | 3.7 |
| 4 (boyce measured 158 h at SF4.1) | 9,000 | 0.4 | 14 | 15.3 | 9.2 | 6.2 |
| 2 | 18,750 | 1 | 28 | 28.2 | 15.4 | 9.1 |
| 6, 7 | 17,143 | 0.25 | 27 | 26.6 | 14.9 | 9.1 |
| 9 | 12,000 | 0.05 (and no cloud servers) | 20–24 | 20.3 | 12.2 | 8.1 |
| 10 | 17,143 | 1 | 25 | 26.0 | 14.3 | 8.5 |
| 13 | 36,000 | 0.1 | 59 | 52.6 | 28.1 | 15.9 |
| 14 | 37,500 | 1 (hack speed ×0.3) | 58 | 53.6 | 28.2 | 15.4 |

- The product of every `hacking` multiplier on every augmentation in [Augmentations.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts) is about ×43. That would mean buying all 31 of them, at ×1.9 compounding prices and BN aug-cost multipliers of ×3 (BN7) or ×5 (BN10). SF1.3 adds ×1.28, SF5 up to ×1.14, and NFG 1% per level.
- The bn1-bootstrap.md BN1 example works at M ≈ 5.
- **Inference:** an *M* of 25–60 is out of reach in a fast run. Exp is exponential in `E/M`, so even M = 20 leaves BN6/7/10 at 1e14–1e15 exp, which is years at 1e7/s. **The hacking finish is not a real option in BN2, 6, 7, 10, 13 or 14.**
- **BN9** is the closest case at M ≈ 20. With no cloud servers its exp farm runs on home and hacknet-server RAM only, so it falls on the same side.
- The community measurement points the same way: boyce's hacking-only BN4.1 took about 158 h, 57 h of it on the last climb to 9000 (community-prior-art.md §2.5), and BN4's effective level is about half of BN6's.

---

## Effects of the run's other Source-Files and mechanics

- **SF7.1–7.3:** +8/12/14% to Bladeburner success chance, max stamina, stamina gain and analysis ([applySourceFile.ts#L110-L122](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L110-L122)). **Inference (simulator):** a few percent of time.
- **SF7.3, Blades' Simulacrum:**
  - Without it, any other player work cancels the Bladeburner action, and starting a Bladeburner action ends other work ([Bladeburner.ts#L173-L180](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L173-L180), [#L1355-L1368](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1355-L1368)).
  - With it, the gym or faction work runs alongside. **Inference:** the gain is higher S, plus rep and money for augs, during an otherwise Bladeburner-bound day.
  - Before SF7.3 it can be bought from the Bladeburners faction for 1,250 rep and $150b × `AugmentationMoneyCost`, which is $450b in BN7 and $750b in BN10 ([Augmentations.ts#L284-L297](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L284-L297)).
  - With SF7.3 owned, Stanek's Gift must be accepted before joining (bitnode-survey.md, BN7).
- **Sleeves (SF10):** Infiltrate Synthoids is the strongest use (above). Sleeves can also take contracts at no stamina cost, refill the shared stamina with Hyperbolic Regeneration, or hold chaos down with Diplomacy so the player can Incite. **Inference:** I modelled only infiltration. A mixed assignment may do better once counts are no longer binding.
- **BN9 hashes:**
  - "Exchange for Bladeburner Rank" adds 100 rank (unscaled by r), and the *n*-th purchase costs 250·*n* hashes. 10k rank costs about 1.26M hashes and 30k about 11.3M.
  - "Exchange for Bladeburner SP" gives 10 SP on its own escalating cost ([HashUpgradesMetadata.tsx#L90-L107](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/HashUpgradesMetadata.tsx#L90-L107)). **Inference:** rank purchases also give 33 SP each, so they beat SP purchases at equal level.
  - A maxed hacknet server makes about 19 hashes/s ([HacknetServers.ts#L4-L17](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts#L4-L17); [Hacknet/data/Constants.ts#L32-L52](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/Constants.ts#L32-L52)). Twenty of them make about 380/s. **Inference:** hashes help mostly early, before rank per success takes off.
- **BN13, Stanek's Gift:**
  - Each fragment's effect is `1 + ln(highestCharge+1)/60 × ((numCharge+1)/5)^0.07 × power × boost × StaneksGiftPowerMultiplier` ([CotMG/formulas/effect.ts#L3-L12](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/formulas/effect.ts#L3-L12)). `highestCharge` is the largest thread count used in one charge ([StaneksGift.ts#L33-L39](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/StaneksGift.ts#L33-L39)).
  - The combat fragments have power 2 and the Bladeburner fragment 0.4 ([Fragment.ts#L148-L187](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/Fragment.ts#L148-L187), [#L248-L257](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/Fragment.ts#L248-L257)). BN13's multiplier is 2.
  - Combat fragments multiply both the level and exp multiplier of their stat. The Bladeburner fragment multiplies stamina, analysis and success chance ([StaneksGift.ts#L155-L200](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/StaneksGift.ts#L155-L200)).
  - **Inference:** at 10k–100k charging threads, a combat fragment gives about ×1.75–1.95 and the Bladeburner fragment about ×1.15–1.2. That roughly cancels BN13's ×0.7 combat level. It matters little while counts bind, and more once sleeves free them.
- **BN14, IPvGO:** the Tetrads node power boosts combat (bitnode-survey.md, BN14). Faction-work rep ×0.2 makes non-Bladeburner augs slow. **Inference:** Bladeburner faction rep (2 per rank, [Formulas.ts#L46-L49](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L46-L49)) is the main aug source there.
- **BN2, gang:** crime money ×3 and gang income pay for augs and stats. The gang needs no Source-File. **Inference:** BN2's Bladeburner side is the same as BN6's, and its economy is better.

---

## What this means for the BitNode order (Inference)

The draft order (#9) is: 1.1 → 4.1–4.3 → 5.1 → 1.2 → 1.3 → 6.1 → 7.1–7.3 → 9.1–9.2 → 10.1–10.3 → back. The back, cheapest first, is 5.2, 5.3, 12.x, 6.2, 6.3, 9.3, 8.x, 11.x, 3.x, 2.x, 13.x, 15.x, 14.x.

1. **Keep the Black Ops finish for BN2, 6, 7, 9, 10, 13 and 14.** The hacking finish is out of reach in each of them (table above). BN8 has no Bladeburner, and BN15's ×0.2 / ×3 makes Bladeburner about 3–5 days even with sleeves, so BN15 stays a darknet-lab and hacking finish.
2. **Consider moving 10.1–10.3 up, to just after 6.1:** 6.1 → 10.1–10.3 → 7.1–7.3 → 9.1–9.2. At S_ref ≈ 1000 in the simulator, with each BN's own SF-bonus state:
   - **Draft order:** BN7 ×3 ≈ 70 h each, BN9 ×2 ≈ 50 h each (with hashes), BN10 ×3 ≈ 25 h each. About **385 h** of Bladeburner time.
   - **10 first:** BN10 ×3 ≈ 28 h each (no SF7), BN7 ×3 ≈ 36 h each (3 sleeves), BN9 ×2 ≈ 17 h each (3 sleeves). About **225 h**.
   - **What it gives up:**
     - BN10 played without SF7's +14% and without Blades' Simulacrum. BN10 aug money is ×5, so buying the Simulacrum at $750b is unlikely.
     - BN10 played without SF9's 128 GB home and hacknet servers, so no hash gym boost for BN10's long join. BN10's ~12 h join is the same in both orders unless hashes speed it up.
     - The extra sleeves arrive later for nothing else, since sleeves also help the gang, karma and rep loops.
   - The saving is large compared with these costs, but it rests on the simulator. **This is the main thing a milestone save should check.**
3. **Move BN2 up the back, next to 6.2/6.3.** All three have identical Bladeburner multipliers (r = 1, k = 1, combat ×1). With SF7.3 and three sleeves they are the cheapest Bladeburner runs, at about 15 h at S_ref 1000. BN2 also has the better economy (crime ×3, gang). Its old place near the end was set by its hacking requirement.
4. **BN13 and BN14:** both stay Black Ops finishes and cost about the same: 45–48 h with 3 sleeves at S_ref 1000, and 25–30 h at S_ref 3000. BN14 no longer needs to be last on Bladeburner cost alone. Its ×0.2 work rep and ×0.4 crime success make the aug side slower, which the model leaves out, so keeping it last is still defensible.
5. **Join time is a fixed cost to schedule:** about 6 h in BN9 and 12 h in BN10 from gym alone. A script should start combat training in the first second of those BitNodes. With SF7.3, Bladeburner work can then overlap the gym.

---

## The simulator and its limits

I wrote a short Node.js simulator (not committed; it is a research aid) from the formulas cited above. It plays one Bladeburner career:
- **Actions:** it picks the contract or operation and level with the best expected rank per second. The cost includes the stamina regen time the action implies, and the score subtracts operation rank loss on failure.
- **Stamina:** it does Hyperbolic Regeneration when stamina would drop below 50%.
- **Black Ops:** it does each one at ≥ 95% success.
- **Skills:** it buys skill points greedily by marginal log-gain in rank rate per point, and by Black Op success when a Black Op is gated.
- **Counts:** it tracks counts with mean regrowth, levels and max levels, and Overclock's cap.

**Simplifications, all of which make it optimistic or pessimistic in ways I can't size:**
- **Stats are held constant.** No exp from actions, no gym, no aug installs. Real runs start near S = 100 and grow, so the "S_ref 300" column is the closest to an early run.
- **City model:** population is fixed at 1e9 (success factor 1), chaos starts at 0, there is no travel, and Raid is omitted. Raid needs Synthoid communities and cuts population by 1% per success.
- **No team members or recruitment.** The team bonus is at most about ×1.26 for 100 members.
- **Mean count regrowth** is used instead of random draws, and initial counts are at their midpoint.
- **Sleeves** only infiltrate. Their contract work, regen and diplomacy are not modelled.
- **Time starts at joining**, so join time is extra. Bonus time is ignored.
- **It is not validated against the game.** A timed run from a milestone save in BN6 is the obvious check.

---

## Not verified from source, or inferred

- **Every hour figure is Inference** from the simulator above. The ranking between BitNodes and the size of the sleeve effect are more robust than the absolute hours.
- **Hacking-finish times** rest on an assumed exp throughput of about 1e7/s from bn1-bootstrap.md and on the aug multiplier product. Neither was measured.
- **Stanek charge levels** reachable in BN13 are assumed, not computed from RAM.
- **`ClassGymExpGain` unused:** found by grep only.
- **The 2022 community guide** predates v2/v3 Bladeburner changes. I used it only as a sanity check on the BN6 vs BN7 gap.

## Open questions

1. A timed BN6 (and later BN7) milestone run to calibrate the simulator: hours to 400k rank, time spent at count 0, and stat growth.
2. With sleeves, what is the best mix of Infiltrate, contracts, Hyperbolic Regeneration and Diplomacy, and does Incite Violence pay once sleeves hold chaos down?
3. Does moving BN10 ahead of BN7/BN9 (point 2 above) hold up once the money and aug side of BN10 without SF7.3 and SF9.2 is counted?
4. How fast can the 100-combat join be done in BN9 and BN10 with exp augs and hash gym upgrades?
