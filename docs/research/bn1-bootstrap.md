# Fastest route from a fresh save to destroying BitNode 1

Research for [#2](https://github.com/anaconda186/bitburner/issues/2). Research date: 2026-10-28.

Builds on [`bitburner-current-state.md`](bitburner-current-state.md) (Singularity gating, reset behaviour, how finishing a BitNode works) and does not repeat it.

**Sources and link convention.** Everything below was read from the game source at tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1) (commit `3162fd2`), the target version. I read the code and did not run it. A link like [`Server/ServerPurchases.ts#L23-L42`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerPurchases.ts#L23-L42) goes to `src/<path>` at that tag. Statements marked **(inferred)** are my reasoning rather than something I read in the code. All time and money estimates are in [section 7](#7-estimates-assumptions-shown), separate from the facts.

Vocabulary follows [GLOSSARY.md](../../GLOSSARY.md): run, fresh save, finish line, milestone, start command, UI automation, human action, exploit.

---

## Summary: the facts that most shape the design

1. **The first UI-automation script has to run on a 32 GB cloud server, bought through the API for $1.76m.** A script that references `document` costs at least 1.6 + 25 = 26.6 GB ([`Script/RamCalculations.ts#L185-L192`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/RamCalculations.ts#L185-L192), [`Netscript/RamCostGenerator.ts#L11-L12`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L11-L12)). No server you can root without port openers has more than 16 GB. Upgrading home RAM is itself a UI action, so it can't come first. `ns.cloud.purchaseServer` needs no Source-File, and in BN1 cloud RAM costs a flat $55,000 per GB at every size ([`Server/ServerPurchases.ts#L23-L42`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerPurchases.ts#L23-L42)). A crude model puts $1.76m at about 10 minutes into the run (section 7).
2. **Home needs at least 32 GB, and realistically 64 GB, before the first augmentation install.** Installing augmentations deletes every cloud server ([`PersonObjects/Player/PlayerObjectGeneralMethods.ts#L109`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L109)) but keeps home RAM. From then on the UI driver has to live on home. Going from 8 to 64 GB costs $14.28m, bought through the City → Alpha Enterprises page.
3. **Some UI handlers ignore scripted events, so part of the game can't be automated in BN1.** These handlers return early unless `event.isTrusted`: creating programs, crime, company work, infiltration, the hospital, the casino, and the Join button on the Factions page ([details in 3c](#3c-actions-the-ui-cannot-do-istrusted-guards)). Programs therefore have to be **bought** (TOR, then terminal `buy`). The megacorp factions (they need company work) and the crime factions (they need karma from crime) are out of reach.
4. **Faction invitations can only be accepted from the popup that appears when the invitation arrives.** The popup's Join button has no `isTrusted` check ([`Faction/ui/FactionInvitationManager.tsx#L54-L60`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/FactionInvitationManager.tsx#L54-L60)). The popup is shown only once, when the invitation fires, and not at all if `SuppressFactionInvites` is on. An invitation that is still pending after a page reload can only be accepted from the Factions page, which a script can't click.
5. **Nothing restarts scripts after a UI-driven install.** The callback script only exists for `ns.singularity.installAugmentations(cb)`. The UI Install button kills every script ([`Augmentation/AugmentationHelpers.ts#L69-L114`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L69-L114)), and the Autoexec setting only fires on game load ([`NetscriptWorker.ts#L251-L257`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L251-L257)). The one hands-free way back that I found is a DOM callback that outlives its script: an `ns.atExit` handler (it runs during the reset's kill pass, [`Netscript/killWorkerScript.ts#L72-L83`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/killWorkerScript.ts#L72-L83)) schedules a `setTimeout` that types `run boot.js` into the terminal after the reset. **Whether that is allowed under the rules is the most important open question here** (Q1). Without it, every install, and the jump into the next BitNode, needs a human to retype the start command.
6. **The Red Pill can only come from Daedalus in BN1.** The darknet labs only exist with full darknet access, meaning BN15 or SF15 ([`DarkNet/effects/effects.ts#L280`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L280), [`DarkNet/effects/labyrinth.ts#L485-L497`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L485-L497)). Even with that access, the Red Pill lab is the seventh lab and needs 4000 charisma.
   - **Daedalus invitation:** 30 **distinct** installed augmentations (NeuroFlux Governor counts once), $100b on hand at one check, and hacking 2500 ([`Faction/FactionInfo.tsx#L138-L149`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L138-L149)).
   - **The Red Pill itself:** 2.5m Daedalus reputation and $0 ([`Augmentation/Augmentations.ts#L1946-L1953`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1946-L1953)).
7. **47 non-special augmentations are reachable without company work or crime.** They come from CyberSec, NiteSec, The Black Hand, BitRunners, Tian Di Hui, Netburners and the six city factions. Together they multiply hacking by only **3.79** and hacking experience by **5.59** (section 5).
8. **NeuroFlux Governor levels decide how long the climb to 3000 takes.** Hacking level is `floor(M × (32·ln(exp + 534.6) − 200))` ([`PersonObjects/formulas/skill.ts#L7-L15`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15)), so the experience needed falls exponentially as the multiplier M rises. Level 3000 at M = 3.79 needs 2.9e13 exp. Thirty NFG levels (×1.01 each, M = 5.11) cut that to 4.8e10, and fifty (M = 6.23) to 1.8e9.
9. **The finishing sequence is entirely UI work after the API roots w0r1d_d43m0n.**
   - Install The Red Pill. That connects w0r1d_d43m0n to The-Cave ([`Prestige.ts#L173-L181`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L173-L181)).
   - Rebuy TOR and the five port programs, which an install wipes. Open the ports and NUKE w0r1d_d43m0n through the API.
   - Reach hacking 3000 (BN1's `WorldDaemonDifficulty` is 1).
   - In the terminal, type `connect …` hop by hop to w0r1d_d43m0n, then `backdoor`.
   - Wait out the BitVerse cinematic, click the BitNode portal, then click `Enter BN<n>.<lvl>` ([`BitNode/ui/PortalModal.tsx#L117-L131`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/ui/PortalModal.tsx#L117-L131)).

---

## 1. The route at a glance

API = Netscript calls with no Source-File. UI = a UI-automation script clicking or typing through `document`. Human = one of the allowed human actions.

| # | Step | Trigger | Channel |
|---|---|---|---|
| 0 | Start new game, exit tutorial, type the start command (`wget` + `run`) | — | Human |
| 1 | NUKE the 0-port servers (n00dles, foodnstuff, sigma-cosmetics, joesguns, nectar-net, hong-fang-tea, harakiri-sushi) as hacking level reaches each requirement (1–40) | hacking level | API |
| 2 | Hack/grow/weaken using home (8 GB) plus those servers (about 100 GB) | — | API |
| 3 | Buy a 32 GB cloud server, `scp` the UI driver to it, `exec` it | $1.76m | API |
| 4 | Buy TOR router: City → Alpha Enterprises → "Purchase TOR router" | $200k | UI |
| 5 | Buy port openers: terminal `buy BruteSSH.exe` and so on, up to SQLInject | TOR + money ($0.5m / 1.5m / 5m / 30m / 250m) | UI (terminal) |
| 6 | Open ports and NUKE the 1–5-port servers | programs owned | API |
| 7 | Upgrade home RAM to at least 64 GB: Alpha Enterprises → "Upgrade 'home' RAM" | $1.01m, $3.19m, $10.08m | UI |
| 8 | Backdoor CSEC, avmnite-02h, I.I.I.I, run4theh111z: terminal `connect …; backdoor` | root + hacking level ≈ 55 / 210 / 350 / 525 | UI (terminal) |
| 9 | Travel (Travel page → city → confirm) for Tian Di Hui and city factions | $200k per trip | UI |
| 10 | Buy hacknet nodes, levels, RAM and cores for Netburners | money | API |
| 11 | Accept each faction invitation from its popup | invitation fires (checked every 2 s) | UI (popup "Join") |
| 12 | Gain reputation: Faction page → "Hacking Contracts"; run `ns.share()` on spare RAM | joined | UI + API |
| 13 | Buy augmentations: Faction → Augmentations → Purchase (+ confirm) | rep + money | UI |
| 14 | Install: Augmentations page → "Install Augmentations" (+ confirm) | queue ready | UI |
| 15 | Restart the run's scripts after the reset | reset | **open question (Q1)** |
| 16 | Repeat steps 1–15 until 30 distinct augmentations are installed | — | — |
| 17 | Hold $100b at hacking 2500; accept the Daedalus invitation | Daedalus requirements | API (money) + UI (popup) |
| 18 | Reach 2.5m Daedalus rep (work, or donate once favor ≥ 150), buy The Red Pill and NFG levels, install | rep | UI |
| 19 | Rebuy TOR and programs; NUKE w0r1d_d43m0n; reach hacking 3000 | — | UI + API |
| 20 | Terminal: `connect` chain to w0r1d_d43m0n, then `backdoor` (about 3 s at hacking 3000) | hacking ≥ 3000 | UI (terminal) |
| 21 | BitVerse: wait for the cinematic, click portal `BitNode-N: …`, click `Enter BN<N>.<lvl>` → **milestone: BN1 destroyed, SF1.1** | backdoor done | UI |

---

## 2. Where the first UI-automation script can run, and when

### 2a. RAM a UI-automation script needs

- **The minimum is 26.6 GB.** The static RAM calculator adds 25 GB the first time it sees the identifier `document`, and another 25 GB for `window` ([`Script/RamCalculations.ts#L185-L192`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/RamCalculations.ts#L185-L192); `Base: 1.6`, `Dom: 25` at [`Netscript/RamCostGenerator.ts#L11-L12`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L11-L12)). A driver that uses only `document` costs 26.6 GB plus its NS calls. One that also names `window` costs at least 51.6 GB and needs a 64 GB host.
- **Using `ramOverride` to allocate less is not allowed by our rules.** `ramOverride` only has to be ≥ 1.6 GB ([`Netscript/NetscriptHelpers.tsx#L245-L255`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L245-L255)). The runtime RAM check only tracks NS functions ([`Netscript/NetscriptHelpers.tsx#L455-L469`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L455-L469)), so a DOM script allocated below 26.6 GB would probably not be caught **(inferred)**. That is "dodging the DOM RAM cost", which the rules forbid. The game itself only records `Exploit.Bypass` through the hidden `ns.bypass` check ([`NetscriptFunctions/Extra.ts#L30-L33`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Extra.ts#L30-L33)).

### 2b. Candidate hosts

| Host | RAM | How you get it | Gate |
|---|---|---|---|
| 0-port NPC servers | 4–16 GB ([`Server/data/servers.ts#L1161-L1278`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1161-L1278)) | NUKE (API) | Too small |
| zer0, neo-net, max-hardware, iron-gym | 32 GB, 1 port ([`servers.ts#L1210`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1210), [#L1232](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1232), [#L1290](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1290), [#L1349](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1349)) | BruteSSH + NUKE | BruteSSH needs TOR + terminal `buy` (UI). Creating it is blocked (3c). **Chicken and egg.** |
| Home | 8 GB at start | "Upgrade 'home' RAM" button | UI only without SF4. **Chicken and egg.** |
| **Cloud server** | any power of 2 up to 2^20 GB | `ns.cloud.purchaseServer(host, 32)` (2.25 GB, [`Netscript/RamCostGenerator.ts#L224-L234`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L224-L234)) | **API, no SF gate** ([`NetscriptFunctions/Cloud.ts#L35-L60`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Cloud.ts#L35-L60)) |

So the first UI driver runs on a **32 GB cloud server**.

### 2c. Cost curves: home RAM vs cloud servers in BN1

- **Cloud:** `ram × 55000 × CloudServerCost × CloudServerSoftcap^max(0, log2(ram) − 6)` ([`Server/ServerPurchases.ts#L23-L42`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerPurchases.ts#L23-L42); constants at [`Server/data/Constants.ts#L3-L4`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/Constants.ts#L3-L4)). BN1 leaves both multipliers at 1 ([`BitNode/BitNode.tsx#L572-L574`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L572-L574)), so it is a flat **$55k per GB at any size**. There is a limit of 25 servers, each up to 2^20 GB ([`Server/data/Constants.ts#L12-L13`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/Constants.ts#L12-L13)).
- **Home:** each doubling costs `ram × 32000 × 1.58^log2(ram) × HomeComputerRamCost` ([`PersonObjects/Player/PlayerObjectServerMethods.ts#L30-L40`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectServerMethods.ts#L30-L40)). It is bought through the UI ([`Server/ServerPurchases.ts#L168-L186`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerPurchases.ts#L168-L186)).

The table values are computed from those formulas:

| Target RAM | Cloud server (new) | Home upgrade (this step) | Home cumulative from 8 GB |
|---|---|---|---|
| 16 GB | $0.88m | $1,009,744 | $1.01m |
| **32 GB** | **$1,760,000** | $3,190,791 | $4.20m |
| 64 GB | $3.52m | $10,082,898 | $14.28m |
| 128 GB | $7.04m | $31,861,959 | $46.15m |
| 256 GB | $14.08m | $100,683,790 | $146.8m |

- **Cloud is always cheaper per GB.** Home RAM starts at $126k per added GB at 8 GB and gets dearer with each doubling.
- **Home's advantages:**
  - It survives an augmentation install. Cloud servers are deleted ([`PlayerObjectGeneralMethods.ts#L109`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L109)) and home keeps its RAM and cores ([`Server/ServerHelpers.ts#L224-L237`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerHelpers.ts#L224-L237)).
  - It can have more cores, at `1e9 × 7.5^cores` ([`PlayerObjectServerMethods.ts#L42-L44`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectServerMethods.ts#L42-L44)).
- **(Inferred) design consequence:** buy home RAM only to what the resident scripts need, which is UI driver (≥ 26.6) plus orchestrator. That is **64 GB, $14.28m**, before the first install. Every other GB goes on cloud servers, rebought after each install.
- The 32 GB driver host leaves only 5.4 GB free, so the driver should do UI work and little else.

---

## 3. What the UI must do

### 3a. Driving the terminal through the DOM

- **The input element has a stable id.** It is `id: "terminal-input"`, with the source comment "for players to hook in" ([`Terminal/ui/TerminalInput.tsx#L450`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/ui/TerminalInput.tsx#L450)).
- **Enter runs whatever is in the input's React state.** On Enter, `onKeyDown` runs `Terminal.executeCommands(value)`, where `value` is that React state ([`TerminalInput.tsx#L238-L251`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/ui/TerminalInput.tsx#L238-L251)). There is no `isTrusted` check anywhere in this path.
  - **(Inferred, standard React behaviour)** A script must set the value through the native `HTMLInputElement` value setter and dispatch a bubbling `input` event, so that React's `onChange` updates the state. It then dispatches a bubbling `keydown` with `key: "Enter"`, after a tick so the state has updated.
- **The input is disabled while a terminal action runs** (`disabled={Terminal.action !== null}`, [`TerminalInput.tsx#L442`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/ui/TerminalInput.tsx#L442)). Actions include hack, backdoor and analyze.
- **Commands can be chained with `;`** ([`Terminal/Terminal.ts#L681-L693`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L681-L693)). Any command after an action-starting one fails with "Cannot execute command … while an action is in progress" ([`Terminal.ts#L706-L707`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L706-L707)), so `backdoor` must come last in a chain.
- **Terminal actions keep running on other pages.** They advance from the engine loop regardless of the current page ([`engine.tsx#L96`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L96)).
- **`connect` only reaches adjacent servers, or ones that are backdoored or owned by you** ([`Terminal/commands/connect.ts#L22-L50`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/connect.ts#L22-L50)). A path to a deep server is typed hop by hop, for example `home; connect a; connect b; …; backdoor`. The hops can be computed with `ns.scan` (API).
- **`backdoor` needs root and `requiredHackingSkill`.** It takes hack time ÷ 4 ([`Terminal/commands/backdoor.ts#L23-L40`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/backdoor.ts#L23-L40), [`Terminal.ts#L233-L242`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L233-L242)). On w0r1d_d43m0n, finishing it routes to the BitVerse ([`Terminal.ts#L373-L386`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L373-L386)).
- **`buy` needs TOR** and buys a named program, or `-a` for all ([`Terminal/commands/buy.ts#L5-L23`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/buy.ts#L5-L23)). Prices: BruteSSH $500k, FTPCrack $1.5m, relaySMTP $5m, HTTPWorm $30m, SQLInject $250m ([`DarkWeb/DarkWebItems.ts#L6-L10`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkWeb/DarkWebItems.ts#L6-L10)).

Terminal commands the run needs: `buy <program>`, `connect <host>` / `home`, `backdoor`, and `run <script>` for relaunching (section 4).

### 3b. Pages and buttons (none of these check `isTrusted`)

| Action | Path through the UI | Source |
|---|---|---|
| Navigate | Sidebar items (Terminal, City, Travel, Factions, Augmentations, …). Factions and Augmentations only appear once you have an invitation, rumour or augmentation. | [`Sidebar/ui/SidebarRoot.tsx#L157-L169`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Sidebar/ui/SidebarRoot.tsx#L157-L169) |
| Open a location | City page: `<span aria-label={location.name}>` | [`Locations/ui/City.tsx#L61`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/City.tsx#L61) |
| TOR, home RAM, home cores | Sector-12 "Alpha Enterprises" (tech vendor) → "Purchase TOR router", "Upgrade 'home' RAM", "Upgrade 'home' cores" | [`Locations/data/LocationsMetadata.ts#L222-L230`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/data/LocationsMetadata.ts#L222-L230), [`Locations/ui/TechVendorLocation.tsx#L39-L66`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/TechVendorLocation.tsx#L39-L66), [`TorButton.tsx#L13-L49`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/TorButton.tsx#L13-L49), [`RamButton.tsx#L49-L50`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/RamButton.tsx#L49-L50), [`CoresButton.tsx#L43-L44`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/CoresButton.tsx#L43-L44) |
| Travel | Travel page → city button → confirmation, unless `SuppressTravelConfirmation` is set | [`Locations/ui/TravelAgencyRoot.tsx#L26-L46`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/TravelAgencyRoot.tsx#L26-L46), [#L70](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/TravelAgencyRoot.tsx#L70) |
| Join faction | Invitation popup → "Join" | [`Faction/ui/FactionInvitationManager.tsx#L54-L60`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/FactionInvitationManager.tsx#L54-L60), [#L83-L86](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/FactionInvitationManager.tsx#L83-L86) |
| Faction work | Faction page → "Hacking Contracts" → Work page | [`Faction/ui/FactionRoot.tsx#L58-L83`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/FactionRoot.tsx#L58-L83), [#L125-L129](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/FactionRoot.tsx#L125-L129) |
| Leave work page, keep working | "Do something else simultaneously" | [`ui/WorkInProgressRoot.tsx#L533-L534`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/WorkInProgressRoot.tsx#L533-L534) |
| Buy augmentation | Faction → Augmentations → purchase → confirmation, unless `SuppressBuyAugmentationConfirmation` is set | [`Faction/ui/AugmentationsPage.tsx#L248-L252`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/AugmentationsPage.tsx#L248-L252), [`Augmentation/ui/PurchasableAugmentations.tsx#L195-L200`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/ui/PurchasableAugmentations.tsx#L195-L200) |
| Donate | Faction page donate box (number input + button, once favor ≥ 150) | [`Faction/ui/DonateOption.tsx#L28-L36`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/DonateOption.tsx#L28-L36) |
| Install | Augmentations page → "Install Augmentations" → confirmation, unless `SuppressBuyAugmentationConfirmation` is set. Lands on the Terminal page. | [`Augmentation/ui/AugmentationsRoot.tsx#L100-L106`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/ui/AugmentationsRoot.tsx#L100-L106), [#L173-L174](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/ui/AugmentationsRoot.tsx#L173-L174), [`AugmentationHelpers.ts#L113`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L113) |
| Free hacking exp | Rothman University (Sector-12) → "Study Computer Science (free)" | [`Locations/ui/UniversityLocation.tsx#L51`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/UniversityLocation.tsx#L51) |
| Choose next BitNode | BitVerse portal `aria-label="BitNode-N: <name>"` → modal button `aria-label="enter-bitnode-N"` ("Enter BN N.lvl") | [`BitNode/ui/BitverseRoot.tsx#L93-L102`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/ui/BitverseRoot.tsx#L93-L102), [`PortalModal.tsx#L117-L131`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/ui/PortalModal.tsx#L117-L131) |

- **Dialog boxes pile up.** TOR, cloud servers, installs and faction work all pop dialog boxes. **(Inferred)** Programmatic `.click()` targets an element directly and ignores overlays, so open dialogs should not block later clicks. They would accumulate, though, and this is unverified at runtime.
- **Settings worth flipping once through the Options page:** `SuppressBuyAugmentationConfirmation` and `SuppressTravelConfirmation` ([`Settings/Settings.ts#L55-L63`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Settings/Settings.ts#L55-L63)). Leave `SuppressFactionInvites` **off**, because the invitation popup is the only way to join (3c).

### 3c. Actions the UI cannot do (`isTrusted` guards)

These handlers return early for scripted events. The guard does not flag an exploit; the event simply does nothing.

| Blocked action | Source | Consequence |
|---|---|---|
| Create a program | [`Programs/ui/ProgramsRoot.tsx#L96`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Programs/ui/ProgramsRoot.tsx#L96), [#L108](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Programs/ui/ProgramsRoot.tsx#L108) | Port openers must be **bought** after TOR, and rebought after every install. |
| Join from the Factions page | [`Faction/ui/FactionsRoot.tsx#L88-L94`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/ui/FactionsRoot.tsx#L88-L94) | The popup is the only way to join (below). |
| Company work and infiltration | [`Locations/ui/CompanyLocation.tsx#L61-L73`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/CompanyLocation.tsx#L61-L73) | No company reputation, so no megacorp factions (ECorp, MegaCorp, NWO, Blade, Clarke, OmniTek, 4Sigma, KuaiGong, Bachman, Fulcrum) and no Silhouette. |
| Crime | [`Locations/ui/SlumsLocation.tsx#L24-L29`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/SlumsLocation.tsx#L24-L29) | No karma from crime, so no Slum Snakes, Tetrads, Syndicate, Dark Army or Speakers ([`FactionInfo.tsx#L601-L668`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L601-L668)). |
| Infiltration keys | [`Infiltration/ui/InfiltrationRoot.tsx#L74`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Infiltration/ui/InfiltrationRoot.tsx#L74) | No infiltration money or Shadows of Anarchy augmentations. |
| Hospital, casino | [`HospitalLocation.tsx#L23`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Locations/ui/HospitalLocation.tsx#L23), [`Casino/utils.ts#L5`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Casino/utils.ts#L5) | No casino money. |

**Invitation popup rules:**
- Invitations are checked every 10 cycles, i.e. every 2 s ([`engine.tsx#L177-L183`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L177-L183)).
- `inviteToFaction` emits the popup event only on the first invitation, and only if `SuppressFactionInvites` is off ([`Faction/FactionHelpers.tsx#L25-L33`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionHelpers.tsx#L25-L33)).
- The popup is a queue in React state. **(Inferred)** A page reload therefore loses it, and the Join button on the Factions page is trusted-only. **The driver must accept each invitation while its popup is up.** A faction that is still pending after a reload stays unjoinable until the next install, when invitations reset.
- The popup is hidden, but still queued, while on the BitVerse, Infiltration, Recovery or ImportSave pages ([`ui/GameRoot.tsx#L238-L244`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/GameRoot.tsx#L238-L244), [#L561](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/GameRoot.tsx#L561)).

### 3d. Focus

- **Unfocused work earns 0.8× reputation and exp.** Faction work is multiplied by `focusPenalty()`: 0.8 when not focused, unless **Neuroreceptor Manager** is installed ([`Work/FactionWork.tsx#L37-L40`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/FactionWork.tsx#L37-L40), [`PlayerObjectGeneralMethods.ts#L622-L628`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L622-L628), [`Constants.ts#L87`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L87)).
- **Leaving the Work page ends focus** ([`ui/GameRoot.tsx#L269-L275`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/GameRoot.tsx#L269-L275)). Every terminal command or shop visit costs focus.
- **Neuroreceptor Manager** (Tian Di Hui, 75k rep, $550m, [`Augmentations.ts#L1229`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1229)) is therefore worth more to a UI-driven run than its stats suggest **(inferred)**.

---

## 4. Getting scripts running again after a reset, without Singularity

- **The UI Install button kills every script.** It calls `prestigeWorkerScripts()` and lands on the Terminal page ([`AugmentationHelpers.ts#L69-L114`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L69-L114)). Entering a BitNode from the BitVerse does the same.
- **There is no callback without Singularity.** The callback-script path only exists for `ns.singularity.*`, which requires SF4 (see the prior research).
- **Autoexec only fires on game load.** `Settings.AutoexecScript` ([`Settings.ts#L15`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Settings/Settings.ts#L15)) is used by `loadAllRunningScripts`, which `engine.tsx` calls on load ([`NetscriptWorker.ts#L185-L211`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L185-L211), [#L251-L257](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L251-L257), [`engine.tsx#L277`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L277)). It does **not** fire on an install. Loading also restarts every script that was running at the last save, and autosave runs every 60 s by default ([`engine.tsx#L225-L234`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L225-L234)).
  - **(Inferred)** So after a page reload the run may resume with no retyping at all, as long as the last save happened while the orchestrator was running. Setting `AutoexecScript` to the boot script (Options → System) makes that more robust.
- **`atExit` handlers run during the reset's kill pass, while `ns` is still usable.** `prestigeWorkerScripts` calls `killWorkerScript` on each script ([`NetscriptWorker.ts#L40-L46`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L40-L46)), which runs the handlers before setting `stopFlag` ([`Netscript/killWorkerScript.ts#L63-L91`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/killWorkerScript.ts#L63-L91)).
  - A script started from `atExit` would not survive. The kill loop iterates a live `Map`, and `prestigeHomeComputer` then clears what remains on home **(inferred from [`ServerHelpers.ts#L238-L256`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerHelpers.ts#L238-L256))**.
  - **The candidate mechanism:** the UI driver's `atExit` (or any pending timer) schedules a `setTimeout` that later types `run boot.js` into `#terminal-input`, using the `document` reference it already holds.
  - That code runs after its script has died and holds no RAM. The game would not flag it **(inferred: no exploit check covers it)**. Whether our rules count it as "dodging the DOM RAM cost" is open question Q1.
- **What a reset wipes, so the boot script must rebuild it:** TOR (home's network links are cleared, [`ServerHelpers.ts#L224-L231`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/ServerHelpers.ts#L224-L231); `hasTorRouter` checks those links, [`PlayerObjectServerMethods.ts#L14-L16`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectServerMethods.ts#L14-L16)), every program except NUKE, all cloud servers, and all invitations and memberships.
- **Two augmentations re-grant programs on every install:** CashRoot (Sector-12) gives BruteSSH ([`Augmentations.ts#L320-L327`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L320-L327)), and Neurolink (BitRunners) gives FTPCrack and relaySMTP ([`Augmentations.ts#L1203-L1216`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1203-L1216)).

---

## 5. Faction and augmentation path to The Red Pill

### 5a. The Red Pill and Daedalus in BN1

- **BN1 uses the default multipliers** ([`BitNode.tsx#L572-L574`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNode.tsx#L572-L574)): `DaedalusAugsRequirement = 30`, `WorldDaemonDifficulty = 1`, `HackingLevelMultiplier = 1` ([`BitNode/BitNodeMultipliers.ts#L61`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L61), [#L103](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L103), [#L180](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/BitNode/BitNodeMultipliers.ts#L180)).
- **Daedalus invite:** `haveAugmentations(30)`, `haveMoney(100e9)`, and hacking 2500 or all combat stats 1500 ([`FactionInfo.tsx#L138-L149`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L138-L149)).
  - `haveAugmentations` counts `p.augmentations.length`, i.e. installed only ([`Faction/FactionJoinCondition.ts#L116-L132`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionJoinCondition.ts#L116-L132)).
  - NeuroFlux Governor occupies **one** entry whatever its level ([`AugmentationHelpers.ts#L54-L66`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L54-L66)).
  - The invitation is granted at one 2 s check and then persists until the next reset ([`PlayerObjectGeneralMethods.ts#L453-L466`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L453-L466)). So $100b only has to be on hand for an instant.
- **The combat route is out of reach (inferred).** No reachable augmentation boosts combat stats, so 1500 combat would need about e^((1500+200)/32) ≈ 1e23 exp per stat. The Covenant (combat 850) and Illuminati (combat 1200) are out of reach for the same reason ([`FactionInfo.tsx#L132`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L132), [#L167](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L167)).
- **The Red Pill:** 2.5m rep, $0 ([`Augmentations.ts#L1946-L1953`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1946-L1953)). It only does anything once **installed**, which connects w0r1d_d43m0n ↔ The-Cave ([`Prestige.ts#L173-L181`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Prestige.ts#L173-L181)).

### 5b. Alternatives checked and ruled out for BN1

- **Darknet labs:** `getLabyrinthDetails()` returns `lab: null` unless `hasFullDarknetAccess()`, which is true only in BN15 or with SF15 ([`labyrinth.ts#L485-L497`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L485-L497), [`effects.ts#L280`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L280)). The network generator only attaches a lab when one exists ([`DarkNet/controllers/NetworkGenerator.ts#L225-L231`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkGenerator.ts#L225-L231)). DarkscapeNavigator.exe alone gives no lab.
  - Even with access, outside BN15 The Red Pill is the **seventh** lab, after Broken Wings, Boots, Hammer, Staff, Law and Sword. Each lab requires the previous lab's augmentation to be installed, and the Red Pill lab needs **4000 charisma** ([`labyrinth.ts#L37-L110`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L37-L110), [#L403-L473](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/labyrinth.ts#L403-L473)).
  - Lab rewards are queued, not installed ([`DarkNet/effects/cacheFiles.ts#L173-L180`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/cacheFiles.ts#L173-L180)).
  - This agrees with the BitNode survey for #3 (`docs/research/bitnode-survey.md` on branch `research/bitnode-survey`): outside BN15 the darknet-lab Red Pill needs SF15, so a first BN1 doesn't have it. It also corrects the prior research, which said only that DarkscapeNavigator.exe grants darknet access. That is true for the `ns.dnet` API, but not for the labs.
- **Gang (BN2) and Bladeburner (BN6/7):** not available in BN1 without those Source-Files (prior research).

### 5c. Reachable factions and augmentations

| Faction | Invite requirement (v3.0.1) | Channel |
|---|---|---|
| CyberSec | Backdoor CSEC: 1 port, hacking 51–60 ([`FactionInfo.tsx#L489`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L489), [`servers.ts#L1502`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1502)) | terminal backdoor |
| NiteSec | Backdoor avmnite-02h: 2 ports, 202–220 ([`FactionInfo.tsx#L464-L466`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L464-L466), [`servers.ts#L1468`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1468)) | terminal backdoor |
| The Black Hand | Backdoor I.I.I.I: 3 ports, 340–365 ([`FactionInfo.tsx#L419`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L419), [`servers.ts#L1449`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1449)) | terminal backdoor |
| BitRunners | Backdoor run4theh111z: 4 ports, 505–550 ([`FactionInfo.tsx#L402`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L402), [`servers.ts#L1430`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1430)) | terminal backdoor |
| Tian Di Hui | In Chongqing, New Tokyo or Ishima; hacking 50; $1m ([`FactionInfo.tsx#L683-L687`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L683-L687)) | travel (UI) |
| Netburners | Hacking 80; hacknet totals of 100 levels, 8 GB RAM, 4 cores ([`FactionInfo.tsx#L675`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L675)) | hacknet (API) |
| Sector-12 / Aevum | In the city; $15m / $40m. Enemies of the eastern cities and Volhaven ([`FactionInfo.tsx#L495-L553`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/FactionInfo.tsx#L495-L553)) | travel (UI) |
| Chongqing / New Tokyo / Ishima | In the city; $20m / $20m / $30m. Enemies of Sector-12, Aevum and Volhaven | travel (UI) |
| Volhaven | In the city; $50m. Enemy of all other cities | travel (UI) |
| Daedalus | See 5a | API money + UI |

- **What these factions offer:** 47 distinct non-special augmentations, tallied from [`Augmentation/Augmentations.ts`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts) (city enemy rules apply within a single reset). Daedalus adds six more (ENMCoreV3, ENMDMA, ENMAnalyzeEngine, SubdermalArmor, SynfibrilMuscle, SyntheticHeart), plus NeuroFlux Governor.
- **Combined multipliers of all 47:**

  | Multiplier | Product |
  |---|---|
  | hacking | 3.79 |
  | hacking_exp | 5.59 |
  | hacking_money | 4.68 |
  | hacking_speed | 1.41 |
  | hacking_chance | 1.44 |
  | faction_rep | 1.36 |

- **The augmentations that matter most for the hacking multiplier:** CSP G5 (×1.30, BitRunners, 250k rep), Neurolink (×1.15, 875k), ABNN (×1.12, 275k), NeuralAccelerator (×1.10, 200k), TheBlackHand (×1.10, 100k), CSP G1–G3, ENM, ENMCore/V2, EMS, CRTX42AA, BitWire.
- **Cheap filler to reach 30:** the five Netburners hacknet augmentations (1.9k–12.5k rep, $4.5m–60m), plus the Tian Di Hui, Sector-12 and Aevum low-tier augmentations.
- **NeuroFlux Governor** is sold by every faction except Shadows of Anarchy, Bladeburners and Church of the Machine God ([`Augmentations.ts#L1196-L1201`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/Augmentations.ts#L1196-L1201)). Each level gives about ×1.01 to hacking, hacking exp and faction rep. Its cost scales by 1.14 per level for both rep and money ([`AugmentationHelpers.ts#L133-L138`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L133-L138), [`Constants.ts#L36`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L36)).
- **Money price climbs ×1.9 for every augmentation already queued in a reset** ([`AugmentationHelpers.ts#L29-L37`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L29-L37), [#L155-L158](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Augmentation/AugmentationHelpers.ts#L155-L158), [`Constants.ts#L41`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L41)). Reaching 30 installed augmentations therefore takes several install cycles. How to split them across cycles is the map's open "When to install augmentations" item.

### 5d. Reputation sources

- **Hacking contracts** earn `(hacking / 975) × faction_rep × (1 + favor/100) × shareBonus` per 200 ms cycle, times 0.8 if unfocused ([`PersonObjects/formulas/reputation.ts#L8-L24`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/reputation.ts#L8-L24), [`Constants.ts#L16`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L16)).
  - `shareBonus = 1 + ln(sharedThreads)/25` ([`NetworkShare/Share.ts#L43-L49`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetworkShare/Share.ts#L43-L49)). That is about ×1.55 at 1e6 threads.
- **Donation** gives `rep = money / 1e6 × faction_rep`, once faction favor ≥ 150 ([`Faction/formulas/donation.ts#L8-L18`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/formulas/donation.ts#L8-L18), [`Constants.ts#L31-L33`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L31-L33)).
  - Favor is converted from rep at reset: `favor = log1p(rep/25000)/log(1.02)`, so 150 favor needs **462,490** rep accumulated across previous memberships ([`Faction/formulas/favor.ts#L12-L20`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Faction/formulas/favor.ts#L12-L20)).
  - With favor ≥ 150, The Red Pill costs about $1.8e12 in donations at faction_rep 1.36.
- **(Inferred) Two ways to the 2.5m Daedalus rep:**
  - Work the whole 2.5m in one Daedalus membership.
  - Work about 462k, install (Daedalus favor reaches 150), meet the invite requirements again (30 augmentations kept, $100b, hacking 2500), then donate. Section 7 compares the two.

---

## 6. Hacking level to 3000 × WorldDaemonDifficulty

- **The target is 3000.** BN1 difficulty is 1. w0r1d_d43m0n's `requiredHackingSkill` is 3000 × `WorldDaemonDifficulty` ([`servers.ts#L1530-L1540`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1530-L1540); prior research for the multiplication).
- **The skill formula** is `L = floor(M × (32·ln(exp + 534.6) − 200))`, where M is the player's hacking multiplier × `HackingLevelMultiplier` ([`skill.ts#L7-L15`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/formulas/skill.ts#L7-L15)). Inverted, `exp = e^((L/M + 200)/32) − 534.6`.
- **Exp needed**, computed from that formula:

| M (hacking mult) | Example | exp for 2500 | exp for 3000 |
|---|---|---|---|
| 3.00 | ~30 augmentations without the BitRunners top tier | 1.1e14 | 1.9e16 |
| 3.79 | all 47 reachable augmentations, no NFG | 4.6e11 | 2.9e13 |
| 4.19 | + 10 NFG | 6.6e10 | 2.8e12 |
| 4.62 | + 20 NFG | 1.1e10 | 3.3e11 |
| 5.11 | + 30 NFG | 2.3e9 | 4.8e10 |
| 6.23 | + 50 NFG | 1.4e8 | 1.8e9 |

- **Exp sources:**
  - Each hack, grow or weaken thread gives `(3 + 0.3 × baseDifficulty) × hacking_exp` ([`Hacking.ts#L30-L38`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacking.ts#L30-L38)). A failed hack gives a quarter of that (terminal and NS code; see the prior research).
  - Operation time scales as `(2.5 × req × security + 500) / (L + 50) / hacking_speed`. Weaken takes 4× hack time and grow 3.2× ([`Hacking.ts#L60-L80`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacking.ts#L60-L80)).
  - **(Inferred)** Low-requirement, low-security servers such as joesguns or foodnstuff therefore give far more exp per thread-second than endgame servers. Exp per second grows roughly with total threads × (L + 50).
- **Everything resets at each install.** Exp, skills and money go back to the start ([`PlayerObjectGeneralMethods.ts#L80-L141`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L80-L141)). The climb to 3000 happens **from zero in the final reset**, the one after The Red Pill is installed, using that reset's M. Buying many NFG levels in the same reset as The Red Pill shortens that last climb **(inferred)**.
- **The final backdoor is short.** w0r1d_d43m0n has `hackDifficulty: 0`, which is raised to its minimum of 1 ([`servers.ts#L1530-L1540`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1530-L1540), [`Server/Server.ts#L83-L93`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/Server.ts#L83-L93)). At hacking 3000 the hack time is about 13 s ÷ hacking_speed, so the backdoor (÷ 4) takes **about 3 s**.

---

## 7. Estimates (assumptions shown)

These are model outputs, not facts read from the code. Each should be replaced by measured splits once a reliable run exists.

**E1. Time to the first UI-capable host ($1.76m).**
- Model: [`earlysim.py`](#appendix-earlysim-model). Assumptions:
  - Every rooted 0-port server runs as many 1.7 GB `hack` threads as fit, each against itself.
  - Home keeps 4.5 GB for the orchestrator and hacks foodnstuff with the rest.
  - No grow or weaken. Expected-value chance and steal per completed hack, using the v3.0.1 formulas.
  - Servers unlock at their hacking requirement.
- Results:

  | Money reached | Time | Hacking level |
  |---|---|---|
  | $0.25m | 3.3 min | 13 |
  | $1.0m | 7.1 min | 38 |
  | **$1.76m** | **≈ 10 min** | 53 |
  | $4.2m | 17.7 min | 81 |
- The model plateaus near $12m because it never grows money back.
- Reading: a 32 GB cloud server is affordable at about **10 minutes** with a naive script. A grow/weaken-aware script should beat that, but even a naive one gets there inside the first quarter-hour.

**E2. After the driver exists.**
- TOR + BruteSSH ($0.7m) unlocks the four 32 GB 1-port servers (+128 GB of hacking RAM, and money pools of $5m–20m that grow to 25×).
- Home to 64 GB ($14.28m) should come before the first install.
- **(Inferred)** Without measurements I put these at tens of minutes, not hours.

**E3. Reputation for The Red Pill by working.**
- Assumptions: hacking about 2500–3000, faction_rep about 1.36 × NFG, share bonus about 1.5, focused or Neuroreceptor Manager installed.
- Result: about 4–6.5 rep per cycle, i.e. 20–33 rep/s, so **about 21–35 h** for 2.5m.
- The two-membership route (work 462k → install → donate about $1.8e12) needs about 4–6 h of work plus one more install cycle and the money. Which is faster depends on late-game income, which the money-engine ticket owns.
- **The Red Pill rep is likely the longest single stretch of BN1.**

**E4. Exp throughput for the final climb.**
- Assumptions: about 5–10 exp per thread per second at L ≈ 1000 on low-requirement targets with hacking_exp ≈ 5.6 and hacking_speed ≈ 1.4, scaling with (L + 50).
- 1e6 threads is about 1.75 PB, roughly 1.7 maxed cloud servers at $57.7b each. That gives roughly 5e6–2.5e7 exp/s.
- **(Inferred)** The 4.8e10 exp needed at M = 5.11 then takes about 30–90 min. The 2.9e13 at M = 3.79 takes days, which is why NFG levels matter so much.

---

## Not verified from source, or inferred

- **Runtime behaviour of the DOM techniques:**
  - the React value-setter + `input` + `keydown` recipe for the terminal;
  - whether `.click()` works through stacked dialog backdrops;
  - the delay before the terminal input exists after an install or a BitVerse transition.
- **That a reload loses the invitation popup queue.** It lives in React state and is only emitted from `inviteToFaction`. I did not test it.
- **That a `setTimeout` scheduled from `atExit` survives the reset and can type into the terminal.** The code paths support it, but I did not test it.
- **All of section 7.**
- **The hacking-exp ranking of targets** (hack vs grow vs weaken for exp). The formulas are cited, but I didn't optimise; that belongs to the money-engine ticket.
- **Darknet caches as a source of negative karma.** Opening a cache does `Player.karma -= difficulty + 1` ([`cacheFiles.ts#L34-L38`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/cacheFiles.ts#L34-L38)), and `ns.dnet` works with DarkscapeNavigator.exe ($50m). That might open the crime factions (Slum Snakes −9, Tetrads −18, Syndicate −90 karma) without crime. I did not trace how far the karma goes or the combat-stat requirements (gym training is UI, no `isTrusted` guard).

## Open questions

1. **Rules: is a DOM callback that outlives its script allowed?** That is an `atExit` or pending `setTimeout` that types `run boot.js` after an install or BitNode change, when the script that paid the 25 GB is already dead. If not, every install and every BitNode entry needs a human retype, which the human-action list does not allow except after a page reload.
2. **Rules: is getting `window` through `document.defaultView` dodging the second 25 GB?** It decides whether the driver fits in 32 GB or needs 64 GB.
3. **How many install cycles to 30 augmentations, and in what order,** given the ×1.9 per-queued-aug price and the rep tiers (the map's "When to install augmentations").
4. **The Red Pill rep: one long Daedalus membership, or two memberships with donation?** This depends on late income (E3).
5. **How many NFG levels to buy with The Red Pill** to minimise reputation-grind time plus the final climb (E4).
6. **Whether the darknet-karma route opens the crime factions** and their augmentations cheaply enough to matter in BN1.
7. **Whether accepting invitations immediately has costs:** joining a city faction bans its enemies until the next install. The driver needs a per-reset faction plan before it clicks Join.

---

## Appendix: earlysim model

The E1 model is a ~100-line expected-value simulation written for this research. It is not committed. Its formulas are exactly those cited in [section 6](#6-hacking-level-to-3000--worlddaemondifficulty) and `calculateHackingChance` / `calculatePercentMoneyHacked` ([`Hacking.ts#L1-L58`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacking.ts#L1-L58)). Server data comes from [`servers.ts#L1161-L1278`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/data/servers.ts#L1161-L1278). It should be rebuilt as a unit-tested pure module when the money engine is designed.
