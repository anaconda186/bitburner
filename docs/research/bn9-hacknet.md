# BN9 (Hacktocracy): Hacknet Servers and hashes

Research date: 2026-11-07. For ticket #32 (plan for BN9). Source: `bitburner-official/bitburner-src` at tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1) (commit `3162fd2`), read from a local shallow clone. I did not run the game.

Link convention: `V301/path#Lx` = `https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/path#Lx`. All paths are under `src/`.

Labels: **[S]** = read directly from the source. **[I]** = inference or my own arithmetic from sourced formulas (a small Node script reproduced the numbers; the formulas are transcribed below so you can re-check). Where a number is hand-computed I say so.

---

## Summary

1. **Money from hashes is huge and bypasses the usual BN9 penalties.** `Sell for Money` is 4 hashes for $1m, i.e. **$250k per hash** [S]. Hacknet income is multiplied only by `HacknetNodeMoney`, which BN9 leaves at 1 [S]. A BN9 starter server (level 100, 10 cores, 1 GB RAM) makes 0.28 hash/s, about **$70k/s** if every hash is sold [I]. Compare BN9's `ScriptHackMoney` of 0.1 and `ServerMaxMoney` of 0.01 [S].
2. **No script is strictly needed to turn hashes into money once capacity is full.** Hashes produced above hash capacity are auto-sold at the same $250k/hash rate [S]. A `spendHashes` loop is only needed to avoid sitting below capacity, and for non-money upgrades [I].
3. **BN9 has `CloudServerLimit: 0`**, so you cannot buy cloud servers at all [S]. Hacknet server RAM (and home RAM) is the only extra RAM for scripts.
4. **Hacknet server RAM can run scripts**, but every GB used removes the same fraction of that server's hashes: `hashRate x (1 - ramUsed/maxRam)` [S].
5. **Installing augmentations deletes every hacknet server and all hash upgrades** [S]. The free starter server is granted only on BitNode entry, not on augmentation install [S].
6. **Level is the expensive upgrade axis** (cost x1.1 per level, so 1 to 100 is $6.9e10 at multiplier 1). RAM and cores are far cheaper per unit of hash gain, so a build order that buys RAM and cores first is cheaper (see section 6) [I].

---

## 1. Purchase and upgrade costs

### Constants [S]

[V301/Hacknet/data/Constants.ts#L32-L52](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/Constants.ts#L32-L52):

| Constant | Value |
|---|---|
| `HashesPerLevel` | 0.001 |
| `BaseCost` (server) | 50,000 |
| `RamBaseCost` | 200,000 |
| `CoreBaseCost` | 1,000,000 |
| `CacheBaseCost` | 10,000,000 |
| `PurchaseMult` | 3.2 |
| `UpgradeLevelMult` | 1.1 |
| `UpgradeRamMult` | 1.4 |
| `UpgradeCoreMult` | 1.55 |
| `UpgradeCacheMult` | 1.85 |
| `MaxServers` | 20 |
| `MaxLevel` | 300 |
| `MaxRam` | 8192 GB |
| `MaxCores` | 128 |
| `MaxCache` | 15 |

### Formulas [S]

All in [V301/Hacknet/formulas/HacknetServers.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts). `costMult` is `Player.mults.hacknet_node_*_cost` (passed in by [HacknetHelpers.tsx#L93-L95, #L238-L365](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L93-L95)).

- **Server n-th purchase** ([#L112-L118](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts#L112-L118)): `50e3 * 3.2^(n-1) * hacknet_node_purchase_cost`, where `n = servers owned + 1`. Returns `Infinity` when `n - 1 >= 20`. The starter server counts as owned.
- **Level, from level L, one step** ([#L19-L38](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts#L19-L38)): `10 * 50e3 * 1.1^L * hacknet_node_level_cost` = `500,000 * 1.1^L`. Multi-level purchases sum the series.
- **RAM, from R GB, one doubling** ([#L40-L65](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts#L40-L65)): `R * 200e3 * 1.4^log2(R) * hacknet_node_ram_cost`. Each purchase doubles RAM.
- **Core, from C cores, one step** ([#L67-L88](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts#L67-L88)): `1e6 * 1.55^(C-1) * hacknet_node_core_cost`.
- **Cache, from level K, one step** ([#L90-L110](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts#L90-L110)): `10e6 * 1.85^(K-1)`. **No cost multiplier is applied to cache**, so SF9 does not discount it [S].
- **Hash capacity per server** ([HacknetServer.ts#L121-L123](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetServer.ts#L121-L123)): `32 * 2^cache`. Cache 1 = 64, cache 5 = 1,024, cache 10 = 32,768, cache 15 = 1,048,576 [I for the table values]. Total capacity is the sum over all servers ([HacknetHelpers.tsx#L434-L464](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L434-L464)) [S].
- Purchases fail (return -1/false) at 20 servers ([HacknetHelpers.tsx#L56-L58](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L56-L58)). A server starts at level 1, 1 GB RAM, 1 core, cache 1 ([HacknetServer.ts#L32-L63](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetServer.ts#L32-L63)) [S].

### Worked numbers at cost multiplier 1 [I, my arithmetic]

| Item | Cost |
|---|---|
| Server n=2 | $160k |
| n=3 | $512k |
| n=4 | $1.64m |
| n=5 | $5.24m |
| n=6 | $16.8m |
| n=8 | $172m |
| n=10 | $1.76b |
| n=15 | $590b |
| n=20 | $198t |
| Level 1 to 2 | $550k |
| Level 1 to 50 | $5.8e8 |
| Level 1 to 100 | $6.9e10 |
| Level 100 to 101 | $6.9e9 |
| Level 1 to 300 | $1.3e19 |
| RAM 1 to 2 GB | $200k |
| RAM 1 to 64 GB | $53m |
| RAM 1 to 8192 GB | $7.2e10 |
| Core 1 to 2 | $1m |
| Core 1 to 10 | $92m |
| Core 1 to 16 | $1.3b |
| Core 1 to 128 | $2.7e30 |
| Cache 1 to 2 | $10m |
| Cache 1 to 5 | $126m |
| Cache 1 to 15 | $6.5e10 |

Practical ceilings [I]: the server count cost (x3.2 each) makes servers 9 to 20 effectively unaffordable in a normal BN9 run, and core 128 is never reachable (1.55^127 is about 1e24 times the base). Level 300 is also out of reach (1.1^300 is about 2.5e12).

### Multipliers [S]

- **BN9 itself changes no hacknet cost or production multiplier.** The BN9 block ([V301/BitNode/BitNode.tsx#L801-L841](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L801-L841)) has no `HacknetNodeMoney` key, so it stays at its default of 1 ([BitNodeMultipliers.ts#L108-L112](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L108-L112)). BN9's other values: `HackingLevelMultiplier` 0.5, other skill multipliers 0.45, `ServerMaxMoney` 0.01, `ServerStartingMoney` 0.1, `ServerStartingSecurity` 2.5, `HomeComputerRamCost` 5, `CloudServerLimit` 0, `CrimeMoney` 0.5, `ScriptHackMoney` 0.1, `HackExpGain` 0.05, `BladeburnerRank` 0.9, `BladeburnerSkillCost` 1.2, `WorldDaemonDifficulty` 2.
- **SF9 effect** ([V301/SourceFile/applySourceFile.ts#L133-L147](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L133-L147)): `mult = sum over levels of 12/2^i` percent, giving 12% / 18% / 21% at SF9.1 / 9.2 / 9.3 (description at [BitNode.tsx#L339-L358](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L339-L358)). It multiplies `hacknet_node_money` by `1 + mult` and `hacknet_node_purchase_cost`, `_ram_cost`, `_core_cost`, `_level_cost` by `1 - mult`. So SF9.3 = production x1.21 and costs x0.79 (cache excepted).
- Augmentations also feed these `Player.mults.hacknet_node_*` values (the Hacknet augmentations in `Augmentations.ts`, e.g. a x2 money / x0.5 cost entry at [Augmentation/Augmentations.ts#L116-L118](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L116-L118)). I did not catalogue them; **not researched further**.

---

## 2. Hash production

### Formula [S]

[V301/Hacknet/formulas/HacknetServers.ts#L4-L17](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/formulas/HacknetServers.ts#L4-L17):

```
hashRate = 0.001 * level
         * 1.07^log2(maxRam)
         * (1 + (cores - 1) / 5)
         * (1 - ramUsed / maxRam)
         * Player.mults.hacknet_node_money
         * currentNodeMults.HacknetNodeMoney
```

The rate is recomputed every game tick in `processAllHacknetServerEarnings` ([HacknetHelpers.tsx#L401-L432](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L401-L432)) and on every RAM-used change ([HacknetServer.ts#L116-L119](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetServer.ts#L116-L119)). One tick = 200 ms (`MilliPerCycle`) [S, [Constants.ts#L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L19)]. Hashes are stored with `storeHashes`, capped at total capacity ([HashManager.ts#L107-L118](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HashManager.ts#L107-L118)).

Note the `ramUsed` term: **cache level does not affect rate, only capacity**; RAM affects rate only slowly (x1.07 per doubling) while its price is x2.8 per doubling [I].

### Per-server hash/s and money/s at mult 1, all hashes sold at $250k [I, my arithmetic]

| level / RAM / cores | hash/s | $/s if sold |
|---|---|---|
| 1 / 1 / 1 (fresh purchase) | 0.001 | $250 |
| 100 / 1 / 10 (BN9 starter) | 0.280 | $70,000 |
| 100 / 64 / 10 | 0.420 | $105k |
| 200 / 256 / 16 | 1.37 | $344k |
| 300 / 1024 / 32 | 4.25 | $1.06m |
| 300 / 8192 / 128 (theoretical max) | 19.1 | $4.77m |

Multiply by 1.21 for SF9.3 production.

---

## 3. Hash upgrades

### Cost model [S]

[V301/Hacknet/HashUpgrade.ts#L232-L242](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HashUpgrade.ts#L232-L242): if the upgrade defines a flat `cost`, it is `cost * count`. Otherwise buying `count` levels starting from current level `L` costs `costPerLevel * count * (count + 2L + 1) / 2`, i.e. the next level costs `costPerLevel * (L + 1)`. So non-flat upgrades get **linearly more expensive each purchase**. Purchase flow, failure ("Not enough hashes") and refund-on-bad-target are in [HashManager.ts#L127-L147](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HashManager.ts#L127-L147) and [HacknetHelpers.tsx#L578-L599](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L578-L599).

### The list [S]

From [V301/Hacknet/data/HashUpgradesMetadata.tsx#L8-L122](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/data/HashUpgradesMetadata.tsx#L8-L122), with effects applied in [HacknetHelpers.tsx#L466-L576](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L466-L576). Names are from [Enums.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/Enums.ts).

| Name | Base cost (hashes) | Cost growth | Effect |
|---|---|---|---|
| Sell for Money | **4 flat** | none | +$1,000,000 per purchase |
| Sell for Corporation Funds | 100 | +100 per level | +$1e9 corp funds |
| Reduce Minimum Security | 50 | +50 per level | target (foreign) server min security x0.98, floor 1; persists until augmentation install |
| Increase Maximum Money | 50 | +50 per level | target (foreign) server max money x1.02, softcapped above $10t; persists until install |
| Improve Studying | 50 | +50 per level | +20% study exp (additive: `1 + 0.2 * level`) |
| Improve Gym Training | 50 | +50 per level | +20% gym exp (additive: `1 + 0.2 * level`) |
| Exchange for Corporation Research | 200 | +200 per level | +1000 research in every division |
| Exchange for Bladeburner Rank | 250 | +250 per level | +100 Bladeburner rank (rank goes through `changeRank`, which also grants SP and faction rep) |
| Exchange for Bladeburner SP | 250 | +250 per level | +10 Bladeburner skill points |
| Generate Coding Contract | 25 | +25 per level | one random contract |
| Company Favor | 200 | +200 per level | +5 favor with the target company; persists until entering a new BitNode |

Details behind the user-requested rows:

- **Sell for Money**: flat cost, so $250k per hash for ever, no escalation [S].
- **Improve Gym Training**: the multiplier is read by `calculateClassEarnings` in [Work/Formulas.ts#L108-L119](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/Formulas.ts#L108-L119) and scales the gym class's exp gain only (the same hash-mult line is shared with Improve Studying for university classes). Level n multiplies by `1 + 0.2n` [S]. The upgrade resets on augmentation install ([HashManager.ts#L80-L88](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HashManager.ts#L80-L88)) [S].
- **Reduce Minimum Security**: `minDifficulty *= 0.98` per purchased level, floor 1 ([Server.ts#L111-L120](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/Server.ts#L111-L120)). Target must be a normal non-owned server [S].
- **Increase Maximum Money**: `moneyMax *= 1.02` each; above $10t the factor is reduced by `ln(moneyMax - 10t)` and `ln(8)` ([Server.ts#L126-L134](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/Server.ts#L126-L134)) [S]. In BN9 `ServerMaxMoney` is 0.01 so servers are far below the softcap [I].
- **Bladeburner Rank / SP**: Rank exchange adds 100 rank per level directly ([HacknetHelpers.tsx#L539-L546](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L539-L546)); BN9's `BladeburnerRank` 0.9 is not applied in this path (`changeRank` has no BN multiplier, [Bladeburner.ts#L1267-L1292](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1267-L1292)) [S, but I only read `changeRank`, not the callers]. SP exchange adds 10 skill points ([#L547-L555](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L547-L555)). Both fail with "You have not joined Bladeburner" if there is no Bladeburner [S]. Cost per level escalates: the n-th Rank purchase costs 250n hashes, i.e. 100 rank per 250n hashes [I]. Because `changeRank` grants SP from `maxRank` crossings, rank exchange can also yield SP [S, [Bladeburner.ts#L1284-L1292](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1284-L1292)], but I did not compute the rank-per-SP constant.

### Is spending limited by hash capacity? [S + I]

- Hashes can never exceed total capacity ([HashManager.ts#L112-L118](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HashManager.ts#L112-L118)) [S]. `upgrade` requires `hashes >= cost` for the **whole purchase** ([#L137-L141](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HashManager.ts#L137-L141)) [S].
- Therefore any single purchase whose total cost exceeds capacity is impossible [I]. At cache 1 (64 per server), an escalating upgrade (e.g. Reduce Minimum Security level 2 costs 100) can need more than one server's capacity; the starter server has 1,024 [S/I]. Batched calls such as `spendHashes(name, target, 40)` of Sell for Money (160 hashes) also need capacity at least 160 [I].
- **Overflow is not lost; it is sold for money.** In `processAllHacknetServerEarnings`, hashes beyond capacity are converted at `upgrade.value / upgrade.cost` = $1e6/4 = $250k each and paid as hacknet income ([HacknetHelpers.tsx#L419-L429](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L419-L429)) [S]. So a full store loses nothing money-wise [I].

---

## 4. Hacknet server RAM, scripts, and the ns.hacknet API

### Can scripts run on hacknet server RAM? [S]

- Yes. A hacknet server is a normal `BaseServer` with `maxRam` and `adminRights: true` ([PlayerObjectServerMethods.ts#L46-L63](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectServerMethods.ts#L46-L63)), is added to all servers and linked to home's network (names `hacknet-server-0`, `hacknet-server-1`, ...). `createAndAddWorkerScript` checks only `maxRam - ramUsed` ([NetscriptWorker.ts#L110-L123](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L110-L123)).
- Limits [S]: `ns.hack/grow/weaken/...` style calls that go through `getNormalServer` reject a hacknet server as target ([NetscriptHelpers.tsx#L521-L535](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L521-L535)); terminal hack/grow do likewise (e.g. [Terminal.ts#L203-L210](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L203-L210)). That restricts what a script *targets*, not where it *runs*. I did not exhaustively check `ns.exec`/`ns.scp` for a hacknet destination, but neither uses `getNormalServer` for the destination in the lines I saw (scp at [NetscriptFunctions.ts#L766](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L766), exec at [#L634](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L634)) [I].
- Hacknet servers start with **1 GB** RAM ([HacknetServer.ts#L61](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetServer.ts#L61)). The base cost of any script is 1.6 GB ([RamCostGenerator.ts#L11](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L11)), so nothing runs on a 1 GB hacknet server until RAM is upgraded to 2 GB or more [I].
- Hacknet servers are **not** valid targets for `Reduce Minimum Security` / `Increase Maximum Money` ([HacknetHelpers.tsx#L487-L494](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L487-L494)) [S].

### RAM used reduces production [S]

`(1 - ramUsed / maxRam)` in the hash formula. Using the whole RAM gives zero hashes from that server; using half halves it. `ns.hacknet.getNodeStats(i).ramUsed` exposes it ([Hacknet.ts#L87-L91](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Hacknet.ts#L87-L91)).

Implication [I]: a thread-RAM unit on a hacknet server costs `production / maxRam` hash/s per GB. With a 100/1/10 starter server upgraded to 64 GB (0.42 h/s = $105k/s at $250k/hash), each GB used costs about $1.6k/s. Doubling a server's RAM yields only x1.07 hash but doubles the *available* RAM, so for RAM-hungry scripts it can be worth running them elsewhere (home) rather than on hacknet servers.

### RAM cost of `ns.hacknet.*` in 3.0 [S]

[V301/Netscript/RamCostGenerator.ts#L98-L121](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L98-L121): **every `ns.hacknet` function costs `RamCostConstants.Hacknet` = 0.5 GB** ([#L38](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L38)). The functions: `numNodes`, `purchaseNode`, `getPurchaseNodeCost`, `getNodeStats`, `upgradeLevel`, `upgradeRam`, `upgradeCore`, `upgradeCache`, `getLevelUpgradeCost`, `getRamUpgradeCost`, `getCoreUpgradeCost`, `getCacheUpgradeCost`, `numHashes`, `hashCost`, `spendHashes`, `maxNumNodes`, `hashCapacity`, `getHashUpgrades`, `getHashUpgradeLevel`, `getStudyMult`, `getTrainingMult`. The `HNUpgLevel/Ram/Core` constants (0.4/0.6/0.8) exist ([#L39-L41](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L39-L41)) but nothing references them, so they are dead [S]. RAM is counted once per distinct function used in the script, not per call [I, standard Bitburner static analysis; not re-verified here].

Implementation: [V301/NetscriptFunctions/Hacknet.ts#L53-L245](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Hacknet.ts#L53-L245).

Minimal RAM for a purchase/upgrade/spend loop [I, arithmetic]:

| Functions used | Count | RAM (1.6 + 0.5 x count) |
|---|---|---|
| `spendHashes` only (sell-for-money loop; uses fixed `4*n` amounts) | 1 | 2.1 GB |
| `numHashes`, `spendHashes` | 2 | 2.6 GB |
| `numHashes`, `hashCost`, `spendHashes`, `hashCapacity` | 4 | 3.6 GB |
| Add `numNodes`, `getPurchaseNodeCost`, `purchaseNode` | 7 | 5.1 GB |
| Add `getLevelUpgradeCost`, `upgradeLevel`, `getRamUpgradeCost`, `upgradeRam`, `getCoreUpgradeCost`, `upgradeCore` | 13 | 8.1 GB |
| Add `getCacheUpgradeCost`, `upgradeCache`, `getNodeStats` | 16 | 9.6 GB |

Notes:
- `ns.getPlayer().money` (or `ns.getServerMoneyAvailable("home")`) is also needed to decide purchases; cost per [RamCostConstants](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L20-L60) — I did not look up `getPlayer`/`getServerMoneyAvailable` costs here.
- Because upgrade calls return `false` on failure and `get*Cost` is only a convenience, a loop *could* skip the cost getters and just try the upgrade, at the cost of failed-call log noise [I].
- `ns.hacknet.*` is gated on `hasHacknetServers()` for hash functions (returns 0 / Infinity / false otherwise) [S].
- `ns.formulas.hacknetServers.*` (e.g. `hashGainRate`, upgrade costs, constants) also exists ([Formulas.ts#L298-L363](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Formulas.ts#L298-L363)); its RAM cost is not covered here, and `ns.formulas` needs Formulas.exe on the player.
- `purchaseNode()` returns the new index, or -1 on failure/20 servers ([HacknetHelpers.tsx#L38-L83](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L38-L83)). `upgradeCache` also refreshes total hash capacity ([Hacknet.ts#L119-L137](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Hacknet.ts#L119-L137)). `spendHashes(name, target, count)` takes count as a non-negative integer and returns success ([#L200-L217](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Hacknet.ts#L200-L217)); target is `""` for upgrades without one.

---

## 5. What BN9 grants

All [S] unless marked.

**Without SF9 (first run through BN9):**
- Hacknet servers are enabled while you are in BN9: `hasHacknetServers()` is `canAccessBitNodeFeature(9) && !disableHacknetServer`, and `canAccessBitNodeFeature` is true if `bitNodeN === 9` or the active SF9 level is > 0 ([HacknetHelpers.tsx#L34-L36](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L34-L36), [BitNodeUtils.ts#L17-L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeUtils.ts#L17-L19)).
- **One free starter server on BN9 entry**: level 100, 10 cores, cache 5, 1 GB RAM, with the hash rate and capacity recomputed ([Prestige.ts#L336-L348](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L336-L348)); the condition is `activeSourceFileLvl(9) >= 3 || bitNodeN === 9`, in `prestigeSourceFile` (BitNode entry), with a comment saying it is kept "until install". It is not recreated by `prestigeAugmentation`.
- Starting stats in the new BitNode: home RAM 8 GB, or 32 GB with any SF1, or 128 GB with SF9.2+ ([Prestige.ts#L246-L252](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L246-L252)); starting money is $1,262 [S: `this.money = 1000 + CONSTANTS.Donations` in [PlayerObjectGeneralMethods.ts#L102](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L102), `Donations` = 262 per [Constants.ts#L107](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L107); BN9 has no starting-money override, unlike BN8/BN13 in Prestige.ts].
- BN9 penalties apply: see multipliers in section 1.

**SF9 (first completion of BN9)**, [BitNode.tsx#L339-L358](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L339-L358) and [applySourceFile.ts#L133-L147](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SourceFile/applySourceFile.ts#L133-L147):

| Level | Gain |
|---|---|
| SF9.1 | Hacknet servers available in every other BitNode; hacknet production +12%, hacknet costs -12% (not cache) |
| SF9.2 | Start new BitNodes with 128 GB home RAM; production +18%, costs -18% |
| SF9.3 | Start each new BitNode with a highly-upgraded server (level 100, 10 cores, cache 5, 1 GB RAM, per Prestige.ts above); production +21%, costs -21% |

Whether SF9's multiplier applies *during BN9 itself* when you hold SF9: `Player.mults` get the SF effect from `applySourceFile` for the active SF level, which I read as always applying when you own the SF [I, I did not trace the call site]. In BN9 with SF9.3, the starter server comes from the `bitNodeN === 9` branch anyway (a single server, not two) [S].

---

## 6. Rough payback times (BN9)

All [I]: my arithmetic on the sourced formulas, assuming every hash is converted at $250k, `HacknetNodeMoney` 1, cost multiplier 1 unless noted, and ignoring BN9's weak non-hacknet income. Payback = cost / added $/s.

### Marginal paybacks (single purchase)

| Purchase | Cost | Added $/s | Payback |
|---|---|---|---|
| Server n=2 (fresh, level 1) | $160k | $250 | 640 s |
| Server n=3 (fresh) | $512k | $250 | 34 min |
| Server n=5 (fresh) | $5.2m | $250 | 5.8 h |
| Server n=10 (fresh) | $1.76b | $250 | 81 days |
| RAM 1 to 2 GB on a L100/C10 server | $200k | $4.9k | 41 s |
| RAM 1 to 8 GB on L100/C10 | $2.3m | $15.8k | 148 s |
| Core 1 to 2 on L100 | $1m | $5.0k | 200 s |
| Core 1 to 10 on L100 | $92m | $45k | 34 min |
| Core 10 to 11 on L100 | $51.6m | $5.0k | 2.9 h |
| Level 100 to 101 on the starter server | $6.9b | $700 | 114 days |
| Level 1 to 50 on a fresh server | $5.8e8 | $12.3k | 13 h |

Conclusions [I]: (a) **RAM and core upgrades on the starter server pay back in minutes**, so buy them first; (b) **new servers are only worth it as a vehicle for RAM+cores and cheap levels**, since a fresh server's marginal payback is dominated by getting its level up (a fresh server brought to L100 / C10 / 1 GB costs about $6.9e10 total, roughly 11 days to pay back from its own $70k/s); (c) **level past about 100 is almost never worth it** because each level is x1.1 the last while it adds only a flat 1 level of 0.001 h/s.

### Greedy-build simulation (single run, no augmentation installs, no hash-capacity limits)

Rule: always buy the cheapest cost-per-added-$/s option among +1 level / RAM doubling / +1 core on each server and the next server, never buying cache; start with the BN9 starter server and $1,262; all hashes sold continuously at $250k. Real runs will lag this because hashes only become money when spent (or at capacity) and the 200 ms tick granularity is ignored.

| Elapsed (real time) | Multiplier 1 (no SF9): servers, income | SF9.3 (x1.21 prod, x0.79 cost): servers, income |
|---|---|---|
| 1 h | 4 servers, $187k/s | 4 servers, $268k/s |
| 6 h | 5 servers, $458k/s | 6 servers, $731k/s |
| 24 h | 6 servers, $956k/s | 7 servers, $1.56m/s |
| 72 h | 8 servers, $1.86m/s | 8 servers, $2.64m/s |
| 7 d | 8 servers, $2.52m/s | 9 servers, $3.90m/s |

Shape of the build [I]: a few hundred levels of mostly core+RAM growth on the starter server, additional servers at levels around 30 to 100, RAM growing into the thousands of GB by day 3. This says hacknet income is on the order of hundreds of thousands of dollars per second within an hour of a BN9 entry, which dwarfs BN9's hacking income. **Caveat**: the simulation ignores that hacknet servers and hash upgrades are lost on augmentation install, so any plan that installs augmentations during BN9 restarts from zero (no free starter server after the first install) [S for the reset, I for the consequence].

### Notes for the plan

- Early game before the first hash sale: with the starter server at 0.28 h/s, the first 4 hashes arrive after about 14 s, and capacity (1,024) fills in about an hour, after which the overflow sells itself [I].
- Hash upgrades other than money (security/max money/gym/Bladeburner) cost hashes that would otherwise be $250k each; e.g. one Bladeburner Rank purchase (250 hashes) forgoes about $62.5m [I]. Decide per upgrade whether that is worth it in the plan.
- Total capacity matters when you want to save for large escalating purchases: with cache 5 on the starter (1,024), anything over 1,024 hashes needs cache or more servers [I].

---

## Not researched

- The complete list of augmentations that change `hacknet_node_*` multipliers (and their sizes).
- Exact RAM cost of `ns.getPlayer` / `ns.getServerMoneyAvailable` / `ns.formulas.*`.
- Whether `ns.exec` / `ns.scp` accept a hacknet server as destination without error (the code path I read suggests yes, not tested).
- Differences between v3.0.1 and `dev` in these files (the existing `bitburner-current-state.md` covers `dev` for other areas; here everything is from v3.0.1 only).
