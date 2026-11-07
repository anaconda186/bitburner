# Sleeve mechanics in v3.0.1

Research date: 2026-11-07. Target version: web **v3.0.1**.

Sources: the game's source at [`bitburner-official/bitburner-src`](https://github.com/bitburner-official/bitburner-src), tag **v3.0.1** (commit `3162fd2`), plus the in-repo docs page [sleeves.md](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/sleeves.md). I read the code and did not run the game. Every link is pinned to the tag. Anything marked **Inference** is my reading or arithmetic, not something the code states.

This builds on `black-ops-timing.md` (the "Infiltrate Synthoids" count formula, sleeve count) and `bitnode-survey.md` (BN10 entry cap, Covenant purchases). I don't repeat those; I add what they lack.

---

## Summary

1. **Shock and sync start at 100 and 1.** `shock = 100`, `sync = 1`, `memory = 1` ([Sleeve.ts#L59-L78](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L59-L78)). Shock 100 is the *worst* case: the exp multiplier is `(100 − shock)/100` ([#L173-L179](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L173-L179)), so a fresh sleeve earns zero exp and zero rep until shock falls.
2. **Installing augmentations leaves a sleeve's shock, sync, stats, exp, memory and augs alone.** It only re-assigns the task. **Destroying a BitNode** resets everything except memory and the sleeve count.
3. **Shock and sync are slow.** Shock Recovery clears 100 shock in about **18.5 h** of game time; Synchronize takes sync 1 → 100 in about **27.5 h**. Neither rate depends on sync or memory. Memory only sets the sync a sleeve starts the next BitNode with.
4. **Sync does not scale the sleeve's own gains.** Shock scales the sleeve's exp and rep, but not money and not Bladeburner rank. Sync scales only the exp copied to the player and the karma a sleeve crime removes. "Infiltrate Synthoids" needs the player to have joined Bladeburner and is unaffected by shock and sync.
5. **Every `ns.sleeve` function costs a flat 4 GB.** None needs Singularity (SF4). The API needs BN10 or an active SF10; `purchaseSleeve` and `upgradeMemory` need you to be *in* BN10.
6. **Sleeves can refill the player's Bladeburner stamina** with Hyperbolic Regeneration (+1% of max per 60 s each). A sleeve doing Bladeburner **Training** instead drains the player's stamina and raises the player's max stamina.

---

## 1. What survives each reset

### Starting values

| Field | New sleeve | After a BitNode reset (not BN10) | After a BitNode reset into BN10 |
|---|---|---|---|
| shock | 100 | 100 | `min(25, 100)` = **25** |
| sync | 1 | `max(memory, 1)` | `max(25, memory)` |
| memory | 1 | unchanged | unchanged |
| task | Shock Recovery | Shock Recovery | Shock Recovery |

- Defaults, and the constructor calling `shockRecovery()`: [Sleeve.ts#L59-L83](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L59-L83).
- The reset: [Sleeve.ts#L228-L256](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L228-L256) (`shock = 100` at L251, `sync = Math.max(this.memory, 1)` at L253).
- The BN10 cap runs after it, in [PlayerObjectGeneralMethods.ts#L148-L155](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L148-L155). It tests the *new* BitNode, because `Player.bitNodeN` is set first ([RedPill.tsx#L66](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RedPill.tsx#L66)).
- **Inference:** a sleeve gained mid-run (a Covenant purchase, or a sleeve count that rises) is built by `new Sleeve()` and starts at shock 100 / sync 1, because the BN10 cap only runs at BitNode entry ([SleeveCovenantPurchases.tsx#L58-L73](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L58-L73)).

### (a) Augmentation install

`Player.prestigeAugmentation` ([PlayerObjectGeneralMethods.ts#L118-L120](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L118-L120)) does two things to sleeves:

1. `recalculateNumberOfOwnedSleeves()` (count only).
2. `sleeve.shock <= 0 ? sleeve.synchronize() : sleeve.shockRecovery()`.

Nothing else. So **shock, sync, memory, stats, exp, augmentations, multipliers, city and HP all persist**. The docs agree: sleeves "are **not** reset when installing Augmentations" ([sleeves.md#L25](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/sleeves.md#L25)). The task is replaced, so a script must set each sleeve's task again after every install. **Inference:** a sleeve at shock 0 that was on crime goes to Synchronize, not back to crime.

The player's Bladeburner membership also survives an install: only the running action is cancelled ([Prestige.ts#L155-L158](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L155-L158)), so sleeve Bladeburner tasks stay available.

### (b) BitNode destruction / entering a new BitNode

`Player.prestigeSourceFile` ([PlayerObjectGeneralMethods.ts#L143-L160](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L143-L160)) runs `prestigeAugmentation` first, then `sleeve.prestige()` on each sleeve, then sets `bladeburner = null`.

`Sleeve.prestige()` ([Sleeve.ts#L228-L256](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L228-L256)):

| Thing | Result |
|---|---|
| augmentations, multipliers | **wiped** |
| exp, skill levels | **zeroed** (intelligence re-derived by `overrideIntelligence`) |
| HP | full |
| task | stopped, then Shock Recovery |
| city | Sector-12 |
| shock | 100 (25 if entering BN10) |
| `storedCycles` | 0 |
| sync | `max(memory, 1)` (at least 25 if entering BN10) |
| **memory** | **kept** |
| **sleeve count** | **kept**: `min(3, SF10 level + (in BN10 ? 1 : 0)) + Covenant sleeves` ([SleeveCovenantPurchases.tsx#L58-L73](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L58-L73)) |

The player's Bladeburner object is deleted, so after a BitNode change **the player must join Bladeburner again** before any sleeve Bladeburner task works. The docs say the same about the reset ([sleeves.md#L25](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/sleeves.md#L25), [#L74-L85](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/sleeves.md#L74-L85)).

### (c) Page reload / autosave rollback

- The whole `Sleeve` object is serialised with `Generic_toJSON`, so `shock`, `sync`, `memory`, `storedCycles` and `currentWork` (with its progress counters) are saved ([Sleeve.ts#L579-L598](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L579-L598)). A reload restores the *last saved* values.
- On load the engine computes offline cycles from the saved `Player.lastUpdate` to now and calls `sleeve.process(numCyclesOffline)` ([engine.tsx#L257-L265](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L257-L265), [#L340-L341](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L340-L341)).
- `process` adds the cycles to `storedCycles` and consumes **at most 15 per call** ([Sleeve.ts#L263-L275](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L263-L275)). A cycle is 200 ms ([Constants.ts#L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L19)) and the normal tick passes 1 cycle, so a backlog drains at 15 cycles (3 s of game time) per 200 ms tick, which is **15x real time**, until it is empty.
- **Inference:** the gap between the last autosave and the reload is replayed for sleeves, so shock, sync and exp progress is mostly recovered, only delayed by the 15x drain. What a rollback really loses is discrete events after the save (a purchase, a sleeve aug bought, a task changed). So the sleeve part of "reload loss" is small. Not tested in the game.
- **Inference (edge case):** `process` returns before draining when `currentWork` is null ([Sleeve.ts#L267](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L267)), but `storedCycles` still grows. An idle sleeve banks time that is paid out at 15x once it gets a task. Idle sleeves get **no** passive shock decay.

---

## 2. Shock, sync, and what they scale

### Rates

A cycle is 0.2 s, so 5 per second.

| Quantity | Per cycle | Per second | Time (intelligence bonus 1) |
|---|---|---|---|
| Passive shock loss, *any* task (not idle) | `0.0001 · bS` | 0.0005 | 100 → 0: 55.6 h |
| Shock Recovery extra | `0.0002 · bS` | 0.0010 | |
| **Shock Recovery total** | `0.0003 · bS` | **0.0015** | **100 → 0: 18.5 h; 25 → 0: 4.6 h** |
| **Synchronize** (the only way to raise sync) | `0.0002 · bP` | **0.0010** | **1 → 100: 27.5 h; 25 → 100: 20.8 h** |

`bS = 1 + 0.75·intS^0.8/600` (the sleeve's intelligence) and `bP = 1 + 0.5·intP^0.8/600` (the **player's** intelligence) ([intelligence.ts#L1-L3](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/intelligence.ts#L1-L3)).

- Passive loss: [Sleeve.ts#L268-L272](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L268-L272). Recovery: [SleeveRecoveryWork.ts#L12-L18](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveRecoveryWork.ts#L12-L18). Synchronize: [SleeveSynchroWork.ts#L13-L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveSynchroWork.ts#L13-L19). Both tasks stop themselves (shock 0, sync 100).
- **Neither rate depends on sync or memory.** Memory matters only through the start value: time to full sync is `(100 − sync₀) / 0.001` seconds. A sleeve with memory 100 starts at sync 100 and never needs Synchronize.
- **Inference:** sleeve intelligence is 0 without SF5/BN5 ([Person.ts#L149-L159](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Person.ts#L149-L159)), so `bS ≈ 1`. The Synchronize rate uses the player's intelligence.
- A sleeve whose HP reaches 0 (a failed contract) gets `shock + 0.5` ([Sleeve.ts#L559-L573](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L559-L573)).
- **Inference:** a run that starts at shock 100 gets no exp or rep from sleeves for hours unless they sit on Recovery. An aug install does not reset shock, so recovery carries over from run to run.

### What shock and sync scale

`applySleeveGains` ([Work/Work.ts#L17-L25](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/Work.ts#L17-L25)) and the per-task code:

| Gain | Sleeve itself | Player | Other sleeves |
|---|---|---|---|
| Exp | `× shockBonus` | `× shockBonus × sync/100` | `× shockBonus × sync/100 ×` their own `shockBonus` |
| Money (crime, company, Bladeburner contract) | **not** scaled by shock (`scaleWorkStats(..., false)`) | **full amount to the player**, not scaled by sync | – |
| Money (gym, university) | – | **negative**: the course cost is charged to the player each cycle | – |
| Faction rep | `× shockBonus` ([SleeveFactionWork.ts#L35-L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveFactionWork.ts#L35-L37)) | to the player's faction rep, not scaled by sync | – |
| Company rep | `× shockBonus` | to the player's company rep ([SleeveCompanyWork.ts#L40-L48](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveCompanyWork.ts#L40-L48)) | – |
| Crime karma | – | `karma −= crime.karma × sync/100`, on success only ([SleeveCrimeWork.ts#L44-L48](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveCrimeWork.ts#L44-L48)) | – |
| Bladeburner **rank** | **not scaled** by shock or sync | `changeRank` acts directly on the player's Bladeburner ([Bladeburner.ts#L1267-L1285](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1267-L1285)) | – |

- The code comment says the player and other sleeves get the *sleeve's* already-multiplied exp, to "avoid double dipping xp mults" ([Work.ts#L21-L24](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/Work.ts#L21-L24)).
- Money goes in as `Player.gainMoney(shockedStats.money * mult, "sleeves")` ([Work.ts#L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/Work.ts#L19)), and every task passes `scaleMoney = false`. **Inference:** a shock-100 sleeve on crime or company work still earns full money for the player. Only exp, rep and the exp copied to the player are zero. The docs speak only of experience ([sleeves.md#L45-L60](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/sleeves.md#L45-L60)).
- Gym and university `money` is negative in the class table ([ClassWork.tsx#L31-L71](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/ClassWork.tsx#L31-L71)) and `calculateClassEarnings` sets it from that cost ([Formulas.ts#L108-L123](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/Formulas.ts#L108-L123)). **Inference:** each studying sleeve bills the player.
- Crime: a failure pays no money, 25% exp and no karma ([SleeveCrimeWork.ts#L44-L49](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveCrimeWork.ts#L44-L49)). Success uses the *sleeve's* skills and multipliers and the BitNode `CrimeSuccessRate` ([Crime.ts#L120-L136](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Crime/Crime.ts#L120-L136)).
- With the BitNode option `disableSleeveExpAndAugmentation`, all sleeve exp is zeroed ([Work/Formulas.ts#L24-L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/Formulas.ts#L24-L37)).

### Sleeve Bladeburner work

- **Contracts:** "Take on contracts" runs `completeAction(sleeve, contract, false)` and then `applySleeveGains(sleeve, scaleWorkStats(ret, shockBonus, false))` ([SleeveBladeburnerWork.ts#L41-L61](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveBladeburnerWork.ts#L41-L61)).
  - Action **time** and **success chance** come from the *sleeve's* skills ([Action.ts#L105-L122](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Actions/Action.ts#L105-L122)); shock and sync do not change them.
  - The **count** is the player's shared count; each success or failure uses one. Rank, contract money and chaos go to the player's Bladeburner ([Bladeburner.ts#L930-L976](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L930-L976)).
  - A successful killing contract done by a sleeve still takes `Player.karma −= 1`, not scaled by sync ([#L971](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L971)).
  - The Bladeburner faction rep from the rank gain uses the **sleeve's** `faction_rep` multiplier ([Formulas.ts#L46-L49](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Formulas.ts#L46-L49)).
  - Sleeves cannot do operations or Black Ops: the work is typed for General and Contract actions only ([SleeveBladeburnerWork.ts#L15-L17](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveBladeburnerWork.ts#L15-L17)). Two sleeves cannot take the same contract ([NetscriptFunctions/Sleeve.ts#L281-L294](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L281-L294)).
- **Infiltrate Synthoids requires the player to have joined Bladeburner.**
  - `setToBladeburnerAction` returns false with a log line if `Player.bladeburner` is null ([NetscriptFunctions/Sleeve.ts#L276-L279](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L276-L279)). `Sleeve.bladeburner()` repeats the check ([Sleeve.ts#L488-L489](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L488-L489)), and the work stops itself if Bladeburner is gone ([SleeveInfiltrateWork.ts#L20-L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveInfiltrateWork.ts#L20-L28)).
  - Joining needs SF6 or SF7, Bladeburner not disabled, `BladeburnerRank > 0` in the BitNode, and the combat-stat minimum ([NetscriptFunctions/Bladeburner.ts#L332-L350](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Bladeburner.ts#L332-L350); see `black-ops-timing.md`).
  - **Shock and sync do not affect the effect size.** Every 60 s of processed cycles it adds `n^−0.5 / 2` to every contract and operation count ([SleeveInfiltrateWork.ts#L7](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveInfiltrateWork.ts#L7), [Bladeburner.ts#L1253-L1265](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1253-L1265)) and reads no sleeve stat. **Inference:** a shock-100, sync-1 sleeve is as good at it as a perfect one, so it is the task to give sleeves during the first hours of a BitNode.
- "Support main sleeve" raises `teamSize` by 1 and does nothing else ([SleeveSupportWork.ts#L12-L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveSupportWork.ts#L12-L15)). Supporting sleeves can be shocked by team casualties ([Bladeburner.ts#L788-L791](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L788-L791)).

---

## 3. The `ns.sleeve` API

Source: [NetscriptFunctions/Sleeve.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts).

**RAM:** every function maps to `RamCostConstants.SleeveBase` = **4 GB** ([RamCostGenerator.ts#L51](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L51), [#L397-L418](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L397-L418)); the typings repeat "RAM cost: 4 GB" ([NetscriptDefinitions.d.ts#L5943](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ScriptEditor/NetscriptDefinitions.d.ts#L5943)). There is no Singularity (SF4) requirement. **Inference:** a script that calls N distinct sleeve functions pays 4 GB × N.

**Access:** `canAccessBitNodeFeature(10)`, that is, in BN10 or an **active** SF10 level above 0 ([NetscriptFunctions/Sleeve.ts#L51-L58](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L51-L58), [BitNodeUtils.ts#L17-L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeUtils.ts#L17-L19)). `purchaseSleeve` and `upgradeMemory` additionally require BN10 ([#L24-L28](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L24-L28), [#L304-L322](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L304-L322)).

| Function | RAM | Conditions |
|---|---|---|
| `getNumSleeves`, `getSleeve`, `getTask`, `setToIdle` | 4 GB | API access ([L69-L213](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L69-L213)) |
| `setToShockRecovery`, `setToSynchronize` | 4 GB | always succeed ([L79-L90](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L79-L90)) |
| `setToCommitCrime(i, crime)` | 4 GB | none ([L91-L99](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L91-L99)) |
| `setToFactionWork(i, faction, type)` | 4 GB | player is a member; no other sleeve on that faction; not the player's gang faction; faction offers that work type ([L141-L174](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L141-L174), [Sleeve.ts#L418-L442](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L418-L442)) |
| `setToCompanyWork(i, company)` | 4 GB | player already holds a job there; no other sleeve on it ([L119-L140](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L119-L140), [Sleeve.ts#L410-L416](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L410-L416)) |
| `setToUniversityCourse(i, university, course)` | 4 GB | sleeve is in that university's city ([L100-L107](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L100-L107), [Sleeve.ts#L288-L342](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L288-L342)) |
| `setToGymWorkout(i, gym, stat)` | 4 GB | sleeve is in that gym's city ([L175-L183](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L175-L183), [Sleeve.ts#L445-L485](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L445-L485)) |
| `setToBladeburnerAction(i, action, contract?)` | 4 GB | Bladeburner joined; contract must be available ([L271-L303](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L271-L303)) |
| `travel(i, city)` | 4 GB | stops the task; cost is charged to the player ([L108-L118](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L108-L118), [Sleeve.ts#L542-L552](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L542-L552)) |
| `getSleeveAugmentations`, `getSleevePurchasableAugs`, `purchaseSleeveAug`, `getSleeveAugmentationPrice`, `getSleeveAugmentationRepReq` | 4 GB | API access; see section 4 |
| `purchaseSleeve`, `upgradeMemory` | 4 GB | in BN10 and Covenant member |
| `getSleeveCost`, `getMemoryUpgradeCost` | 4 GB | API access |

**There is no `setToBladeAction`.** The Bladeburner entry point is `setToBladeburnerAction(sleeveNumber, action, contract?)`. Valid `action` strings ([Sleeve.ts#L488-L540](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L488-L540); names in [Bladeburner/Enums.ts#L10-L22](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Enums.ts#L10-L22)):

- General: `"Training"`, `"Field Analysis"`, `"Recruitment"`, `"Diplomacy"`, `"Hyperbolic Regeneration Chamber"`. `"Incite Violence"` is **not** accepted.
- Special: `"Infiltrate Synthoids"`, `"Support main sleeve"`.
- `"Take on contracts"` with a contract name (`Tracking`, `Bounty Hunter`, `Retirement`).

**Where the money, karma and rep go.** All to the **player**. The only penalties are in the section 2 table:

- crime: money unpenalised (0 on failure); karma × sync; exp × shock; failure gives 25% exp; kills counted in full.
- company: salary unpenalised; rep × shock, into the player's company rep.
- faction: rep × shock, into the player's faction rep. A sleeve cannot work for the player's own gang faction ([NetscriptFunctions/Sleeve.ts#L166-L171](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L166-L171); the work also stops itself, [SleeveFactionWork.ts#L46](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Work/SleeveFactionWork.ts#L46)).
- The rates come from the **sleeve's** stats and multipliers, which restart at zero exp each BitNode.

---

## 4. Memory, sleeve count and sleeve augmentations

### Memory

- `memory` is the sync a sleeve gets back after a BitNode reset (`sync = max(memory, 1)`). It has no other effect. Buying memory does not change current sync ([sleeves.md#L74-L85](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/sleeves.md#L74-L85)).
- It can only be raised by `ns.sleeve.upgradeMemory(sleeve, amount)` or the Covenant UI, **in BN10 and as a Covenant member** ([SleeveCovenantPurchases.tsx#L86-L124](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L86-L124)). No augmentation changes it. Max 100. It persists across BitNodes ([Sleeve.ts#L58-L59](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L58-L59)).
- **Cost** from memory `m` to `m+n`: `1e12 × Σ 1.02^(k−1)` for `k = m … m+n−1` ([Sleeve.ts#L198-L213](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L198-L213)), which is `1e12 × (1.02^(m+n−1) − 1.02^(m−1)) / 0.02`.
  - **Inference (arithmetic):** 1 → 2 costs $1.0t; 1 → 25 about **$30t**; 1 → 50 about **$82t**; 1 → 100 about **$305t**. Costs are per sleeve.
  - **Inference:** the use is skipping the 20-27 h of Synchronize in later BitNodes. Below 25 it helps little (BN10 entry raises sync to 25 anyway).

### Sleeve count

`min(3, SF10 level + (in BN10 ? 1 : 0)) + Covenant sleeves`. Covenant sleeves cost `10t × 10^k`, up to 5, BN10 only ([SleeveCovenantPurchases.tsx#L13-L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/SleeveCovenantPurchases.tsx#L13-L56)). Already in `bitnode-survey.md`.

### Sleeve augmentations

- Price is `aug.baseCost` only. **No** BitNode augmentation-money multiplier and **no** purchase-count multiplier applies ([Sleeve.ts#L366-L400](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L366-L400); `getSleeveAugmentationPrice` returns `aug.baseCost`, [NetscriptFunctions/Sleeve.ts#L259-L264](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L259-L264)). The money comes from the player.
- Rules in `canPurchaseAugmentation`:
  1. the BitNode option `disableSleeveExpAndAugmentation` is off;
  2. **sleeve shock is 0**;
  3. the player can afford `baseCost`;
  4. the sleeve does not already own it;
  5. it is in `findPurchasableAugs()`: offered by a faction the player is in (a gang faction offers all) and `faction.playerReputation > getAugCost(aug).repCost`. The rep cost *does* include the BitNode rep multiplier ([AugmentationHelpers.ts#L127-L158](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L127-L158)). It skips the Bladeburners and Netburners factions, `isSpecial` augs, and any aug with none of a whitelist of multipliers (hacking, combat stats, charisma, their exp, company rep, faction rep, crime money, crime success, work money) ([Sleeve.ts#L90-L171](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L90-L171)).
  6. Zoe's Omnicerebrum Enhancer is added if the player is in the Church of the Machine God.
- Buying installs at once and **zeroes the sleeve's exp** ([Sleeve.ts#L215-L225](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L215-L225)). Shock and sync are untouched.
- Sleeve augs **survive an aug install** and are **wiped by a BitNode reset**; they never carry across BitNodes. The docs say the cost is independent of the player's own aug purchases ([sleeves.md#L62-L72](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/sleeves.md#L62-L72)).
- **Inference:** shock must be exactly 0 and takes 18.5 h from 100, so a sleeve aug buy is realistic only if shock was already cleared (installs keep it) or late in the BitNode.

---

## 5. Sleeves and the player's Bladeburner stamina and chaos

All of this is in `Bladeburner.completeAction(person, action, isPlayer)` ([Bladeburner.ts#L891-L1235](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L891-L1235)). `this.stamina` is the **player's** stamina; sleeves have none.

| Sleeve task | Effect on player stamina | Effect on chaos |
|---|---|---|
| Crime, faction, company, gym, university | none | none |
| Take on contracts | **none**: the loss is guarded by `isPlayer` ([#L921-L926](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L921-L926)) | the player's current city: Bounty Hunter +0.02, Retirement +0.04 on success ([`completeContract`, #L868-L889](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L868-L889)) |
| **Hyperbolic Regeneration Chamber** | **+1% of max stamina per completion** (60 s), capped at max ([#L1199-L1220](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1199-L1220); `HrcStaminaGain: 1`, [data/Constants.ts#L52](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L52)); also +2 HP to the sleeve | none |
| **Training** | **drains** `0.5 × 0.285` = 0.1425 stamina per 30 s (no `isPlayer` guard) and **adds `0.04 × StaminaSkillMult` to the player's `staminaBonus`**, i.e. raises max stamina ([#L1094-L1121](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1094-L1121)); exp uses the *sleeve's* multipliers, shocked | none |
| Diplomacy | none | lowers the current city's chaos; size from the *sleeve's* charisma ([#L1187-L1198](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1187-L1198)) |
| Field Analysis | none | none (adds rank, unscaled) |
| Infiltrate Synthoids | none | none |
| Incite Violence | not available to sleeves | – |

- **Yes, sleeves can run Hyperbolic Regeneration to refill the player's stamina.** The code adds to `this.stamina` using `this.maxStamina`. The `ns.sleeve` layer blocks duplicates only for contracts ([NetscriptFunctions/Sleeve.ts#L281-L303](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Sleeve.ts#L281-L303)), so **Inference:** each sleeve can run it at once, +1% of max per minute each.
- Natural regen is `(0.0085 + max/70000) × agility^0.17 × mults` per second ([Bladeburner.ts#L1319-L1327](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1319-L1327), [Constants.ts#L4-L6](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/data/Constants.ts#L4-L6)). **Inference (arithmetic):** with max stamina 100 and agility 316 that is 1.6% of max per minute; with max 1000 and agility 1000 it is 0.44%. One HRC sleeve adds about +63% and +226% of natural regen in those two cases.
- **Possible bug, Inference:** the Training branch subtracts stamina with no guard and no clamp at 0 for a sleeve. A sleeve on Training lowers the *player's* stamina by 0.285 per minute while adding `0.04 × mult` max stamina per 30 s. Stamina feeds the success-chance penalty (`calculateStaminaPenalty`, [#L167-L169](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L167-L169)). Not tested in the game; check before using it.
- Sleeves on ordinary crime, gym or university work never touch Bladeburner stamina or chaos.

---

## Open items

- Whether the Training stamina drain from a sleeve is intended. The `isPlayer` argument guards only the Contract/Operation branch, and the comment on `startAction` says sleeves "use their own functions" ([Bladeburner.ts#L171-L172](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L171-L172)). A test in a real save would settle it.
- The size of the sleeve correction to reload loss (section 1c) is modelled, not measured.
