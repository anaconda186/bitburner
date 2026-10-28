# What each BitNode restricts, and the fastest plausible way to finish it

Research for [#3](https://github.com/anaconda186/bitburner/issues/3), part of map [#1](https://github.com/anaconda186/bitburner/issues/1). Research date: 2026-10-28. Target version: web **v3.0.1**.

Sources: the game's source at [`bitburner-official/bitburner-src`](https://github.com/bitburner-official/bitburner-src), tag **v3.0.1** (commit `3162fd2`). I read it and did not run it. Every link below is pinned to that tag. Anything marked **Inference** is my reading, not something the code states.

This builds on `docs/research/bitburner-current-state.md`, which already covers how finishing a BitNode works, Singularity RAM costs and what each kind of reset keeps. I don't repeat those here.

---

## Summary

1. **Only BN12 changes with level.** Every other BitNode's multipliers ignore the level argument, so BN*n*.2 and BN*n*.3 are exactly as hard as BN*n*.1. Only the Source-Files the player owns differ ([BitNode.tsx#L570-L1127](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L570-L1127)).
2. **BN12 is set by the *active* SF12 level, not the owned one.** Its multipliers use `activeSourceFileLvl(12) + 1` ([BitNode.tsx#L1129-L1131](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1129-L1131)). BitNode options can set that active level to 0, and the game's own note says you still earn the next SF level ([BitNodeAdvancedOptions.tsx#L118-L120](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/ui/BitNodeAdvancedOptions.tsx#L118-L120)). So BN12.2 and BN12.3 can be played at BN12.1 difficulty. The saving is small: WD needs 3060 instead of 3121 or 3184.
3. **The WD hacking requirement is 3000 × `WorldDaemonDifficulty`. What really sets the cost is that number divided by the BN's `HackingLevelMultiplier`.** Skill is `floor(mult × (32·ln(exp + 534.6) − 200))` ([skill.ts#L7-L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15)), so the exp needed grows exponentially with required level ÷ multiplier. That ratio, the **effective WD level**, is 3000–4500 in BN1/5/8/12, 7500–10000 in BN3/4/11/15, 12000 in BN9, about 17000 in BN6/7/10, about 19000 in BN2 and 36000–37500 in BN13/14.
4. **Bladeburner Black Ops is a second way to finish any BitNode once SF6 or SF7 is owned**, except BN8, where `BladeburnerRank` is 0 and Bladeburner is hidden. The last Black Op needs rank 400k ([BlackOperations.ts#L708](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/BlackOperations.ts#L708)), and rank gain is scaled by `BladeburnerRank` ([Bladeburner/Formulas.ts#L13-L25](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L13-L25)). **Inference:** for the BitNodes with the worst effective WD level (BN2, 6, 7, 9, 10, 13, 14), Bladeburner is likely to be the faster finish once SF7 is owned.
5. **Four BitNodes block or reroute the usual hacking path:**
   - **BN8:** script hacks earn **$0** (`ScriptHackMoneyGain: 0`), so money comes from the stock market only.
   - **BN9:** **no cloud servers** (`CloudServerLimit: 0`), and hacking exp is ×0.05.
   - **BN15:** Daedalus does not sell The Red Pill. It is the reward of the 5th darknet lab.
   - **BN2:** the gang's faction sells The Red Pill, with none of Daedalus's requirements.
6. **Some Source-Files are infrastructure for the rest of the run:**
   - SF4.3: Singularity at 1× RAM.
   - SF1: 32 GB starting home and +16/24/28% to almost every multiplier.
   - SF9.2: 128 GB starting home. SF9.1 adds hacknet servers.
   - SF5: Formulas.exe on every reset, plus `getBitNodeMultipliers`.
   - SF10: sleeves.
   - SF6/SF7: the Bladeburner finish everywhere.
   - SF15: darknet labs in every BitNode, which opens a second route to The Red Pill.

   See [Cross-BN dependencies](#cross-bn-dependencies).
7. **The v3.0.1 code differs from the in-game SF15.2 text.** The 20% faster darknet authentication is coded as `activeSourceFileLvl(15) > 2`, so it only takes effect at SF15.3 ([DarkNet/effects/effects.ts#L80](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L80)).

---

## Conventions

- **WD** = `w0r1d_d43m0n`. **TRP** = The Red Pill.
- **WD req** = `3000 × WorldDaemonDifficulty`, applied when the server is created ([ServerHelpers.ts#L383-L385](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerHelpers.ts#L383-L385); [servers.ts#L1532-L1539](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1532-L1539)).
- **Effective WD level** (my index, **Inference**) = WD req ÷ `HackingLevelMultiplier`. It is the hacking level a player with BN-neutral multipliers would need to reach. Hacking exp is also multiplied by `HackExpGain` ([Hacking.ts#L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacking.ts#L37)), so I list that alongside.
- **Default multipliers** are all 1. The exceptions are `DaedalusAugsRequirement` = 30 and `StaneksGiftExtraSize` = 0 ([BitNodeMultipliers.ts#L8-L185](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L8-L185)). A multiplier not listed for a BN is 1.
- **Cloud servers:**
  - Limit = `round(25 × CloudServerLimit)`.
  - Max RAM = `2^20 × CloudServerMaxRam`, rounded *down* to a power of two ([ServerPurchases.ts#L96-L105](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerPurchases.ts#L96-L105); [Server/data/Constants.ts#L12-L13](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/Constants.ts#L12-L13)).
- **SF level scaling:** for every SF with a percentage bonus, level 1 gives *b*, level 2 gives 1.5*b* and level 3 gives 1.75*b*. The loop adds `b / 2^i` per level ([applySourceFile.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts)).
- **"Gated" features** use `canAccessBitNodeFeature(n)`: in BN *n*, or active SF*n* ≥ 1 ([BitNodeUtils.ts#L17-L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeUtils.ts#L17-L19)).
- **The hacking finish always needs the same steps** (details in the current-state doc):
  1. TRP installed.
  2. All five port openers, then root on WD.
  3. Hacking ≥ WD req.
  4. `destroyW0r1dD43m0n` or a backdoor.

  The Daedalus invite needs `DaedalusAugsRequirement` installed augs, $100b, and hacking 2500 *or* all four combat stats at 1500 ([FactionInfo.tsx#L138-L149](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L138-L149)). The aug count is `augmentations.length`, and NeuroFlux Governor is a single entry at any level ([FactionJoinCondition.ts#L116-L131](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionJoinCondition.ts#L116-L131); [AugmentationHelpers.ts#L54-L59](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L54-L59)).
- **TRP rep cost** = 2.5m × `AugmentationRepCost`, with no money cost ([Augmentations.ts#L1946-L1953](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1946-L1953); [AugmentationHelpers.ts#L156-L159](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L156-L159)).
- **The Bladeburner finish needs all 21 Black Ops** ([BlackOperations.ts#L735](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/BlackOperations.ts#L735); [Singularity.ts#L1171-L1180](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Singularity.ts#L1171-L1180)):
  - Ranks run from 2.5k to 400k ([BlackOperations.ts#L11](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/BlackOperations.ts#L11), [#L708](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/BlackOperations.ts#L708)).
  - Joining needs 100 in each of str/def/dex/agi ([SpecialLocation.tsx#L68-L76](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/SpecialLocation.tsx#L68-L76); [NetscriptFunctions/Bladeburner.ts#L349-L362](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Bladeburner.ts#L349-L362)).
  - The API needs BN6/7 or SF6/7 ([NetscriptFunctions/Bladeburner.ts#L33-L42](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Bladeburner.ts#L33-L42)).
  - Bladeburner is hidden and joining is refused where `BladeburnerRank` is 0 ([SpecialLocation.tsx#L106](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/SpecialLocation.tsx#L106)).
  - **Inference:** the Bladeburner finish needs no TRP, no Daedalus and no port openers.

---

## Per-BitNode survey

### BN1: Source Genesis

- **Source:** [BitNode.tsx#L41-L69](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L41-L69); multipliers [#L572-L574](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L572-L574) (all defaults).
- **Multipliers:** all 1. WD req **3000**, effective 3000. Daedalus needs 30 augs. 25 cloud servers up to 2^20 GB.
- **Restrictions:** none.
- **Mechanic:** none. This is the baseline.
- **Finish:** hack WD at 3000.
- **SF1:**
  - Every level: start each new BN with 32 GB home ([Prestige.ts#L246-L253](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L246-L253)).
  - Levels 1/2/3 add +16/24/28% to almost every player multiplier: hacking chance, speed, money, grow, level and exp; combat and charisma level and exp; company and faction rep; crime money and success; hacknet money; work money. Hacknet costs are divided by the same factor ([applySourceFile.ts#L14-L49](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L14-L49)).
- **Plausibly fastest:** the standard hacking loop. The run must automate the money engine (HWGW against the best target, buying cloud servers), port-opener purchases, faction joining and work, aug buying and installing, the Daedalus invite, TRP and the WD destroy.
  - In a fresh BN1.1 every Singularity step has to go through the UI or terminal. That is ticket [#2](https://github.com/anaconda186/bitburner/issues/2).
  - **Inference:** BN1.2 and BN1.3 are best replayed late, once SF4.3, SF5 and SF9.2 make them almost free. They are the cheapest BitNodes after BN8 and BN12.

### BN2: Rise of the Underworld

- **Source:** [BitNode.tsx#L70-L103](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L70-L103); multipliers [#L575-L598](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L575-L598).
- **Multipliers:**
  - HackingLevel 0.8; WD ×5, req **15000**, effective **18750**.
  - ServerGrowthRate 0.8, ServerMaxMoney **0.08**, ServerStartingMoney 0.4.
  - CrimeMoney 3, InfiltrationMoney 3.
  - FactionWorkRepGain 0.5, **FactionPassiveRepGain 0**.
  - CloudServerSoftcap 1.3.
  - Hacking exp and aug costs are normal. Daedalus needs 30 augs.
- **Restrictions:**
  - No passive faction rep. `processPassiveFactionRepGain` returns early ([FactionHelpers.tsx#L132-L137](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionHelpers.tsx#L132-L137)).
  - Server money is 8% of normal.
- **Mechanic: gangs.**
  - In BN2 a gang can be formed with **no karma requirement** ([PlayerObjectGangMethods.ts#L12-L30](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGangMethods.ts#L12-L30)). You still need an invite from a gang faction, for example Slum Snakes: combat 30, $1m, karma −9 ([FactionInfo.tsx#L662-L666](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L662-L666)).
  - The gang's faction sells almost every non-special aug, and in BN2 it also sells **TRP** ([FactionHelpers.tsx#L173-L200](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionHelpers.tsx#L173-L200)).
  - `ns.gang.*` needs no Source-File.
- **Finish:**
  - Hack WD at 15000. TRP can come from the gang faction, with no 30-aug, $100b or 2500-hacking gate.
  - With SF6 or SF7, the Black Ops finish is also open, and `BladeburnerRank` is 1 here.
- **SF2:**
  - Gangs in other BNs once karma ≤ −54000 ([Gang/data/Constants.ts#L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Gang/data/Constants.ts#L27)).
  - +24/36/42% to crime money, crime success and charisma ([applySourceFile.ts#L50-L61](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L50-L61)).
  - The levels change no unlocks.
- **Plausibly fastest:**
  - Automate crime (karma for the Slum Snakes invite), then gang management: recruit, set tasks, ascend, buy equipment, and handle territory warfare and the clash toggle. Gang money pays for augs, and gang respect becomes faction rep for TRP.
  - The hard part is reaching hacking 15000 at ×0.8. That needs a hacking-exp farm (grow or weaken spam) on top of heavy augs.
  - **Inference:** with SF7 already owned, the Bladeburner route (combat stats from gang money and gym, then Black Ops) is plausibly faster than hacking 15000. Without it, BN2 is one of the slower hacking finishes.

### BN3: Corporatocracy

- **Source:** [BitNode.tsx#L104-L138](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L104-L138); multipliers [#L599-L632](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L599-L632).
- **Multipliers:**
  - HackingLevel 0.8; WD ×2, req **6000**, effective **7500**.
  - ServerGrowthRate **0.2**, ServerMaxMoney **0.04**, ScriptHackMoney 0.2.
  - HomeComputerRamCost 1.5, CloudServerCost 2.
  - CompanyWorkMoney, CrimeMoney and HacknetNodeMoney all 0.25.
  - **AugmentationMoneyCost 3, AugmentationRepCost 3**, so TRP needs 7.5m rep.
  - FavorToDonateToFaction 0.5: donate from 75 favor instead of 150.
  - Daedalus needs 30 augs.
- **Restrictions:** none hard. Hacking is starved: growth ×0.2, max money ×0.04, steal ×0.2.
- **Mechanic: corporation.**
  - Only in BN3 can it be started with seed money. Elsewhere it is self-funded at $150b ([Corporation/helpers.ts#L30-L51](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/helpers.ts#L30-L51)).
  - In BN3, or with SF3.3, the Office and Warehouse APIs are free ([PlayerObjectCorporationMethods.ts#L21-L24](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectCorporationMethods.ts#L21-L24)). Otherwise each is a $50b unlock ([CorporationUnlocks.ts#L65-L75](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/data/CorporationUnlocks.ts#L65-L75)).
- **Finish:** hack WD at 6000. Or Black Ops with SF6/7, where `BladeburnerRank` is 1.
- **SF3:**
  - Corporations in other BNs. They are disabled where `CorporationSoftcap` < 0.15, which is only BN8.
  - SF3.3 gives the full API permanently.
  - +8/12/14% to charisma and work money ([applySourceFile.ts#L62-L72](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L62-L72)).
- **Plausibly fastest:** automate a corporation through `ns.corporation`: the Agriculture-then-Tobacco opening, investment rounds, products, research, going public and dividends. It turns into the money that buys 3× augs and pays for donations.
  - **Inference:** corporation is one of the most complex mechanics to script, but it is the only big money source in BN3. A corp script built here pays off again in any later BN that needs money.

### BN4: The Singularity

- **Source:** [BitNode.tsx#L139-L169](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L139-L169); multipliers [#L633-L662](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L633-L662).
- **Multipliers:**
  - HackingLevel 1; WD ×3, req **9000**, effective **9000**. HackExpGain 0.4.
  - ServerMaxMoney 0.1125, ScriptHackMoney 0.2.
  - CompanyWorkMoney 0.1, CrimeMoney 0.2, HacknetNodeMoney 0.05.
  - All other exp gains 0.5. FactionWorkRepGain 0.75.
  - Aug costs normal. Daedalus needs 30 augs. Cloud servers normal.
- **Restrictions:** none hard. Money is poor across the board.
- **Mechanic:** Singularity. Inside BN4 every Singularity function costs 1× RAM, whatever the SF4 level ([RamCostGenerator.ts#L82-L96](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L82-L96); [NetscriptHelpers.tsx#L388-L396](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L388-L396)).
- **Finish:** hack WD at 9000. Or Black Ops with SF6/7.
- **SF4:** Singularity outside BN4, with RAM costs ×16 at SF4.1, ×4 at SF4.2 and ×1 at SF4.3. No multipliers ([applySourceFile.ts#L73-L77](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L73-L77)).
- **Plausibly fastest:** the standard hacking loop, fully scripted through Singularity. It needs hacking 9000 on ×0.4 exp and ×0.2 steal.
  - **Inference:** BN4 is the first BitNode a run can automate without UI automation, so it is the natural second BitNode. The scripts written for it become the generic loop for every later BN. Its weak money means a hacking-exp farm and a strong share/faction-rep loop matter more than in BN1.

### BN5: Artificial Intelligence

- **Source:** [BitNode.tsx#L170-L210](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L170-L210); multipliers [#L663-L693](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L663-L693).
- **Multipliers:**
  - HackingLevel 1; WD ×1.5, req **4500**, effective **4500**. HackExpGain 0.5.
  - ServerStartingSecurity 2, ServerStartingMoney 0.5, ScriptHackMoney **0.15**.
  - CrimeMoney 0.5, HacknetNodeMoney 0.2.
  - **AugmentationMoneyCost 2**.
  - InfiltrationMoney and InfiltrationRep 1.5.
  - Daedalus needs 30 augs. Cloud servers normal.
- **Restrictions:** none hard.
- **Mechanic:** the Intelligence stat. Int exp is earned only in BN5 or with SF5 ([Person.ts#L153-L190](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Person.ts#L153-L190)).
- **Finish:** hack WD at 4500. Or Black Ops with SF6/7.
- **SF5:**
  - Every level:
    - Intelligence, kept across all resets.
    - `getBitNodeMultipliers()` ([NetscriptFunctions.ts#L914-L919](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L914-L919)).
    - Formulas.exe re-added on every aug install and BN reset ([Prestige.ts#L93-L95](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L93-L95), [#L268-L270](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L277-L279)).
    - +300 Int exp per BitNode destruction, but not on a flume ([Prestige.ts#L363-L365](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L363-L365)).
  - Levels 1/2/3: +8/12/14% to hacking chance, speed, money, grow, level and exp ([applySourceFile.ts#L78-L92](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L78-L92)).
- **Plausibly fastest:** the standard hacking loop. It is the second-lowest hacking target after BN1/8/12, but stealing is very weak (×0.15) and aug money ×2.
  - **Inference:** an early pick for Formulas.exe on every reset, which makes batching exact from minute one and saves the $5b purchase. `getBitNodeMultipliers` lets the run adapt to each BN without a hard-coded table.

### BN6: Bladeburners

- **Source:** [BitNode.tsx#L211-L243](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L211-L243); multipliers [#L694-L727](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L694-L727).
- **Multipliers:**
  - HackingLevel **0.35**; WD ×2, req **6000**, effective **≈17143**. HackExpGain 0.25.
  - ServerMaxMoney 0.2, ScriptHackMoney 0.75, ServerStartingSecurity 1.5.
  - CloudServerSoftcap 2.
  - CompanyWorkMoney 0.5, CrimeMoney 0.75, HacknetNodeMoney 0.2.
  - Aug costs normal. **Daedalus needs 35 augs**. `BladeburnerRank` 1.
- **Restrictions:** none hard. Hacking is crippled on purpose.
- **Mechanic: Bladeburner.** Join at the NSA with 100 in every combat stat. On BN entry the game prompts you to do this ([Prestige.ts#L294-L299](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L294-L299)).
- **Finish:** **Black Ops** (intended), or hack WD at 6000 at ×0.35.
- **SF6:**
  - Bladeburner and its API in other BNs ([PlayerObjectBladeburnerMethods.ts#L6-L8](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectBladeburnerMethods.ts#L6-L8)).
  - +8/12/14% to combat levels and combat exp ([applySourceFile.ts#L93-L109](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L93-L109)).
- **Plausibly fastest:** train combat to 100 at the gym, join, then run the Bladeburner automaton:
  - pick the contract or operation with the best expected rank per second
  - manage stamina (rest with Field Analysis or hospital regen)
  - move between cities by chaos and population estimates
  - spend skill points
  - run each Black Op once its rank is met

  It needs `ns.bladeburner.*`, which is open in BN6, plus whatever Singularity the run has for gym, travel and augs.
  - **Inference:** this is the template for every later Bladeburner finish.

### BN7: Bladeburners 2079

- **Source:** [BitNode.tsx#L244-L279](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L244-L279); multipliers [#L728-L769](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L728-L769).
- **Multipliers:** as BN6, plus:
  - ScriptHackMoney 0.5.
  - **AugmentationMoneyCost 3**.
  - 4S data and API cost 2.
  - **BladeburnerRank 0.6, BladeburnerSkillCost 2**.
  - Daedalus needs 35 augs. WD req **6000**, effective **≈17143**.
- **Restrictions:** none hard.
- **Mechanic:** Bladeburner, as in BN6.
- **Finish:** Black Ops (rank gain ×0.6), or hack WD at 6000 at ×0.35.
- **SF7:**
  - Bladeburner and its API in other BNs.
  - +8/12/14% to Bladeburner max stamina, stamina gain, analysis and success chance ([applySourceFile.ts#L110-L122](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L110-L122)).
  - **SF7.3:** Blades' Simulacrum is granted on joining Bladeburner ([PlayerObjectBladeburnerMethods.ts#L10-L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectBladeburnerMethods.ts#L10-L19)). It lets Bladeburner actions run alongside other work ([Augmentations.ts#L284-L297](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L284-L297)).
  - With SF7.3 and Stanek available, Stanek's Gift must be accepted *before* joining ([SpecialLocation.tsx#L77-L95](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/SpecialLocation.tsx#L77-L95)).
- **Plausibly fastest:** the BN6 automaton, with harder rank and skill costs.
  - **Inference:** BN7 ×3 (SF7.3) is the key enabler for the Bladeburner finish everywhere else.

### BN8: Ghost of Wall Street

- **Source:** [BitNode.tsx#L280-L315](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L280-L315); multipliers [#L770-L800](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L770-L800).
- **Multipliers:**
  - HackingLevel 1; WD ×1, req **3000**, effective 3000. HackExpGain 1.
  - **ScriptHackMoneyGain 0** and **ManualHackMoney 0**. ScriptHackMoney 0.3 still drains servers.
  - CompanyWorkMoney, CrimeMoney, HacknetNodeMoney, CodingContractMoney and InfiltrationMoney all **0**.
  - **FavorToDonateToFaction 0**.
  - CorporationSoftcap 0, GangSoftcap 0, BladeburnerRank 0, DarknetMoneyMultiplier 0, DarknetLabyrinthRewardsTheRedPill 0.
  - Aug costs normal. Daedalus needs 30 augs. CloudServerSoftcap 4.
- **Restrictions:**
  - Hacking earns **no money** ([NetscriptHelpers.tsx#L594-L597](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L594-L597)).
  - No corporation ([Corporation/helpers.ts#L40-L42](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/helpers.ts#L40-L42)). No useful gang ([Gang/formulas/formulas.ts#L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Gang/formulas/formulas.ts#L27)). No Bladeburner, and therefore no Black Ops finish.
  - No TRP from darknet labs.
- **Mechanic: stock market.**
  - Start with $250m, a WSE account and TIX API ([Prestige.ts#L161-L167](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L161-L167), [#L293-L299](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L302-L308)).
  - Shorts and limit/stop orders are allowed in BN8 ([NetscriptFunctions/StockMarket.ts#L151-L153](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/StockMarket.ts#L151-L153), [#L178-L180](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/StockMarket.ts#L178-L180)).
  - `hack` and `grow` with `{stock: true}` push the forecast of the server's company stock ([NetscriptHelpers.tsx#L614-L616](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L614-L616); [NetscriptFunctions.ts#L305-L307](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L305-L307); [PlayerInfluencing.ts#L24-L68](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/PlayerInfluencing.ts#L24-L68)).
  - Because the donation favor threshold is 0, money can be **donated for faction rep from the first minute**: rep = $ / 1e6 × faction_rep mult ([donation.ts#L8-L18](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/formulas/donation.ts#L8-L18); [Singularity.ts#L951](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Singularity.ts#L951)).
- **Finish:** hack WD at 3000. TRP comes from Daedalus (30 augs, $100b) and can be bought outright with rep from about $2.5e12 of donations.
- **SF8:**
  - SF8.1: WSE and TIX on every reset ([Prestige.ts#L164-L167](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L164-L167)).
  - SF8.2: shorts.
  - SF8.3: limit and stop orders.
  - +12/18/21% to `hacking_grow` ([applySourceFile.ts#L123-L132](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L123-L132)).
- **Plausibly fastest:** a stock trader, ideally on 4S data at normal cost, long and short, plus hack/grow stock manipulation from the home and cloud fleet. Money then pays for augs and for donations that reach the rep thresholds, so faction work is barely needed. Hacking exp still comes from hacking.
  - **Inference:** the 3000 WD requirement makes this cheap *if* the trader compounds well. Getting 4S early is the decision that matters most.

### BN9: Hacktocracy

- **Source:** [BitNode.tsx#L316-L356](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L316-L356); multipliers [#L801-L843](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L801-L843).
- **Multipliers:**
  - HackingLevel 0.5, combat and charisma level 0.45; WD ×2, req **6000**, effective **12000**. **HackExpGain 0.05**.
  - ServerMaxMoney **0.01**, ServerStartingMoney 0.1, ServerStartingSecurity 2.5, ScriptHackMoney 0.1.
  - **HomeComputerRamCost 5**, **CloudServerLimit 0**.
  - CrimeMoney 0.5. 4S data cost 5, 4S API cost 4.
  - Aug costs normal. Daedalus needs 30 augs. BladeburnerRank 0.9.
- **Restrictions:** **no cloud servers** (`round(25 × 0) = 0`). Home RAM costs 5×.
- **Mechanic: hacknet servers.**
  - They replace hacknet nodes. They produce hashes and also have RAM that scripts can run on ([HacknetHelpers.tsx#L34-L36](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L34-L36)).
  - Entering BN9 grants one level-100, 10-core, cache-5 hacknet server, even without SF9 ([Prestige.ts#L338-L348](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L338-L348)).
  - Hashes can be spent on Sell for Money, Reduce Minimum Security, Increase Maximum Money, Improve Studying/Gym, Corporation funds/research, **Bladeburner rank and skill points**, coding contracts and company favor ([HashUpgradesMetadata.tsx#L11-L120](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/HashUpgradesMetadata.tsx#L11-L120)).
- **Finish:** hack WD at 6000 at ×0.5 level and ×0.05 exp. Or Black Ops with SF6/7, rank ×0.9, where hashes can also buy rank ([#L91-L97](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/HashUpgradesMetadata.tsx#L91-L97)).
- **SF9** ([applySourceFile.ts#L133-L147](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L133-L147); [Prestige.ts#L246-L247](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L246-L247)):
  - SF9.1: hacknet servers in every BN.
  - SF9.2: **128 GB starting home**.
  - SF9.3: the upgraded hacknet server at every BN entry, but not on aug install.
  - +12/18/21% hacknet production, and the same percentage off hacknet costs.
- **Plausibly fastest:** a hacknet-server manager that balances buying and upgrading against hash spending, with hashes first sold for money and later used on studying and security. Hacking runs on hacknet server RAM, since there are no cloud servers. The exp grind is the bottleneck.
  - **Inference:** with SF7 owned, Bladeburner, boosted by Exchange for Bladeburner Rank, is very likely faster than hacking 6000 at ×0.05 exp.
  - **Inference:** BN9.1 and BN9.2 are high-priority early picks for the 128 GB home.

### BN10: Digital Carbon

- **Source:** [BitNode.tsx#L357-L390](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L357-L390); multipliers [#L844-L888](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L844-L888).
- **Multipliers:**
  - HackingLevel **0.35**, combat and charisma level 0.4; WD ×2, req **6000**, effective **≈17143**. HackExpGain 1.
  - All money sources ×0.5: hack, manual hack, company, crime, hacknet, contracts and infiltration.
  - HomeComputerRamCost 1.5.
  - **Cloud: 15 servers (`round(25 × 0.6)`), max 2^19 GB, cost ×5.**
  - **AugmentationMoneyCost 5, AugmentationRepCost 2**, so TRP needs 5m rep.
  - Daedalus needs 30 augs. BladeburnerRank 0.8.
- **Restrictions:**
  - Sleeves can only be *bought* (The Covenant) and have their memory upgraded in BN10 ([Sleeve.ts#L24-L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L24-L28); [SleeveCovenantPurchases.tsx#L29-L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L29-L56)).
  - Covenant sleeves cost $10t × 10^n, up to 5 of them ([#L13-L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L13-L27)).
- **Mechanics: sleeves and grafting.**
  - In BN10 you own `min(3, SF10 + 1)` free sleeves, so one on the first run ([SleeveCovenantPurchases.tsx#L58-L63](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L58-L63)).
  - Entering BN10 caps sleeve shock at 25 and lifts sync to at least 25 ([PlayerObjectGeneralMethods.ts#L150-L155](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L150-L155)).
  - Grafting at VitaLife in New Tokyo installs augs without a reset ([PlayerObjectGeneralMethods.ts#L577-L579](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L577-L579)).
- **Finish:** hack WD at 6000 at ×0.35. Or Black Ops with SF6/7, rank ×0.8.
- **SF10:**
  - Sleeve and Grafting API in every BN ([Sleeve.ts#L51-L58](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L51-L58)).
  - **One sleeve per level**, so 3 at SF10.3. The count is permanent and uses the owned, not active, level.
  - No multipliers ([applySourceFile.ts#L148-L152](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L148-L152)).
- **Plausibly fastest:**
  - A sleeve manager: shock recovery, then crime, faction work or Bladeburner support. Sleeves add parallel rep, exp and karma.
  - Grafting for augs without resets.
  - Then either hacking at ×0.35 or Bladeburner.
  - **Inference:** BN10 is hard (5× aug money, weak hacking), but each SF10 level adds a sleeve that speeds up every later BN. With SF7, take the Bladeburner finish.

### BN11: The Big Crash

- **Source:** [BitNode.tsx#L391-L431](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L391-L431); multipliers [#L889-L923](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L889-L923).
- **Multipliers:**
  - HackingLevel 0.6; WD ×1.5, req **4500**, effective **7500**. HackExpGain 0.5.
  - ServerGrowthRate **0.2**, ServerMaxMoney **0.01**, ServerStartingMoney 0.1, **ServerWeakenRate 2**.
  - **CrimeMoney 3**, **InfiltrationMoney and InfiltrationRep 2.5**.
  - CompanyWorkMoney 0.5, HacknetNodeMoney 0.1, CodingContractMoney 0.25.
  - AugmentationMoneyCost 2. 4S costs ×4.
  - Daedalus needs 30 augs. Cloud servers normal. CloudServerSoftcap 2.
- **Restrictions:** none hard. Hacking money is nearly gone: max money ×0.01, growth ×0.2.
- **Mechanic:** economic crash, with no new system. Crime and infiltration are the strong money sources.
- **Finish:** hack WD at 4500 at ×0.6. Or Black Ops with SF6/7.
- **SF11:**
  - Company favor boosts salary as well as rep, but only with SF11 active, not in BN11 itself ([Work/Formulas.ts#L131-L133](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/Formulas.ts#L131-L133)).
  - +32/48/56% to work money and company rep ([applySourceFile.ts#L153-L163](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L153-L163)).
  - The per-aug price multiplier falls from 1.9 to 1.9 × 0.96/0.94/0.93 ([AugmentationHelpers.ts#L29-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L29-L31)).
- **Plausibly fastest:** crime (×3 money) for early cash, and/or infiltration, which is UI-only and would need UI automation of the minigames, for money and rep. Then hacking exp to 4500 at ×0.6 level and ×0.5 exp.
  - **Inference:** a moderate BN. Its SF11 aug-price cut speeds up every later aug-buying round a little.

### BN12: The Recursion

- **Source:** [BitNode.tsx#L432-L447](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L432-L447); multipliers [#L924-L995](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L924-L995).
- **How it scales:** let *k* = active SF12 level + 1, the BN level ([#L1129-L1131](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1129-L1131)). Then `inc = 1.02^k` and `dec = 1/inc`.
  - **×inc:** WorldDaemonDifficulty, aug money and rep cost, home RAM cost, cloud cost and softcap, donate-favor threshold, 4S costs, Bladeburner skill cost, Stanek power and size.
  - **×dec:** every skill-level multiplier, growth, starting money, weaken rate, every money source, every exp gain, faction work and passive rep, corporation valuation, Bladeburner rank, gang unique augs, cloud limit and cloud max RAM.
  - **×dec²:** ServerMaxMoney.
  - **Fixed:** ServerStartingSecurity 1.5, CorporationSoftcap 0.8, CorporationDivisions 0.5, GangSoftcap 0.8.
  - **Daedalus:** `floor(min(30 + inc, 40))`.
  - **v3.0.1 note:** `DarknetLabyrinthRewardsTheRedPill` is *not* set here, so labs can award TRP in BN12 on v3.0.1. `dev` sets it to 0 (#3025, noted in the current-state doc).

| BN level *k* | inc | WD req | Effective WD level (÷dec) | Daedalus augs | Cloud limit | Cloud max RAM | Aug cost mult |
|---|---|---|---|---|---|---|---|
| 1 (SF12.0 → SF12.1) | 1.0200 | 3060 | 3121 | 31 | 25 | 2^19 | 1.02 |
| 2 (SF12.1 → SF12.2) | 1.0404 | 3121 | 3247 | 31 | 24 | 2^19 | 1.04 |
| 3 (SF12.2 → SF12.3) | 1.0612 | 3184 | 3378 | 31 | 24 | 2^19 | 1.06 |

The figures are my arithmetic on the formulas above, using `getCloudServerLimit` and `getCloudServerMaxRam`. Max RAM drops to 2^19 at every level, because `2^20 × 0.98` rounds down to 2^19. Daedalus reaches 32 augs at *k* ≥ 35 and the 40 cap at *k* ≥ 117.

- **Restrictions:** none hard. Everything is about 2–6% worse at *k* = 1–3, and cloud max RAM is halved.
- **Mechanic:** recursion, a slightly harder BN1.
- **Finish:** hack WD at 3060/3121/3184. Or Black Ops with SF6/7.
- **SF12:** start every BN with NeuroFlux Governor at a level equal to the SF12 level ([Prestige.ts#L265-L270](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L265-L270)). It is the only SF with no level cap ([RedPill.tsx#L25-L36](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RedPill.tsx#L25-L36)).
- **Plausibly fastest:** the BN1 loop, three times.
  - **Inference:** cheap enough to leave late, when SF1/4/5/9 make it a few minutes' work. Optionally set SF12's active level to 0 through BitNode options (the `bitNodeOptions` argument of `destroyW0r1dD43m0n`) to keep *k* = 1. That gives up 1–2 NFG levels and saves about 4% on WD.

### BN13: They're lunatics

- **Source:** [BitNode.tsx#L448-L478](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L448-L478); multipliers [#L996-L1043](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L996-L1043).
- **Multipliers:**
  - HackingLevel **0.25**, combat level 0.7; WD ×3, req **9000**, effective **36000**. **HackExpGain 0.1**; other exp ×0.5.
  - ServerMaxMoney 0.3375, ServerStartingSecurity 3, ScriptHackMoney 0.2.
  - Company, crime, hacknet and contract money all 0.4. FactionWorkRepGain 0.6.
  - 4S costs ×10. CorporationValuation 0.001, GangSoftcap 0.3.
  - BladeburnerRank 0.45, skill cost 2. StaneksGiftPowerMultiplier 2, extra size +1.
  - Aug costs normal. Daedalus needs 30 augs.
- **Restrictions:**
  - Start with only **$200k** ([Prestige.ts#L350-L352](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L350-L352)).
  - Outside BN13, installing any aug other than NFG without having accepted Stanek's Gift bans the Church ([Prestige.ts#L185-L191](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L185-L191)).
- **Mechanic: Stanek's Gift** (Church of the Machine God, Chongqing).
  - It can only be accepted with no non-NFG augs owned or queued ([CotMG/Helper.tsx#L59-L74](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/Helper.tsx#L59-L74)).
  - Grid size is `9 + StaneksGiftExtraSize + SF13 level` ([StaneksGift.ts#L22-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/StaneksGift.ts#L22-L31)).
  - Fragments are charged by script threads through `ns.stanek.*`. Hacking fragments raise hacking level and speed.
- **Finish:** hack WD at 9000 at ×0.25 level and ×0.1 exp, carried by Stanek fragments. Or Black Ops with SF6/7, rank ×0.45.
- **SF13:**
  - Church and Stanek in other BNs ([FactionInfo.tsx#L726-L771](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L726-L771); [PlayerObjectGeneralMethods.ts#L603-L605](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L603-L605)).
  - +1 gift size per level.
- **Plausibly fastest:**
  1. Travel to Chongqing with the $200k.
  2. Accept the gift before buying any aug.
  3. Place a fixed fragment layout, hacking-focused or Bladeburner-focused.
  4. Keep a charge loop running on spare RAM.
  5. Then run the hacking or Bladeburner finish.
  - **Inference:** BN13 has the second-highest effective WD level (36000), so with SF7 it is very likely a Bladeburner finish with Stanek combat or Bladeburner fragments.

### BN14: IPvGO Subnet Takeover

- **Source:** [BitNode.tsx#L479-L518](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L479-L518); multipliers [#L1044-L1087](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1044-L1087).
- **Multipliers:**
  - **GoPower 4**.
  - HackingLevel **0.4**, **HackingSpeedMultiplier 0.3**, so hack, grow and weaken take about 3.3× as long ([Hacking.ts#L59-L78](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacking.ts#L59-L78)). WD ×5, req **15000**, effective **37500**, the highest.
  - ServerMaxMoney 0.7, ScriptHackMoney 0.3.
  - CrimeMoney 0.75, **CrimeSuccessRate 0.4**.
  - **FactionWorkRepGain 0.2, CompanyWorkRepGain 0.2**.
  - Combat level 0.5. AugmentationMoneyCost 1.5.
  - BladeburnerRank 0.6, skill cost 2.
  - Daedalus needs 30 augs. Cloud servers normal.
- **Restrictions:** none hard. Rep from work is ×0.2.
- **Mechanic: IPvGO.**
  - Node power from wins against each opponent becomes a player multiplier: `1 + ln(n+1)·(n+1)^0.3·0.002·power·GoPower·(SF14 ? 2 : 1)` ([Go/effects/effect.ts#L16-L22](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/effect.ts#L16-L22), [#L69-L100](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/effect.ts#L68-L101)).
  - Each opponent boosts something different: Netburners hacknet, Slum Snakes crime success, Black Hand hacking money, Tetrads combat, Daedalus rep, Illuminati hacking speed.
  - The secret opponent w0r1d_d43m0n (power 2) boosts the **hacking level**. It appears in BN14 once TRP is owned ([Go/Constants.ts#L62-L67](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/Constants.ts#L62-L67); [Go/Go.ts#L25-L32](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/Go.ts#L25-L32)).
  - `ns.go.*` needs no Source-File. Win streaks also turn into faction favor.
- **Finish:** hack WD at 15000 at ×0.4 level and ×0.3 speed, carried by Go multipliers. Or Black Ops with SF6/7, rank ×0.6.
- **SF14:**
  - SF14.1: node-power effects ×2 in every BN ([effect.ts#L18](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/effect.ts#L18)).
  - SF14.2: the `go.cheat` API. It is also available inside BN14 while you hold SF14.1, i.e. in BN14.2 ([netscriptGoImplementation.ts#L487-L497](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/netscriptGoImplementation.ts#L487-L497)).
  - SF14.3: +25% cheat success ([#L561-L567](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/netscriptGoImplementation.ts#L561-L567)).
  - The win-streak favor cap rises from 100k rep-equivalent to 200k/300k/400k ([effect.ts#L30-L44](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/effects/effect.ts#L30-L44)).
  - The in-game text also lists "rep to favor for two wins in a row" of 1000/1500/2000 ([BitNode.tsx#L510-L515](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L510-L515)). I did not trace that code.
- **Plausibly fastest:**
  - An IPvGO bot through `ns.go.*` (board analysis, plus `go.cheat` from BN14.2) that farms node power, mainly against w0r1d_d43m0n (hacking level), Illuminati (speed) and Daedalus (rep).
  - Plus the normal loop.
  - **Inference:** the hardest hacking finish in the game. With SF7, Bladeburner backed by the Tetrads combat bonus is plausibly faster. A Go bot is needed either way for the rep bonus, because faction work is ×0.2.

### BN15: The Secrets of the Dark Net

- **Source:** [BitNode.tsx#L519-L564](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L519-L564); multipliers [#L1089-L1122](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L1089-L1122).
- **Multipliers:**
  - HackingLevel 0.6, **HackingSpeedMultiplier 0.6**; WD ×2, req **6000**, effective **10000**. HackExpGain 1.
  - Combat level 0.7, charisma level 1.1.
  - ServerMaxMoney 0.8.
  - **AugmentationMoneyCost 3**.
  - **DaedalusAugsRequirement 20**, but Daedalus has no TRP.
  - BladeburnerRank **0.2**, skill cost 3.
  - Cloud servers normal.
- **Restrictions:**
  - **Daedalus does not sell TRP** ([FactionHelpers.tsx#L204-L207](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionHelpers.tsx#L204-L207)). TRP is the reward of the **5th darknet lab**, after The Broken Wings, The Boots, The Hammer and The Staff ([labyrinth.ts#L403-L430](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L403-L430), [#L432-L470](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L434-L473)).
  - The lab sequence checks *installed* augs (`Player.augmentations`), so each lab aug must be installed before the next lab opens. **Inference:** that means one aug install per lab.
- **Mechanic: darknet.**
  - A shifting network of password-protected servers, reached through `ns.dnet.*`. Access needs BN15, SF15 or DarkscapeNavigator.exe ([darknetAuthUtils.ts#L6-L8](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/utils/darknetAuthUtils.ts#L6-L8)).
  - The labs need BN15 or SF15 ([labyrinth.ts#L475-L497](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L475-L497); [effects.ts#L280](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L280)).
  - Mutation is twice as fast in BN15 ([darknetNetworkUtils.ts#L9-L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/utils/darknetNetworkUtils.ts#L9-L14)).
- **Finish:** get TRP from the 5th lab, then hack WD at 6000 at ×0.6. Or Black Ops with SF6/7, but rank is ×0.2.
- **SF15:**
  - SF15.1: TOR and DarkscapeNavigator.exe on every reset, plus full darknet in every BN (labs, extra server types) ([Prestige.ts#L100-L102](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L100-L102), [#L238-L240](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L242-L244)).
  - SF15.2: charisma boosts job salary ([Work/Formulas.ts#L133](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/Formulas.ts#L133)). The "20% faster authentication" only applies at **SF15.3** in v3.0.1 code ([effects.ts#L80](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L80)).
  - SF15.3: charisma adds to faction work rep ([reputation.ts#L54-L59](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/reputation.ts#L54-L59)), and cache files give +50% money and exp.
- **Plausibly fastest:** a darknet crawler:
  - self-replicating scripts that probe and authenticate (password puzzles, log leaks)
  - harvest caches
  - solve the labyrinths in order, installing after each lab aug until TRP
  - then the normal hacking loop to 6000

  **Inference:** the darknet mechanic is new in 3.0 and the least documented. It is the BitNode most likely to need a dedicated design ticket. The Bladeburner fallback is weak here (×0.2 rank).

---

## Compact table

Effective WD level = WD req ÷ HackingLevelMultiplier (**Inference** index; lower is easier). "Money" lists the multipliers that hurt hacking income. "—" means default (1). BN12 is shown at *k* = 1.

| BN | Name | WD req | Eff. WD | HackExp | Hack money (steal / max $ / growth) | Cloud (limit, max RAM, cost) | Aug $ / rep | Faction rep | Crime $ | Company $ | Hacknet $ | Daedalus | BB rank | Mechanic | Finish |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Source Genesis | 3000 | 3000 | — | — | 25, 2^20, — | — | — | — | — | — | 30 | — | none | hack |
| 2 | Rise of the Underworld | 15000 | 18750 | — | — / 0.08 / 0.8 | — | — | work 0.5, passive **0** | 3 | — | — | 30 (TRP from gang) | — | gangs | hack (or BB w/ SF6/7) |
| 3 | Corporatocracy | 6000 | 7500 | — | 0.2 / 0.04 / 0.2 | —, —, ×2 | **3 / 3** | — | 0.25 | 0.25 | 0.25 | 30 | — | corporation | hack |
| 4 | The Singularity | 9000 | 9000 | 0.4 | 0.2 / 0.1125 / — | — | — | work 0.75 | 0.2 | 0.1 | 0.05 | 30 | — | Singularity (1× RAM) | hack |
| 5 | Artificial Intelligence | 4500 | 4500 | 0.5 | 0.15 / — / — (sec ×2) | — | 2 / — | — | 0.5 | — | 0.2 | 30 | — | Intelligence | hack |
| 6 | Bladeburners | 6000 | 17143 | 0.25 | 0.75 / 0.2 / — | — | — | — | 0.75 | 0.5 | 0.2 | **35** | 1 | Bladeburner | **Black Ops** |
| 7 | Bladeburners 2079 | 6000 | 17143 | 0.25 | 0.5 / 0.2 / — | — | 3 / — | — | 0.75 | 0.5 | 0.2 | **35** | 0.6 | Bladeburner | **Black Ops** |
| 8 | Ghost of Wall Street | 3000 | 3000 | — | **gain 0** / — / — | — | — | donate at 0 favor | **0** | **0** | **0** | 30 | **0 (off)** | stocks | hack |
| 9 | Hacktocracy | 6000 | 12000 | **0.05** | 0.1 / 0.01 / — | **0 servers** | — | — | 0.5 | — | — | 30 | 0.9 | hacknet servers | hack (or BB) |
| 10 | Digital Carbon | 6000 | 17143 | — | 0.5 / — / — | 15, 2^19, ×5 | **5 / 2** | — | 0.5 | 0.5 | 0.5 | 30 | 0.8 | sleeves, grafting | hack (or BB) |
| 11 | The Big Crash | 4500 | 7500 | 0.5 | — / 0.01 / 0.2 (weaken ×2) | — | 2 / — | — | **3** | 0.5 | 0.1 | 30 | — | crash (crime, infiltration) | hack |
| 12 | The Recursion (*k*=1) | 3060 | 3121 | 0.98 | 0.98 / 0.96 / 0.98 | 25, 2^19, ×1.02 | 1.02 / 1.02 | 0.98 | 0.98 | 0.98 | 0.98 | 31 | 0.98 | recursion | hack |
| 13 | They're lunatics | 9000 | 36000 | **0.1** | 0.2 / 0.34 / — (sec ×3) | — | — | work 0.6 | 0.4 | 0.4 | 0.4 | 30 | 0.45 | Stanek's Gift | hack w/ Stanek (or BB) |
| 14 | IPvGO Subnet Takeover | 15000 | **37500** | — | 0.3 / 0.7 / — (speed ×0.3) | — | 1.5 / — | **work 0.2**, company 0.2 | 0.75 | — | 0.25 | 30 | 0.6 | IPvGO | hack w/ Go (or BB) |
| 15 | Secrets of the Dark Net | 6000 | 10000 | — | — / 0.8 / — (speed ×0.6) | — | 3 / — | — | — | — | — | 20 (**no TRP**) | 0.2 | darknet | lab-5 TRP, then hack |

| BN | SF level 1 | SF level 2 | SF level 3 | What the fastest finish must automate (Inference) |
|---|---|---|---|---|
| 1 | 32 GB home; mults +16% | +24% | +28% | hacking engine, cloud servers, programs, factions, augs, Daedalus/TRP, WD (UI automation if no SF4) |
| 2 | gangs elsewhere (karma ≤ −54k); crime/cha +24% | +36% | +42% | crime for karma, gang manager, hack-exp farm (or Bladeburner) |
| 3 | corp elsewhere; cha/work money +8% | +12% | +14% and full corp API free | corporation |
| 4 | Singularity elsewhere at 16× RAM | 4× | 1× | Singularity-driven version of the BN1 loop |
| 5 | Intelligence, Formulas.exe every reset, `getBitNodeMultipliers`; hacking +8% | +12% | +14% | BN1 loop |
| 6 | Bladeburner elsewhere; combat +8% | +12% | +14% | gym, Bladeburner automaton |
| 7 | Bladeburner elsewhere; BB mults +8% | +12% | +14% and Blades' Simulacrum on join | Bladeburner automaton (harder) |
| 8 | WSE and TIX every reset; grow +12% | shorts; +18% | limit/stop orders; +21% | stock trader (4S), stock manipulation, donations |
| 9 | hacknet servers elsewhere; hacknet ±12% | **128 GB home**; ±18% | upgraded hacknet server per BN; ±21% | hacknet-server manager, hash spending, exp grind (or Bladeburner) |
| 10 | Sleeve and Grafting API elsewhere; +1 sleeve | +1 sleeve | +1 sleeve (3 total) | sleeve manager, grafting, then hacking or Bladeburner |
| 11 | favor boosts salary; work $ and company rep +32%; aug price step ×0.96 | +48%; ×0.94 | +56%; ×0.93 | crime, maybe infiltration through UI automation, BN1 loop |
| 12 | NFG = SF12 level at BN start | same | same (no cap) | BN1 loop |
| 13 | Church and Stanek elsewhere; +1 gift size | +1 | +1 | Stanek layout and charging, then hacking or Bladeburner |
| 14 | Go node-power ×2; favor cap 200k | `go.cheat` API; 300k | +25% cheat success; 400k | IPvGO bot, then hacking or Bladeburner |
| 15 | TOR, DarkscapeNavigator, full darknet in every BN | charisma boosts job salary | charisma boosts faction rep; +50% caches; +20% auth speed (v3.0.1) | darknet crawler and lab solver, BN1 loop |

---

## Cross-BN dependencies

These are the Source-Files that make later BitNodes much faster. The facts come from the code cited above. Which ones should come first is an **Inference** for [#9](https://github.com/anaconda186/bitburner/issues/9).

- **SF4 (Singularity), the biggest enabler for a one-command run.**
  - Without it, everything outside BN4 needs UI automation at 25 GB per `document`/`window` reference.
  - At SF4.1 Singularity costs 16× RAM (`destroyW0r1dD43m0n` is 512 GB). SF4.2 cuts that to 4×, and SF4.3 to 1×.
  - BN4 itself always costs 1×, so the first BN4 run can already be fully scripted.
- **SF1 (starting home RAM and multipliers):**
  - 32 GB home instead of 8 GB at every BN entry. This decides whether the post-reset callback script fits.
  - Up to +28% on almost every multiplier.
  - BN1 is the cheapest SF to raise: effective WD level 3000, no restrictions.
- **SF9.2 (128 GB home), the biggest starting-RAM jump** ([Prestige.ts#L246-L253](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L246-L253)).
  - SF9.1 adds hacknet servers in every BN: extra script RAM plus hashes for money, security, max money and study. SF9.3 adds a free strong hacknet server at each BN start.
  - BN9 is hard to hack through (exp ×0.05, no cloud servers), so these levels are costly.
- **SF5 (Formulas.exe and `getBitNodeMultipliers`):**
  - Formulas.exe arrives on every reset, so exact HWGW batch sizing works from the first second.
  - `getBitNodeMultipliers` (4 GB) lets one generic loop read the current BN's numbers instead of a hard-coded table.
  - Intelligence builds up slowly (+300 Int exp per BN destruction) and makes many actions slightly faster.
- **SF6/SF7 (the Bladeburner finish everywhere except BN8):**
  - Owning either opens the Black Ops finish in every other BN. That avoids TRP, Daedalus and hacking levels of 12000–37500.
  - SF7.3 grants Blades' Simulacrum on joining, so Bladeburner runs alongside faction work or hacking.
  - **Inference:** for BN2, 9, 10, 13 and 14, a run with SF7 is likely to be much faster through Bladeburner.
- **SF10 (sleeves):** permanent sleeves, one per level, up to 3. Sleeves work in parallel: crime for karma (the SF2 gang), faction and company work for rep, Bladeburner support, and synthoid infiltration. The API is open in every BN.
- **SF2 (gangs outside BN2):** a gang is a strong source of money and rep wherever `GangSoftcap` is decent. The gang's faction offers nearly every aug. It needs karma −54000, which takes a long crime grind that sleeves can speed up.
- **SF3.3 (corporation):** the full corp API is free outside BN3, which saves $100b of unlocks. **Inference:** a corporation is a late-game money source for BNs with weak hacking, but it costs $150b to start outside BN3.
- **SF8:** WSE and TIX on every reset saves $5.2b of early purchases ($200m + $5b, [StockMarket/data/Constants.ts#L7-L8](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/data/Constants.ts#L7-L8)), and shorts and limit orders make stock income safer. +21% grow helps batching.
- **SF11:** cheaper aug-price steps, ×0.93 at level 3, help every aug-buying round. Better company salary helps reach the money thresholds.
- **SF13:** Stanek's Gift in every BN, a large bonus to hacking or combat. The gift must be accepted before the first non-NFG aug in that BN. **Inference:** that makes it an "early in each BN" step.
- **SF14:** doubled Go bonuses and `go.cheat` make a Go bot a cheap passive multiplier in every BN.
- **SF15:** TOR and DarkscapeNavigator on every reset ($200k + $50m saved). It also opens the darknet labs in every BN, and their final lab awards TRP everywhere except BN8. **Inference:** that gives a second TRP route besides Daedalus, after the six lab augs. I have not measured whether it is faster.
- **SF12:** a few NFG levels, which is minor.

**Inference: a starting order these dependencies suggest** (for [#9](https://github.com/anaconda186/bitburner/issues/9) to test, not a decision): BN1.1, then BN4 ×3 (scriptable from BN4.1), then BN5.1, then BN1.2/1.3. After that, BN9 ×2 for 128 GB home, then BN7 ×3 or BN6 to unlock the Bladeburner finish, then BN10 for sleeves. The high-WD BitNodes (2, 13, 14) are done through Bladeburner, and the cheap ones (8, 12) fit in wherever is convenient.

---

## Not verified from source, or inferred

- **Every "plausibly fastest" note is Inference.** I did not run the game or time anything. The effective-WD-level index ignores aug multipliers, which differ a lot per BN because aug costs differ.
- **Bladeburner rank rates.** I did not model how long 400k rank takes for a given `BladeburnerRank` and stats, so the claim that Bladeburner beats hacking in high-WD BNs is unquantified.
- **IPvGO node-power accumulation.** I read the effect formula but not how node power is earned per game, so the size of the hacking multiplier a Go bot can reach in BN14 is unknown.
- **Darknet lab timing.** I read the lab ordering but not the maze or authentication mechanics, so the time to reach lab 5 in BN15, or lab 7 elsewhere, is unknown.
- **SF14 "rep to favor for two wins"** (1000/1500/2000) is taken from the in-game text. I did not trace it in code.
- **BN12 at *k* = 1:** `3000 × 1.02` may come out as 3060.0000000000005 in floating point and need hacking 3061. Trivial either way.

## Open questions

1. How fast is the Bladeburner finish compared with the hacking finish in each of BN2, 9, 10, 13 and 14, given SF7.3 and sleeves? Answering this needs a rank-rate model or a timed milestone save.
2. Is the darknet-lab TRP route (with SF15) ever faster than Daedalus outside BN15?
3. In BN8, what is the fastest compounding strategy for stocks and donations, and is 4S data worth buying first at $1b+?
4. Should infiltration (UI-only) be automated through UI automation? It is ×2.5 in BN11 and ×1.5 in BN5, and it pays well everywhere.
5. Are corporation scripts worth building, given BN3 must be done three times anyway, or is BN3 faster by brute hacking at an effective WD level of 7500?
6. Should the run use BitNode options, for example SF12's active level set to 0, or disabling mechanics it ignores? They change difficulty but not the SF reward.
