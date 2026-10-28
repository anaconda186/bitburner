# Bitburner: current state of the game for an automated speedrun

Research date: 2026-10-28. Sources: the game's source code at `bitburner-official/bitburner-src`. I read it from a local clone and did not run it.

Link conventions:
- **DEV** = `dev` branch at commit [`444f66c`](https://github.com/bitburner-official/bitburner-src/commit/444f66c90be5dd69b07bcba52375a739351f6b14) (2026-10-28). Links of the form `DEV/path#Lx` go to `https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/path#Lx`.
- **V301** = tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1) (commit `3162fd2`), the latest release.
- Most links go to DEV, because that is the code I read line by line. Wherever DEV and v3.0.1 differ in a way that matters, the text says so. I checked those differences with `git diff v3.0.1 dev` on the files involved.
- `#NNNN` is a PR on the repo: `https://github.com/bitburner-official/bitburner-src/pull/NNNN`.

---

## Summary: the facts most likely to shape the design

1. **Target 3.0.x.** v3.0.1 (17 May 2026) is the latest release. v3.0.0 (1 May 2026) was a large breaking release, and 2.x automation code generally does not run on it unchanged. The things that break most often are listed in fact 8 and in Question 2.
2. **Without Source-File 4, most of the progression loop needs the UI.** Joining factions, buying and installing augmentations, buying TOR and programs, creating programs, backdooring, connecting, working, crime, studying, upgrading home RAM and destroying w0r1d_d43m0n are all Singularity-only through the API. Every Singularity call goes through `checkSingularityAccess`, which requires being in BN4 or owning SF4 ([DEV/src/Netscript/NetscriptHelpers.tsx#L450-L458](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/NetscriptHelpers.tsx#L450-L458)). A fresh BN1 run can only get past this by driving the UI through `document`/`window` (DOM automation).
3. **DOM automation is not blocked, but it costs RAM.** Each `document` or `window` reference adds 25 GB to a script's static RAM ([DEV/src/Script/RamCalculations.ts#L185-L191](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Script/RamCalculations.ts#L185-L191), [RamCostGenerator.ts#L12](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L12)). A fresh save's home has **8 GB** ([DEV/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L70](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L70)), so a DOM-driving script cannot run on home at the start.
   - Getting around that cost is a tracked "exploit" (`Exploit.Bypass`), which grants an achievement and a tiny bonus rather than a penalty ([DEV/src/Exploits/Exploit.ts](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Exploits/Exploit.ts)).
4. **Singularity RAM is multiplied by SF4 level.** Costs are 16× at SF4.1 (or with no SF4), 4× at SF4.2 and 1× at SF4.3, and always 1× inside BN4 ([DEV/src/Netscript/RamCostGenerator.ts#L82-L96](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L82-L96)).
   - `destroyW0r1dD43m0n` has a base cost of 32 GB, so 512 GB at SF4.1. `b1tflum3` is 16 GB base. `installAugmentations` and `purchaseAugmentation` are 5 GB base, so 80 GB at SF4.1 ([#L157-L223](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L157-L223)).
   - This makes **BN4 → SF4.3 an early priority** for a fully scripted run.
5. **A BitNode counts as "finished" when w0r1d_d43m0n's `backdoorInstalled` flag is true** ([DEV/src/BitNode/BitNodeUtils.ts#L9-L15](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNodeUtils.ts#L9-L15)). There are two ways to get there:
   - **Hacking route:** install The Red Pill, which connects WD to the network. Then open 5 ports on WD, NUKE it, and reach hacking level 3000 × `WorldDaemonDifficulty`.
   - **Bladeburner route:** complete all 21 Black Ops.
6. **Every reset kills all scripts and clears all ports.** Installing augmentations, soft resets, destroying a BitNode and fluming all do this ([DEV/src/NetscriptWorker.ts#L38-L44](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptWorker.ts#L38-L44)).
   - Home's scripts and text files survive. Everything else is rebuilt.
   - The only automatic restart is the callback script. It runs **500 ms after the reset, with 1 thread and no arguments, from home**. If it does not fit in home's free RAM it **fails silently**: only a terminal error is printed ([DEV/src/NetscriptFunctions/Singularity.ts#L67-L84](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Singularity.ts#L67-L84)).
   - Home RAM resets to 8, 32 or 128 GB on a new BitNode, so the callback script must be tiny.
7. **A fresh save starts the interactive tutorial, which rejects every terminal command except the current tutorial step** ([DEV/src/engine.tsx#L380-L391](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/engine.tsx#L380-L391), [DEV/src/Terminal/Terminal.ts#L343-L485](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Terminal/Terminal.ts#L343-L485)).
   - A one-command start therefore needs one click on "Exit Tutorial" first, plus a way to get the code in: the `wget` terminal command, Remote API (RFA), or pasting into nano.
   - The old API server was removed in 3.0.0 (#2084).
8. **The 3.0 breaks most likely to affect a bootstrap:**
   - Purchased-server functions moved to `ns.cloud.*` (#2367).
   - Fuzzy matching of enum strings was removed (crime, work type, gym, university and others) (#2091).
   - `.script` (NS1) files can no longer run (#2083).
   - `ns.nFormat`, `ns.tail` and the `ns.format*` helpers were removed in favour of `ns.format.*` and `ns.ui.*`.
   - `darkweb` no longer appears in `ns.scan()` (#2139).
   - Hacknet RAM changed from a one-time 4 GB to 0.5 GB per function (#2502).
   - `nuke` and the port crackers now return `false` instead of throwing (#2153).
9. **"Completing the game" plausibly means the in-game achievement "More BitNodes, please!" (`BN_DESTROYER`):** SF level ≥ 3 in every BitNode 1–15 ([DEV/src/Achievements/Achievements.ts#L566-L571](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Achievements/Achievements.ts#L566-L571)). SF12 has no maximum level, so "max every SF" is not a finite goal. That makes 15 × 3 = 45 BitNode completions, counting already-owned SF levels.
10. **`ns.getResetInfo()` (1 GB) returns `currentNode`, `ownedSF`, `ownedAugs` and `bitNodeOptions` without Singularity** ([DEV/src/NetscriptFunctions.ts#L1441-L1455](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions.ts#L1441-L1455)). It is the cheap way for the bootstrap to work out where it is after any reset.

---

## 1. Current version

| | Version | Date | Evidence |
|---|---|---|---|
| Latest release | **v3.0.1** (marked "Latest") | 17 May 2026 (GitHub release published 2026-05-17T06:34Z) | `gh release list -R bitburner-official/bitburner-src`; [changelog.md#L3](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Documentation/doc/en/changelog.md#L3); V301 `src/Constants.ts` line 7 `VersionString: "3.0.1"` |
| Previous major | v3.0.0 | 1 May 2026 (release 2026-05-02T01:41Z) | [changelog.md#L56](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Documentation/doc/en/changelog.md#L56) |
| Last 2.x | v2.8.1 | 4 Apr 2025 | [changelog-v2.md#L3](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Documentation/doc/en/changelog-v2.md#L3) |
| Default branch | `dev`, version string **"3.0.2"**, `isDevBranch: true`, VersionNumber 51 | HEAD 2026-10-28 | [DEV/src/Constants.ts#L7-L10](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Constants.ts#L7-L10) |

**`dev` is 254 commits ahead of v3.0.1** (`git log v3.0.1..dev`). The unreleased changes that matter for automation:

- **API breaks recorded for 3.0.2** ([DEV/src/utils/APIBreaks/3.0.2.ts](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.2.ts)):
  - `ns.singularity.exportGameBonus()` is deprecated in favour of `hasExportGameBonus()` (#2986).
  - `ns.dnet.getServerDetails()` now returns the visible lab depth instead of -1.
- **`destroyW0r1dD43m0n(nextBN?)`:** `nextBN` is now optional. Leaving it out keeps you on the BitVerse screen (#2857). BN options are validated before anything happens (#2871). See [DEV Singularity.ts#L1130-L1180](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Singularity.ts#L1130-L1180).
  - In v3.0.1, `nextBN` is required and is validated with `helpers.number` (V301 `Singularity.ts` lines 1153–1199).
- **`b1tflum3` now validates `nextBN`** (#2836).
- **New zero-RAM UI APIs:**
  - `ns.ui.alias`, `ns.ui.unalias` and `ns.ui.getAllAliases` set terminal aliases from a script (#2806).
  - `ns.ui.renderPage` (#2875).
  - `ns.ui.openCodeEditor` (#2830).
  - `ns.ui.createConnectLink` costs 5 GB (#2948).
  - `ns.format.money` (#2848).
  - RAM table: [DEV RamCostGenerator.ts#L440-L464](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L448-L463).
- **Ports:**
  - New `ns.isFullPort` and `ns.isEmptyPort` (#2926).
  - Writing a `Symbol` to a port is now rejected (#2929).
  - Home's SSH/FTP/SMTP/HTTP/SQL ports are closed on prestige (#2978; [DEV ServerHelpers.ts#L259-L263](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/ServerHelpers.ts#L259-L263)).
- **`ns.spawn` is now typed as returning `never`** (#2798).
- **RAM:** `hacknet.getHashUpgrades` now costs 0 GB (#3210).
- **The terminal `scan-analyze` command was made less powerful** (#2995). Only the terminal command changed, not the API.
- **Darknet:**
  - In BN12, The Red Pill is no longer a darknet-lab reward (#3025).
  - The bonus-lab reward changed from NeuroFlux Governor to "The Thread" (#2827). Compare [DEV labyrinth.ts#L426-L450](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkNet/effects/labyrinth.ts#L426-L450) with V301 `labyrinth.ts` lines 403–430.
- **Gang:** the gang member level formula was fixed (#3195), and a new `ns.formulas.gang.reputationGain` was added (#3179).
- **Corporation:** passive popularity decay was removed (#2932).
- **Tutorial:** killing scripts is now allowed during the tutorial (#2797). This implies v3.0.1 blocks it.

---

## 2. What changed that breaks automation scripts (v2.7 → v3.0.x)

The authoritative list is the game's own API-break detector. On load it rewrites affected player scripts and writes `APIBreakInfo-<ver>.txt` to home ([DEV/src/utils/APIBreaks/APIBreak.ts#L60-L90](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/APIBreak.ts#L60-L90), [#L166](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/APIBreak.ts#L166)). It runs from [SaveDataMigrationUtils.ts#L651-L654](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/SaveDataMigrationUtils.ts#L651-L654). The full v3 list is in [DEV/src/utils/APIBreaks/3.0.0.ts](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts), and the maintainers keep a tracking issue: [#2148 "Breaking changes in v3"](https://github.com/bitburner-official/bitburner-src/issues/2148).

### 2a. Removed, renamed or moved (3.0.0 unless noted)

| Old (2.x) | New (3.x) | Source |
|---|---|---|
| `.script` (NS1) files | Cannot be run. The extension is still recognised so files can be opened, copied or deleted. | #2083; [DEV/src/Paths/ScriptFilePath.ts#L9-L20](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Paths/ScriptFilePath.ts#L9-L20) |
| `ns.purchaseServer`, `getPurchasedServers`, `getPurchasedServerCost`, `getPurchasedServerLimit`, `getPurchasedServerMaxRam`, `upgradePurchasedServer`, `getPurchasedServerUpgradeCost`, `renamePurchasedServer`, `deleteServer` | `ns.cloud.purchaseServer`, `getServerNames`, `getServerCost`, `getServerLimit`, `getRamLimit`, `upgradeServer`, `getServerUpgradeCost`, `renameServer`, `deleteServer` | #2367; [3.0.0.ts#L396-L459](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L396-L459) |
| BN mults `PurchasedServer{Cost,Softcap,Limit,MaxRam}` | `CloudServer*` | [3.0.0.ts#L460-L502](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L460-L502) |
| `ns.formatNumber`, `formatRam`, `formatPercent`, `tFormat` | `ns.format.number`, `.ram`, `.percent`, `.time` | #1635; [3.0.0.ts#L103-L115](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L103-L115) |
| `ns.nFormat` | Removed outright | #2088; [3.0.0.ts#L44-L51](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L44-L51) |
| `ns.tail`, `moveTail`, `resizeTail`, `closeTail`, `setTitle` | `ns.ui.openTail`, `moveTail`, `resizeTail`, `closeTail`, `setTailTitle` (moved in 2.8.0, old names removed in 3.0) | #1935, #2143; [3.0.0.ts#L116-L136](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L116-L136) |
| `ns.getTimeSinceLastAug()`, `getPlayer().playtimeSinceLastAug`, `getPlayer().playtimeSinceLastBitnode`, `getPlayer().bitNodeN` | `ns.getResetInfo().lastAugReset`, `.lastNodeReset`, `.currentNode` | #2088; [3.0.0.ts#L52-L102](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L52-L102) |
| `ns.stock.hasWSEAccount`, `hasTIXAPIAccess`, `has4SDataTIXAPI`; constants `WSEAccountCost`, `TIXAPICost` | `hasWseAccount`, `hasTixApiAccess`, `has4SDataTixApi`; `WseAccountCost`, `TixApiCost` | #2173 |
| `ns.gang.getOtherGangInformation` | `getAllGangInformation` | #2635 |
| `ns.corporation.setAutoJobAssignment`; `getCorporation().state`, `.dividendTax`; `Division.type` | `setJobAssignment`; `.nextState`, `.tributeModifier`; `Division.industry` | #2146, #2088, #2237, #2152 |
| `FactionName.BachmanAssociates` | `FactionName.BachmanAndAssociates` | #2183 |
| Gang equipment with real brand names | Renamed ([3.0.0.ts#L5-L30](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L5-L30)) | #2293 |
| `getCurrentWork().completion` / `sleeve.getTask().completion` | Always `nextCompletion` | #2687 |
| `ns.dnet.getServerAuthDetails` (3.0.0) | `ns.dnet.getServerDetails` (3.0.1) | #2746; [3.0.1.ts](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.1.ts) |
| VSCode extension / API server | Removed. Use Remote API (RFA). | #2084 |

### 2b. Behaviour or signature changes

- **No more fuzzy matching of string parameters (#2091).** `commitCrime("rob store")` no longer works; it must be exactly `"Rob Store"`. This also applies to faction work type, university class, gym stat, job field, stock position and order types, and all Bladeburner action names and types. Use the `ns.enums.*` constants ([3.0.0.ts#L152-L169](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L152-L169)). This matters a lot for crime and work automation.
- **`nuke` and the port crackers no longer throw (#2153).** They return `false` when the program is missing or not enough ports are open ([DEV/src/NetscriptFunctions.ts#L505-L537](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions.ts#L505-L537)).
- **Analysis and server-info APIs now throw for non-hackable servers such as hacknet servers (#2261).** This covers `hackAnalyze*`, `growthAnalyze*`, `getServer{MoneyAvailable,SecurityLevel,...}`, `getHackTime`, `getGrowTime` and `getWeakenTime`. In 2.x they returned defaults ([3.0.0.ts#L273-L328](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L273-L328)). A naive "scan everything and analyze" loop must now filter out these servers.
- **`darkweb` is now a darknet server and is missing from `ns.scan()` (#2139).** Use `ns.dnet.probe()` to find darknet servers ([3.0.0.ts#L536-L545](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/utils/APIBreaks/3.0.0.ts#L536-L545)). BFS crawlers that relied on seeing `darkweb` will change behaviour. Buying TOR and programs is unchanged: `purchaseTor` connects home to `darkweb` ([DEV ServerHelpers.ts getTorRouter](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/ServerHelpers.ts#L354-L356)).
- **Server lookups by host need the server to be on the network.** NS calls only find a server if it has at least one network connection ([DEV NetscriptHelpers.tsx#L566-L582](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/NetscriptHelpers.tsx#L566-L582)). Anything else gives "Invalid host" (or `null` for offline darknet servers). This is why w0r1d_d43m0n cannot be targeted before The Red Pill is installed (Question 3).
- **`ns.getServer()` is typed `Server & { isOnline?: boolean }`** ([DEV d.ts#L8535](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/ScriptEditor/NetscriptDefinitions.d.ts#L8535)). In 3.0.0 it was a `Server | DarknetServer` union; 3.0.1 simplified it (#2746).
- **IP addresses can be used anywhere a hostname is accepted, and IPs now use the full 32-bit space** (#1990, #2113). `ns.getIP` and `ns.dnsLookup` were added.
- **`ns.sleeve.travel()` now cancels the sleeve's current task** (#2559). `ns.cloud.purchaseServer` and `deleteServer` no longer trim whitespace from hostnames (#2560).
- **`ns.getBitNodeMultipliers` (SF5-gated) and `ns.hacknet.spendHashes` check their parameters strictly** (#2085).
- **TIX access no longer requires a WSE account,** but `purchase4SMarketData` now needs one (#2342).
- **Coding contracts:** the string-to-answer conversion is now consistent across all contracts, which affects 7 types (#2608). `createDummyContract` takes a host and can return `null` (#2399, #2417).
- **IPvGO:** `ns.go.analysis.*` evaluates a supplied board as given (#2415).
- **Bladeburner:** `getActionRepGain` now really returns reputation rather than rank (#2186). Bladeburner API access moved from SF7 to SF6 or SF7 in 2.8.0 (#1926; [DEV Bladeburner.ts#L35-L37](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Bladeburner.ts#L35-L37)).
- **Sleeves:** new `ns.sleeve.purchaseSleeve`, `upgradeMemory`, `getSleeveCost` and `getMemoryUpgradeCost` at 4 GB each (#2443).
- **Infiltration was rebalanced (#2210):** rewards changed and there are now a minimum stat requirement and a market-demand factor.

### 2c. RAM-cost changes (v2.8.1 → v3.0.1, from `git diff v2.8.1 v3.0.1 -- src/Netscript/RamCostGenerator.ts`)

| API | 2.8.1 | 3.0.1 | Note |
|---|---|---|---|
| `ns.hacknet.*` | 4 GB once for the namespace, functions free | 0.5 GB per function (DEV: `getHashUpgrades` is 0) | [DEV#L99-L121](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L99-L121) |
| `ns.rm` | 1.0 GB | 0.6 GB (matches `scp`) | #2761 |
| `ns.stock.nextUpdate` and other "cycle timing" promises | 1 GB | 0 GB | `CycleTiming: 0` ([#L79](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L79)), #2702 |
| `gang.inGang`, `bladeburner.inBladeburner` | 1 GB | 0 GB | #2582 |
| `grafting.waitForOngoingGrafting` | 1 GB | 0 GB | |
| Cloud API | (same values under old names) | `purchaseServer` / `deleteServer` 2.25, `getServerNames` 1.05, `getServerCost` 0.25, `upgradeServer` 0.25, `getServerLimit` / `getRamLimit` 0.05 | [DEV#L225-L235](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L225-L235) |
| `ns.format.*`, `ns.dynamicImport`, `ns.getFileMetadata` | n/a | 0 GB | |

**Unchanged core costs** ([DEV#L10-L79](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L10-L79), [#L547-L640](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L547-L640)):

| Group | Cost (GB) |
|---|---|
| Script base | 1.6 |
| `hack` | 0.1 |
| `grow`, `weaken` | 0.15 |
| `scan` | 0.2 |
| `nuke` and port crackers | 0.05 |
| `run` | 1.0 |
| `exec` | 1.3 |
| `spawn` | 2.0 |
| `scp` | 0.6 |
| `getServer` | 2 |
| `getServerX` functions | 0.1 |
| `share` | 2.4 |
| `getResetInfo` | 1 |
| `getBitNodeMultipliers` | 4 |

### 2d. Hacking, HWGW timing and formulas

- **The core formulas are unchanged since 2.8.1.** In `src/Hacking.ts` the only change is a darknet special case that fixes hack time at 16 s on darknet servers ([DEV Hacking.ts#L61](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Hacking.ts#L61)).
  - Hack-time multiplier is 5; grow is 3.2× hack time; weaken is 4× hack time ([#L72-L93](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Hacking.ts#L72-L93)).
  - Grow's core bonus was refactored to `getCoreBonus` but the value is the same, `1 + (cores-1)/16` (#2387; [ServerHelpers.ts#L315-L318](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/ServerHelpers.ts#L315-L318)).
  - Fortify is 0.002 per hack/grow thread and weaken is 0.05 per thread. The cloud server limit is 25 and max RAM is 2^20 GB ([DEV Server/data/Constants.ts](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/data/Constants.ts)).
- **Formulas:** 3.0.0 added `formulas.hacking.weakenEffect` (#2626) and `formulas.reputation.sharePower` (#2126). The formulas API still requires `Formulas.exe` ([DEV Formulas.ts#L63-L67](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Formulas.ts#L63-L67)). Formulas.exe costs $5b on the dark web or can be created at hacking 1000 ([DarkWebItems.ts](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkWeb/DarkWebItems.ts), [Programs.ts#L307-L318](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Programs/Programs.ts#L306-L318)). SF5 grants it on every reset ([Prestige.ts#L93-L95](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L93-L95)).
- **2.8.0 fixes:** `ns.weaken` now reports the correct amount near minimum security (#1887), and manual and script hacks now reduce server money with the same multiplier (#1868).

### 2e. Scripts, ports, exec/run and modules

- **Script file types:** `.js`, `.jsx`, `.ts` and `.tsx` are runnable. TypeScript and JSX support arrived in 2.7.0 ([ScriptFilePath.ts#L20](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Paths/ScriptFilePath.ts#L20)). `ns.dynamicImport(path)` was added in 3.0.0 (#2036). Circular imports are now detected (#2194).
- **`run`, `exec` and `spawn` signatures** are `run(script, threadOrOptions?, ...args)`, `exec(script, host, threadOrOptions?, ...args)` and `spawn(...) : never` ([DEV d.ts#L8219-L8292](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/ScriptEditor/NetscriptDefinitions.d.ts#L8219-L8292)).
  - `RunOptions` has `threads`, `temporary`, `ramOverride` and `preventDuplicates` (which defaults to false). `SpawnOptions.spawnDelay` defaults to 10 s, and 0 makes spawn synchronous ([d.ts#L314-L349](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/ScriptEditor/NetscriptDefinitions.d.ts#L314-L349)).
  - The terminal `run --temporary` flag was added (#2354).
- **`ns.args`** is `readonly args: ScriptArg[]` ([d.ts#L7463](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/ScriptEditor/NetscriptDefinitions.d.ts#L7463)). I found no change to it.
- **Ports:** the implementation was refactored (#2396), port handles stay usable after the script dies (docs #2930), and ports are cleared on every prestige (Question 5).

---

## 3. Victory and completion conditions

### 3a. What "destroying" a BitNode is in code

- **Finished means w0r1d_d43m0n's `backdoorInstalled` flag is true** ([BitNodeUtils.ts#L9-L15](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNodeUtils.ts#L9-L15)). These paths set it:
  1. **Terminal `backdoor` while connected to WD.** It takes hack time / 4 and then routes to the BitVerse ([Terminal/commands/backdoor.ts#L54-L62](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Terminal/commands/backdoor.ts#L54-L62)). A successful terminal `hack` on WD does the same ([hack.ts#L44-L49](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Terminal/commands/hack.ts#L44-L49)).
  2. **`ns.singularity.installBackdoor()` while connected to WD.** It checks root access and hacking level, takes hack time / 4, and routes to the BitVerse ([Singularity.ts#L500-L535](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Singularity.ts#L500-L535)).
  3. **`ns.singularity.destroyW0r1dD43m0n(...)`** (3b).
  4. **The Bladeburner "Destroy w0r1d_d43m0n" button.** It appears once `numBlackOpsComplete >= numberOfBlackOperations` ([BlackOpPage.tsx#L38-L51](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Bladeburner/ui/BlackOpPage.tsx#L38-L51)). There are 21 Black Ops, since `numberOfBlackOperations` is the size of the `BladeburnerBlackOpName` enum ([BlackOperations.ts#L735](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Bladeburner/data/BlackOperations.ts#L735)). Bladeburner is available in BN6 or BN7 or with SF6/SF7, unless disabled by BN options ([PlayerObjectBladeburnerMethods.ts#L7-L9](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObjectBladeburnerMethods.ts#L7-L9)).
- **Paths 1 and 2 land on the BitVerse page, where the player clicks a BitNode.** That click calls `enterBitNode(false, ...)`, which grants or upgrades the Source-File. Only path 3 can choose the next BitNode without the UI.
- **w0r1d_d43m0n server data** ([servers.ts#L1547-L1556](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/data/servers.ts#L1547-L1556)):
  - 5 ports required.
  - Base hacking requirement 3000, multiplied at creation by the BN's `WorldDaemonDifficulty` ([ServerHelpers.ts#L422-L423](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/ServerHelpers.ts#L422-L423)).
  - It has no network layer, so it is unreachable at first. Only `prestigeAugmentation` connects it to `The-Cave` (the Daedalus server), and only if The Red Pill is **installed** (`hasAugmentation(TRP, true)` ignores queued augs) ([Prestige.ts#L173-L181](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L173-L181); [Person.ts#L232-L240](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Person.ts#L232-L240)).
  - Until it is connected, NS calls naming it fail with "Invalid host", because of the network-connection rule in 2b ([NetscriptHelpers.tsx#L566-L582](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/NetscriptHelpers.tsx#L566-L582)).
- **Getting The Red Pill:**
  - It is a Daedalus augmentation with 2.5m reputation cost and no money cost ([Augmentations.ts#L1966-L1972](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Augmentation/Augmentations.ts#L1966-L1972)).
  - The Daedalus invite needs `DaedalusAugsRequirement` installed augs (default 30), **$100b**, and either **hacking 2500 or all combat stats at 1500** ([FactionInfo.tsx#L137-L148](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Faction/FactionInfo.tsx#L137-L148); [BitNodeMultipliers.ts#L61](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNodeMultipliers.ts#L61)).
  - **In BN15**, Daedalus does not offer it ([FactionHelpers.tsx#L211-L214](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Faction/FactionHelpers.tsx#L211-L214)). It is the reward of the 5th darknet lab instead ([labyrinth.ts#L443-L445](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkNet/effects/labyrinth.ts#L443-L445), [#L470-L474](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkNet/effects/labyrinth.ts#L470-L474)).
  - **3.0 adds a second route in other BitNodes:** where `DarknetLabyrinthRewardsTheRedPill` ≠ 0, The Red Pill is also the reward for the darknet lab after The Sword ([labyrinth.ts#L447-L450](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkNet/effects/labyrinth.ts#L447-L450)). The multiplier is 0 in BN8 ([BitNode.tsx#L785](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNode.tsx#L785)) and BN12 ([#L953](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNode.tsx#L953), dev #3025). Darknet access needs BN15, SF15 or DarkscapeNavigator.exe ($50m) ([darknetAuthUtils.ts#L6-L8](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkNet/utils/darknetAuthUtils.ts#L6-L8), [DarkNet/Constants.ts#L8](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkNet/Constants.ts#L8)). **I have not assessed whether this route is faster than Daedalus.**
  - **In BN2**, a gang's faction can also offer The Red Pill ([FactionHelpers.tsx#L186-L190](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Faction/FactionHelpers.tsx#L186-L190)).

### 3b. `ns.singularity.destroyW0r1dD43m0n(nextBN, callbackScript?, bitNodeOptions?)`

Implementation: [DEV Singularity.ts#L1130-L1180](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Singularity.ts#L1130-L1180); in v3.0.1 it is `Singularity.ts` lines 1153–1199. Docs: [d.ts#L2982-L2999](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/ScriptEditor/NetscriptDefinitions.d.ts#L2982-L2999).

- **Requires** Singularity access, and either the hacking route or the Bladeburner route:
  - **Hacking route:** `skills.hacking >= wd.requiredHackingSkill` and `wd.hasAdminRights`. It does **not** require WD to be backdoored or the script to be connected to WD. Root on WD in practice requires The Red Pill (3a).
  - **Bladeburner route:** `numBlackOpsComplete >= 21`.
  - If neither route is met, it logs and returns. It does not throw.
- **Then it:**
  1. Sets WD's `backdoorInstalled = true`.
  2. Calls `calculateAchievements()`.
  3. Calls `enterBitNode(false, current, nextBN, options)`. That kills all scripts, grants or upgrades the SF, sets the BN and options, and runs `prestigeSourceFile` ([RedPill.tsx#L53-L96](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/RedPill.tsx#L53-L96)).
  4. If a callback was given, runs it 500 ms later.
- **RAM:** 32 GB × (16 / 4 / 1 by SF4 level; 1 in BN4).
- **`b1tflum3(nextBN, cb?, opts?)`** (16 GB base) does the same with `isFlume = true`: no SF is granted and no Intelligence XP is awarded. It has **no requirement besides Singularity access**, not even owning `b1t_flum3.exe` ([Singularity.ts#L1113-L1129](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Singularity.ts#L1113-L1129)). The `b1t_flum3.exe` program can be created at hacking 1 once you know about the BitVerse ([Programs.ts#L29-L33](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Programs/Programs.ts#L29-L33), [#L320-L336](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Programs/Programs.ts#L320-L336)).
- **BitNode options** (2.7.0, "BN options selection interface") let you lower active SF levels per BN, override Intelligence, and disable gang, corporation, Bladeburner, 4S, hacknet servers or sleeve XP ([BitNodeUtils.ts#L30-L82](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNodeUtils.ts#L30-L82)).

### 3c. Source-File levels and the BitNode list

- **SF levels go up by 1 per destruction, to a maximum of 3, except SF12, which has no maximum** ([RedPill.tsx#L24-L36](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/RedPill.tsx#L24-L36); [BitNodeUtils.ts#L102-L104](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNodeUtils.ts#L102-L104)).
- **The valid BitNodes are 1–15** ([BitNode/Constants.ts#L1](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/Constants.ts#L1)).
- **Sources for the table:** names and SF effects are from [BitNode.tsx#L45-L559](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNode.tsx#L46-L570). WD difficulty values are from the per-BN multiplier blocks in the same file; BN1 and BN8 use the default of 1 ([BitNodeMultipliers.ts#L180](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNodeMultipliers.ts#L180)).

| BN | Name | Max SF | WD hacking requirement (3000 × diff) | SF effect, abridged |
|---|---|---|---|---|
| 1 | Source Genesis | 3 | 3000 | Start with 32 GB home; all mults +16/24/28% |
| 2 | Rise of the Underworld | 3 | 15000 (×5) | Gangs elsewhere; crime and charisma mults |
| 3 | Corporatocracy | 3 | 6000 (×2) | Corporations elsewhere; full API at level 3 |
| 4 | The Singularity | 3 | 9000 (×3) | Singularity API; RAM 16×/4×/1× |
| 5 | Artificial Intelligence | 3 | 4500 (×1.5) | Intelligence stat; Formulas.exe; `getBitNodeMultipliers` |
| 6 | Bladeburners | 3 | 6000 (×2) | Bladeburner elsewhere and its API; combat mults |
| 7 | Bladeburners 2079 | 3 | 6000 (×2) | Bladeburner elsewhere and its API; Bladeburner mults |
| 8 | Ghost of Wall Street | 3 | 3000 | Permanent WSE and TIX; shorts at level 2; limit orders at level 3; grow mult |
| 9 | Hacktocracy | 3 | 6000 (×2) | Hacknet servers; 128 GB start home at level 2 ([Prestige.ts#L242-L248](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L242-L248)); free hacknet server at level 3 |
| 10 | Digital Carbon | 3 | 6000 (×2) | Sleeve and Grafting API; +1 sleeve per level |
| 11 | The Big Crash | 3 | 4500 (×1.5) | Company favor boosts salary; company mults |
| 12 | The Recursion | **unbounded** | 3000 × 1.02^level | Start every BN with NeuroFlux Governor equal to the SF12 level; harder each time |
| 13 | They're lunatics | 3 | 9000 (×3) | Church of the Machine God / Stanek's Gift elsewhere |
| 14 | IPvGO Subnet Takeover | 3 | 15000 (×5) | Node Power ×2; `go.cheat` API; favor caps |
| 15 | The Secrets of the Dark Net | 3 | 6000 (×2) | Start with TOR and DarkscapeNavigator.exe; charisma bonuses |

### 3d. What "completing the game" can mean

- **The in-game definition is the `BN_DESTROYER` achievement**, "More BitNodes, please!", described as "Reach SF x.3 in each BitNode." Its condition is `validBitNodes.every(bn => sourceFileLvl(bn) >= 3)` ([Achievements.ts#L566-L571](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Achievements/Achievements.ts#L566-L571); [AchievementData.json#L399-L403](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Achievements/AchievementData.json#L399-L403); added in #2128). It is marked `NotInSteam`. That is 45 destructions from scratch, including SF12.3.
- **There is no terminal "game over" state.** BN12 can be repeated forever, with WD difficulty, the Daedalus aug requirement and other multipliers scaling as 1.02^level ([BitNode.tsx#L917-L987](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNode.tsx#L917-L987)).
- **Smaller targets:**
  - "Destroy BN1 once", which grants SF1.1.
  - The `FAST_BN` "Speed demon" achievement: finish a BN within 2 days of BN playtime ([Achievements.ts#L560-L565](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Achievements/Achievements.ts#L560-L565)).
  - Per-BN challenge achievements, for example `CHALLENGE_BN1`: finish BN1 with home ≤ 128 GB and 1 core ([#L600-L608](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Achievements/Achievements.ts#L601-L610)).

---

## 4. Automation boundaries

### 4a. Singularity gating and RAM

- **Every `ns.singularity.*` function except `getOwnedSourceFiles` calls `checkSingularityAccess`.** That check passes only in BN4 or with SF4 ≥ 1 ([NetscriptHelpers.tsx#L450-L458](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/NetscriptHelpers.tsx#L450-L458); [BitNodeUtils.ts#L17-L19](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/BitNode/BitNodeUtils.ts#L17-L19)). `getOwnedSourceFiles` still costs the SF4-scaled RAM, so use `ns.getResetInfo().ownedSF` instead.
- **RAM multiplier `SF4Cost`:** in BN4 the multiplier is 1; otherwise it is 16 at SF4 ≤ 1, 4 at SF4 = 2 and 1 at SF4 = 3 ([RamCostGenerator.ts#L82-L96](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L82-L96)). The constants are Fn1 = 2, Fn2 = 3, Fn3 = 5 ([#L55-L57](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L55-L57)).
- **Base costs from [#L157-L223](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/RamCostGenerator.ts#L157-L223), with the SF4.1 cost after ×16:**

| Function | Base GB | At SF4.1 |
|---|---|---|
| `universityCourse`, `gymWorkout`, `travelToCity`, `purchaseTor`, `purchaseProgram`, `connect`, `manualHack`, `installBackdoor`, `getCurrentServer` | 2 | 32 |
| `goToLocation` | 5 | 80 |
| `upgradeHomeRam`, `upgradeHomeCores`, `workForCompany`, `applyToCompany`, `joinFaction`, `workForFaction`, `checkFactionInvitations`, `getFactionInviteRequirements` | 3 | 48 |
| `getFactionRep`, `getCompanyRep` | 1 | 16 |
| `createProgram`, `commitCrime`, `getCrimeChance`, `donateToFaction`, `getOwnedAugmentations`, `getAugmentationsFromFaction`, `purchaseAugmentation`, `installAugmentations`, `softReset` | 5 | 80 |
| `getAugmentationPrice`, `getAugmentationRepReq` | 2.5 | 40 |
| `getCurrentWork` | 0.5 | 8 |
| `isBusy` | 0.5 | 8 |
| `stopAction` | 1 | 16 |
| `b1tflum3` | 16 | 256 |
| `destroyW0r1dD43m0n` | 32 | 512 |

- **Script RAM is computed statically** and padded by `ramOverride` if needed. After a BN reset the cached RAM of home scripts is cleared, so it is recomputed under the new SF4 level ([Prestige.ts#L232-L233](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L232-L233)). Splitting Singularity calls into small single-purpose helper scripts launched with `exec` stays the natural pattern.

### 4b. Fresh BN1, no Source-Files

- **Starting state:**
  - Home has 8 GB RAM, 1 core and `NUKE.exe` ([PlayerObjectGeneralMethods.ts#L63-L78](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L63-L78)).
  - Money is **$1,262**, from `1000 + CONSTANTS.Donations` with `Donations: 262` ([PlayerObject.ts#L56](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObject.ts#L56); [Constants.ts#L106-L107](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Constants.ts#L106-L107)).
  - The game cycle is 200 ms ([Constants.ts#L19](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Constants.ts#L19)).
  - TOR costs $200k ([Constants.ts#L44](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Constants.ts#L44)).
  - Dark-web prices: BruteSSH $500k, FTPCrack $1.5m, relaySMTP $5m, HTTPWorm $30m, SQLInject $250m, DarkscapeNavigator $50m, Formulas $5b ([DarkWebItems.ts](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/DarkWeb/DarkWebItems.ts)).
- **Scriptable with no SF.** None of these call a source-file gate (the files `Go.ts`, `Infiltration.ts`, `CodingContract.ts`, `Hacknet.ts`, `Stanek.ts`, `Gang.ts` and `Corporation.ts` contain no `canAccessBitNodeFeature` check):
  - **Hacking:** `scan`, `nuke` and the port crackers (once owned), `hack`, `grow`, `weaken`, `exec`, `scp`, `kill`, `share`, ports and the file APIs.
  - **Cloud servers:** `ns.cloud.*`.
  - **Hacknet:** `ns.hacknet.*`.
  - **Stocks:** buy and sell via `ns.stock.*` after `purchaseWseAccount` and `purchaseTixApi`, which are not SF-gated ([StockMarket.ts#L297-L334](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/StockMarket.ts#L297-L334)). Shorts need SF8.2 and limit/stop orders need SF8.3 ([#L46-L53](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/StockMarket.ts#L46-L53)).
  - **Other:** coding contracts, IPvGO `ns.go.*`, `ns.infiltration.*` (information only), `ns.ui.*`, `ns.dnet.*` once DarkscapeNavigator is owned, and `ns.formulas.*` once Formulas.exe is owned.
- **Needs Singularity, so in a fresh BN1 it needs the UI or terminal:**
  - Buying TOR and programs (terminal `buy`).
  - `connect` and `backdoor` (terminal). Note that a successful **manual** hack also sets `backdoorInstalled` ([NetscriptHelpers.tsx#L683-L687](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Netscript/NetscriptHelpers.tsx#L683-L687); [hack.ts#L46](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Terminal/commands/hack.ts#L46)).
  - Creating programs.
  - Joining factions, faction or company work, crime, gym and university.
  - Upgrading home RAM and cores, and travel.
  - Buying and installing augmentations.
  - Choosing a BitNode on the BitVerse.
- **UI-only regardless of SF:**
  - Infiltration minigames. The API only exposes `getPossibleLocations` and `getInfiltration` ([d.ts#L6980-L6988](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/ScriptEditor/NetscriptDefinitions.d.ts#L6980-L6988)).
  - Casino games, which have a $10b total-winnings cap ([Casino/Game.ts#L4](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Casino/Game.ts#L4)).
  - Exiting the tutorial.
  - The BitVerse BN click, except through `destroyW0r1dD43m0n` or `b1tflum3`.
  - Dismissing dialog boxes. I did not check whether they block anything.
- **Cheap state reads:** `ns.getResetInfo()` (1 GB) and `ns.getPlayer()`.

### 4c. Anti-automation measures and exploits

- **The game does not try to stop automation.**
  - The source comment says the developers chose not to implement anti-cheat. Instead, players get "Source-File -1" exploits, each adding +0.1% to most multipliers ([Exploit.ts#L1-L30](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Exploits/Exploit.ts#L1-L30); [applyExploits.ts#L9-L10](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Exploits/applyExploits.ts#L9-L10)).
  - The exploit list includes `Bypass` (avoiding the RAM cost of `document`), `Unclickable`, `TimeCompression`, `PrototypeTampering`, `UndocumentedFunctionCall`, `RealityAlteration`, `EditSaveFile` and others.
- **The only real friction is the 25 GB DOM RAM cost** per `document` or `window` reference ([RamCalculations.ts#L185-L191](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Script/RamCalculations.ts#L185-L191)).
- **3.0 closed one UI loophole** that could end a BitNode by reusing the Bladeburner UI event handler (#2574). The handler now re-checks the Black Ops count ([BlackOpPage.tsx#L42-L44](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Bladeburner/ui/BlackOpPage.tsx#L42-L44)).
- **Speed-relevant achievements:** `FAST_BN` (under 2 days) and `CHALLENGE_BN*` (Question 3d).

---

## 5. Surviving resets

### 5a. Installing augmentations or soft reset

Call chain: `ns.singularity.installAugmentations(cb?)` or `softReset(cb?)` → `installAugmentations()` → `prestigeWorkerScripts()` → `prestigeAugmentation()` ([Singularity.ts#L194-L219](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Singularity.ts#L194-L219); [AugmentationHelpers.ts#L115-L157](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Augmentation/AugmentationHelpers.ts#L115-L157)).

- **`installAugmentations` with nothing queued** logs a message and returns `false` without resetting. `softReset` resets anyway.
- **Killed or cleared:**
  - **All running scripts on every server**, and **all NetScript ports** (`NetscriptPorts.clear()`) ([NetscriptWorker.ts#L38-L44](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptWorker.ts#L38-L44)).
  - Recent-scripts list. PIDs restart from the beginning ([Prestige.ts#L192-L194](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L192-L194)).
- **Servers:**
  - `AllServers` is cleared, then home is re-added and the NPC servers are regenerated with new random layout and IPs ([Prestige.ts#L72-L98](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L72-L98); [AllServers.ts#L136-L138](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/AllServers.ts#L136-L138)).
  - **Cloud servers and hacknet nodes are gone** (`purchasedServers = []`, `hacknetNodes.length = 0`) ([PlayerObjectGeneralMethods.ts#L109](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L109), [#L130-L131](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L130-L131)).
  - Anything stored on NPC or cloud servers is lost.
- **Home** ([ServerHelpers.ts#L226-L264](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Server/ServerHelpers.ts#L226-L264)):
  - **Programs** are wiped except `NUKE.exe` and `b1t_flum3.exe` if you had it. Programs granted by installed augs and Formulas.exe (with SF5) are re-added.
  - **`.lit` and `.msg` files** are wiped and replaced by the starting handbook.
  - **Network links** are reset.
  - **Kept:** **scripts and text files**, RAM size and core count. `prestigeAugmentation` never calls `setMaxRam`.
- **Player:**
  - Skills back to 1. Money set to $1,262 plus starting money from augs.
  - City reset to Sector-12. Jobs, factions, invitations and queued augs cleared.
  - Factions flagged "keep on install" retain their invites.
  - Gang membership is kept, and its faction is rejoined ([PlayerObjectGeneralMethods.ts#L80-L141](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L80-L141); [Prestige.ts#L118-L144](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L118-L144)).
  - Current work is finished.
- **Callback script:** after 500 ms, `runAfterReset` starts the callback **from home only**, with **1 thread and no args**, if it exists and fits in `maxRam - ramUsed`. Otherwise it prints a terminal error and does nothing else ([Singularity.ts#L67-L84](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/NetscriptFunctions/Singularity.ts#L67-L84)). The script must recover its own state, either from text files on home or from `getResetInfo()` and `getPlayer()`, because ports and `ns.args` carry nothing.

### 5b. Destroying a BitNode or fluming

Call chain: `destroyW0r1dD43m0n` / `b1tflum3` / BitVerse click → `enterBitNode()` → `prestigeWorkerScripts()` → `giveSourceFile()` (not on flume) → `prestigeSourceFile(isFlume)` ([RedPill.tsx#L53-L96](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/RedPill.tsx#L53-L96); [Prestige.ts#L202-L370](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L202-L370)).

- **Everything in 5a still applies.** `Player.prestigeSourceFile` calls `prestigeAugmentation`.
- **Also reset:**
  - **All installed augmentations**, karma, entropy, gang, corporation, Bladeburner, and WSE/TIX/4S access ([PlayerObjectGeneralMethods.ts#L143-L175](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L143-L175)).
  - Sleeves go back to level 1, but you keep the number of sleeves.
  - Company and faction favor.
- **Home RAM resets to 128 GB with SF9 ≥ 2, else 32 GB with SF1 ≥ 1, else 8 GB. Cores reset to 1** ([Prestige.ts#L242-L249](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L242-L249)). This is the binding constraint on the callback script.
- **The cached RAM of home scripts is invalidated,** because Singularity costs may have changed ([Prestige.ts#L232-L233](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L232-L233)).
- **Carried in from SFs:**
  - SF12 gives NeuroFlux Governor levels ([Prestige.ts#L255-L261](https://github.com/bitburner-official/bitburner-src/blob/444f66c90be5dd69b07bcba52375a739351f6b14/src/Prestige.ts#L255-L261)).
  - SF5 gives Formulas.exe.
  - SF8 gives WSE and TIX.
  - SF9.3 gives a free hacknet server.
  - SF15 gives TOR and DarkscapeNavigator.
- **Per-BN starting money:** BN8 starts with $250m and BN13 with $200k, the travel cost.
- **Home scripts and text files are still kept** (not cleared anywhere in this path). The callback runs as in 5a.

### 5c. Files that persist on home, summarised

| Kept across both reset types | Cleared |
|---|---|
| Scripts (`.js`, `.ts`, …) and text files (`.txt`, `.json`, …) on home | Programs except NUKE.exe and b1t_flum3.exe; `.lit` and `.msg` files; anything on other servers; ports; running scripts |

Home RAM and cores also survive an aug install, but not a BitNode reset. I did not check coding-contract files (`.cct`) on home; see open questions.

---

## Not verified from source, or inferred

- **Runtime behaviour.** I read the code but did not run the game. That covers callback timing in practice, whether dialog boxes block anything, and Steam versus web differences.
- **Which build the public web game serves.** I did not check whether the stable web build equals v3.0.1 or whether players are on the `dev` build.
- **Whether a terminal `hack` on a faction server triggers the faction invite** the same way `backdoor` does. The code sets `backdoorInstalled` on manual hack success, but I did not trace the invite path end to end.
- **Whether `atExit` handlers run on prestige kills.** I did not trace `killWorkerScript`.
- **Whether coding contracts on home survive a reset.** `prestigeHomeComputer` does not touch them, but I did not confirm.
- **Community scripts.** I did not inspect any. The breakage list above comes entirely from the game's own API-break files and changelog, not from analysing a specific community repo.
- **Speed.** I made no assessment of whether the darknet-lab route to The Red Pill (3a) is faster than Daedalus.

## Open questions for the design

1. **Platform and branch:** web stable (v3.0.1), web dev, or Steam? `dev` already changes `destroyW0r1dD43m0n`'s signature and several RAM costs.
2. **Is DOM automation in scope?** Driving the terminal and UI through `document` costs 25 GB and counts as Exploit `Bypass` if the cost is evaded. Without it, a fresh BN1 cannot be fully automated, and the first SF4 must be earned with some UI work.
3. **Delivery of the bootstrap:** `wget` from a URL, Remote API (RFA) push, or paste? And is the one "Exit Tutorial" click acceptable?
4. **Definition of "done":** `BN_DESTROYER` (all SF ≥ 3, 45 destructions from zero)? A fixed BN or SF route? Or wall-clock to the first SF1.1?
5. **BitNode order:** which order minimises total time? For example, BN1 then BN4.x for cheap Singularity, then BN5 for Formulas, then BN9.2 for 128 GB home. This needs the per-BN multipliers in `src/BitNode/BitNode.tsx` `getBitNodeMultipliers`, which I did not tabulate here.
6. **Progress across resets:** how will the orchestrator persist progress (text files on home) and fit the callback script into 8/32/128 GB with SF4-scaled Singularity costs?
