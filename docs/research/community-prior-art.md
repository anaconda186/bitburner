# Community speedrun and automation prior art, and what carries over to 3.0

Research date: 2026-10-28. Ticket: #4 (part of map #1).

**Question.** What did the best-known community Bitburner full-automation scripts do about BitNode order, when to install augmentations, making money, getting through the early game with no Source-Files, and surviving resets? Which of those ideas still hold on the target version (v3.0.1), and which depended on 2.x behaviour that has since changed?

**Method.** I downloaded each repo as a tarball at a fixed commit into a scratch folder, read the README and the code, and never ran any of it. I checked compatibility and exploit questions against the game source at tag v3.0.1 and against `docs/research/bitburner-current-state.md` (the "current-state doc"). We reuse ideas only, never code.

**Link conventions.** Every code link is pinned to a commit SHA:

| Short name | Repo | Commit read | Last commit date |
|---|---|---|---|
| **alain** | [alainbryden/bitburner-scripts](https://github.com/alainbryden/bitburner-scripts) (751★) | [`7a8951a`](https://github.com/alainbryden/bitburner-scripts/tree/7a8951a1987c0734ae3035894a25c9495e2b28d1) | 2026-05-04 |
| **cyguin** | [cyguin/bitburner-scripts](https://github.com/cyguin/bitburner-scripts) (fork of alain) | [`4e946a5`](https://github.com/cyguin/bitburner-scripts/tree/4e946a5cfa071ddf1593993e5c9dfcd78956e495) | 2026-08-16 |
| **quack** | [quacksouls/bitburner](https://github.com/quacksouls/bitburner) | [`90ca831`](https://github.com/quacksouls/bitburner/tree/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7) | 2023-08-16 |
| **bitwalk** | [quacksouls/bitwalk](https://github.com/quacksouls/bitwalk) (walkthrough) | [`1fa1e80`](https://github.com/quacksouls/bitwalk/tree/1fa1e805c446b5df885770ddb5131bb8fce688ef) | 2023-06-16 |
| **kamukrass** | [kamukrass/Bitburner](https://github.com/kamukrass/Bitburner) (90★) | [`7fdb738`](https://github.com/kamukrass/Bitburner/tree/7fdb7383e3c727d4c419d6dbd6fea18854d9e5ef) | 2022-04-20 |
| **chrisrabe** | [chrisrabe/bitburner-automation](https://github.com/chrisrabe/bitburner-automation) (155★) | [`cb6725c`](https://github.com/chrisrabe/bitburner-automation/tree/cb6725c4e415908c57e61f2e65b8a9603878a78d) | 2024-01-30 |
| **mughur** | [Mughur/BBScripts](https://github.com/Mughur/BBScripts) | [`d04232c`](https://github.com/Mughur/BBScripts/tree/d04232cc92e10a19671588d5f949f0d16acfec87) | 2023-03-18 |
| **boyce** | [boycepoleonjr/bitburner](https://github.com/boycepoleonjr/bitburner) (v3, hacking-only) | [`8489de1`](https://github.com/boycepoleonjr/bitburner/tree/8489de18e24ee5faa19f29771e8c178a5ce4785c) | 2026-10-11 (merge of PR #16) |
| **umb** | [UnderMyBed/bitburner-agent](https://github.com/UnderMyBed/bitburner-agent) (v3, pre-alpha) | [`7990834`](https://github.com/UnderMyBed/bitburner-agent/tree/7990834f0358584fd0868f13b99e72e972046ca5) | 2026-10-28 |
| **game** | [bitburner-official/bitburner-src](https://github.com/bitburner-official/bitburner-src) tag v3.0.1 | [`3162fd2`](https://github.com/bitburner-official/bitburner-src/tree/3162fd2590e221eadd0c0fbd46151913f7c4c41c) | 2026-05-17 |

v3.0.0 shipped on 1 May 2026 ([changelog](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/changelog.md)). Only alain, cyguin, boyce and umb were committed to after that date.

---

## Summary

1. **There is no Bitburner speedrun leaderboard.** The speedrun.com API returns no game for "bitburner" (checked 2026-10-28). No repo I found publishes split times. The closest thing to a benchmark is boyce's own measured v3 run log ([§2.5](#25-boyce-v3-hacking-only-automation-with-measured-times)).
2. **Everyone builds around one big suite.** alainbryden's `autopilot.js` + `daemon.js` is the reference design. The active v3 projects (cyguin, umb, and boyce in spirit) fork it, vendor it, or copy its structure. It was updated for 3.0 within days of the release and runs on 3.0.1 with a few small faults (§2.1.6).
3. **No community project takes a fresh save to the end of BN1.1 with no human actions.** alain's README calls SF4 "not required, but highly-recommended". Without SF4, autopilot only hacks and stops at 8 GB home; the human buys RAM, joins factions, buys and installs augmentations, and destroys the BitNode ([autopilot.js#L446-L450](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L446-L450), [#L1095-L1112](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L1095-L1112)). quack says "most of your game play would be manual" before SF4. Only umb is attempting the no-SF4 path through the page, and it is unfinished and dodges the DOM RAM cost.
4. **The BitNode order is consensus at the front, then diverges.** Every automation-minded source puts **BN1 and then BN4 up to SF4.3 first**, because Singularity RAM is 16×/4×/1×. alain lists 4.3, 1.2, 5.1, 1.3, 2.1, then 10, 8, 13, 7, 9, 14. quack does BN1.1 → BN4.1–4.3. boyce does 1, 4, 2, 5, 10, 9, 3, … . The in-game guide (dev-maintained) warns that BN4 is harsh with only SF1 and recommends repeating BN1 first. boyce's measured BN4.1 took about 158 h.
5. **The install heuristic is consensus in shape.** Install at once when The Red Pill is affordable. Otherwise install when you can afford about N new augmentations, where N falls the longer you have been in the reset. Buy the most expensive first, because each purchase raises every later price by ×1.9. Put NeuroFlux Governor last. Liquidate stocks and spend leftovers on home RAM just before installing. alain adds countdowns and "don't reset now" vetoes. boyce learned the hard way to **stop installing once the World Daemon is in reach**: hacking resets on every install, and it cost a 57 h tail in BN4.
6. **The money engines are, in order of how widely they are used:** HWGW batching with `additionalMsec` timing; stocks (a pre-4S forecaster, then 4S, plus hack/grow stock manipulation); the casino's $10b, which resets every aug install; hacknet with payback-time gates; crime for karma and gangs; and corporations, which almost no full-automation suite has. alain's own BN-order comment says it skips corps.
7. **Surviving resets is consensus too.** The orchestrator passes **itself as the callback** to `installAugmentations` / `destroyW0r1dD43m0n`. It works out where it is from game state (`getResetInfo`) and a few text files on home, and it keeps the main script small by pushing every expensive call into a temporary single-purpose script. All of these carry over.
8. **What 3.0 broke in this prior art** is mostly naming (`ns.cloud.*`, `ns.nFormat`, fuzzy enums, `.script`), which only the 2022–2024 repos still trip on. A few behaviour changes matter even to alain on 3.0.1: `darkweb` is gone from `scan`, hacknet RAM is now per function, and TIX no longer needs WSE. 3.0 also added things the old scripts never use: sleeve purchase APIs, `hasTorRouter`, and the whole darknet/BN15. alain has no BN15 or darknet code at all, so it cannot reach the finish line as written. Old infiltration-based money strategies are stale (rebalanced in #2210).
9. **Several common techniques break our rules.** They must not be copied:
   - **Dodging the DOM RAM cost** with `eval("document")` or `globalThis["document"]`. This is in alain (casino, stockmaster, stats, scan), quack, bitwalk, cyguin, chrisrabe, mughur, and umb's whole UI driver.
   - **Opening the dev menu**, which the game records as an exploit (chrisrabe's `dev-tools`).
10. **Two widespread techniques are grey areas that need a decision:**
    - **Faking `isTrusted: true`** by calling React's `onClick` directly. The game doesn't record it, but it gets past deliberate guards on crime, company work, faction invites, program creation, infiltration and the casino.
    - **Casino save-scumming by forcing a page reload.**

    §3.4 sets out both.

---

## 1. Repos examined

I found candidates with `gh search repos` (by stars and by recent activity) and with code search for `destroyW0r1dD43m0n`. Then I picked the ones that try to play the whole game, plus the most-starred older suites. I list but did not inspect:
- Script libraries that don't orchestrate a run, such as Snarling's (its README says "pending major rewrites") and xxxsinx.
- Corp-only or batcher-only code.

| Repo | Scope | Plays without a human? | 3.0-aware? |
|---|---|---|---|
| alain | Everything except corp and darknet | Only with SF4 | Yes (v2/v3 shim) |
| cyguin | alain + BN12 loop, BN15 darknet worm | Only with SF4 | Yes |
| quack (+ bitwalk) | Chain-loaded scripts, all main mechanics incl. corp | Only with Singularity (BN4 or SF4) | No (2023) |
| kamukrass | Hacking, stocks, corp, gang, faction work | Partly; never installs | No (pre-2.0 API) |
| chrisrabe | Video-series scripts: hacking, hacknet, corp | No orchestrator | No |
| mughur | Personal collection by a well-known Discord helper | Partly | No (`.script`, 2.x) |
| boyce | Hacking-only v3 stack, run by an AI agent | Needs SF4; owns SF4.1 | Yes |
| umb | External "brain" + tiny in-game agent + simulator | Goal is yes, from a fresh save; in progress | Yes (pins v3.0.1) |

---

## 2. Per repo

### 2.1 alain: alainbryden/bitburner-scripts

This is the de facto reference. `autopilot.js` is the "master orchestrator". It launches `daemon.js`, the hacking engine, which in turn launches about 20 helper scripts ([README](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/README.md)).

#### 2.1.1 BitNode order

`defaultBnOrder` in [autopilot.js#L47-L81](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L47-L81) is a list of SF targets, played in order until each is reached:

> 4.3, 1.2, 5.1, 1.3, 2.1, | 10.1, 8.2, 13.1, 7.1, 9.1, 14.2, | 2.3, 5.3, 11.3, 14.3, 13.3, 9.2, 9.3, 10.3, | 6.3, 7.3, | 8.3, 3.3, 12.9999

The comments give the reasons:
- **4.3 first**, "need singularity to automate everything".
- **1.2** is "easy … big boost to all multipliers".
- **5.1** for Intelligence and Formulas.
- **2.1** because gangs "reduce the need to grind faction and company rep".
- **10.1** for sleeves.
- **8.2** because stocks are "never nerfed".
- **Bladeburner late**, because it can't run alongside player work.
- **BN3 last**: "I have no corp scripts … in 2021, corps were too exploity … Autopilot will win normally while ignoring corps".
- **12.9999** means "keep playing forever".

BN15 is absent. The list is written for a player who already holds SF1.1 (BN1.1 is implied as the start), and `--next-bn` overrides it ([#L176-L187](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L176-L187)).

#### 2.1.2 When it installs augmentations

`maybeInstallAugmentations` ([autopilot.js#L822-L968](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L822-L968)) reads the output of `faction-manager.js` and resets when any of these holds:

- **The Red Pill is affordable** (`--install-for-augs`, default `["The Red Pill"]`).
- **At least 8 new non-NeuroFlux augs are affordable, or 12 counting NeuroFlux levels** ([#L10-L11](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L10-L11)).
  - Each threshold rises by 1 per SF11 level.
  - Each threshold falls by **0.5 per hour since the last install** (`--reduced-aug-requirement-per-hour`, [#L847-L854](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L847-L854)).
- **Quick install:** 4 or more augs (6 in a gang) are affordable within the first 20 minutes of a reset. The countdown then drops to 30 s ([#L889-L902](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L889-L902)).
- **Daedalus favour:** we have enough Daedalus rep to unlock donations after the next reset ([#L879-L887](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L879-L887)).

Then two more steps:

- **Momentum countdown.** A 5-minute countdown starts and money is reserved. Each time more augs become affordable, the timer restarts with a shrinking extension ([#L916-L948](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L916-L948)).
- **Vetoes** ([`shouldDelayInstall`, #L979-L1039](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L979-L1039)). It doesn't install when:
  - a graft is in progress;
  - net worth is at least 90% of the 4S TIX API cost;
  - it is saving for the Daedalus invite;
  - BN10 is close to the last sleeve;
  - BN8 or the first BN9 reset applies, with their special rules.

`ascend.js` ([#L28-L208](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/ascend.js#L28-L208)) then runs a fixed pre-install sequence:
1. Kill all other scripts and stop the current action. Clear the money reserve.
2. Liquidate stocks and hashes.
3. (Optionally) home RAM.
4. Accept Stanek's Gift.
5. Buy the planned augs.
6. Home RAM.
7. WSE, TIX and 4S.
8. Sleeve augs, then gang equipment, then home cores.
9. Join all pending invites.
10. Wait until money stops falling.
11. Buy any remaining junk augs.
12. `installAugmentations(callback)`, or `softReset` when nothing was bought.

Purchase order (in `faction-manager.js`): most expensive first, with prerequisites ahead of what needs them. The total cost is modelled as `price × 1.9^i` ([#L552](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/faction-manager.js#L552)), and the 1.9 factor falls with SF11 ([#L136](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/faction-manager.js#L136)).

#### 2.1.3 Money engine

**HWGW batcher (daemon.js):**
- Workers are tiny one-shot scripts. Each takes a target start time, sleeps by passing the difference as `additionalMsec` to `hack`/`grow`/`weaken`, and optionally sets `stock: true` ([Remote/hack-target.js#L15-L40](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/Remote/hack-target.js#L15-L40)).
- Defaults:
  - 4 s cycle spacing (`--cycle-timing-delay 4000`), up to 40 batches in flight.
  - Steal at most 75%.
  - 32 GB of home kept free ([daemon.js#L39-L58](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L39-L58)).
- Targets start at 2 servers and grow with network RAM.
- At hacking 8000 it switches to tight 40 ms spacing ([autopilot.js#L600-L603](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L600-L603)). A long-lived "looping mode" exists but is disabled: "LOOPING MODE DISABLED UNTIL WORKING BETTER" ([#L594](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L594)).
- Every 55 minutes it spends 5 minutes in `--xp-only` mode. It stays there once hacking reaches 75% of the World Daemon requirement, or 75% of 2500 while waiting on Daedalus ([#L606-L631](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L606-L631), [#L397-L400](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L397-L400)).
- Spare RAM goes to `share()` for faction rep. Servers are bought by `host-manager.js`.

**Stocks (stockmaster.js).** Autopilot treats stocks as "our main source of income early-on" ([autopilot.js#L520-L525](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L520-L525)).
- **Before 4S:** the forecaster tracks price history and detects the 75-tick market cycle by watching for forecast "inversions" ([stockmaster.js#L18-L27](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/stockmaster.js#L18-L27)).
- **Reserve:** autopilot keeps at least $8b of the casino winnings, plus a share of cash that falls over the BitNode, reserved for stocks ([#L1062-L1090](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L1062-L1090)).
- **Manipulation:** the daemon defaults to hack/grow stock manipulation.

**Casino.** Once per reset, when the player has $300k and isn't already earning more than $5b/min, autopilot runs `casino.js` to win the $10b cap at blackjack ([#L752-L806](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L752-L806)). How it does that is in §3.4.

**Hacknet.** This is a one-time buy of everything with a payback under 1 h, then periodic buys at 4 h / 8 h / unbounded payback with shrinking budgets ([daemon.js#L364](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L364), [#L396-L399](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L396-L399)). With SF9, hashes go into boosting the best target's max money and lowering its min security ([autopilot.js#L537-L579](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L537-L579)).

**Crime and gangs.** `work-for-factions.js --fast-crimes-only` does a few Mugs, then Homicide. With SF2 and no gang yet, autopilot "rushes" karma with `--crime-focus`. At karma −40,000 it switches to earning gang-faction invites ([work-for-factions.js#L25](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/work-for-factions.js#L25), [#L619-L637](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/work-for-factions.js#L619-L637); [autopilot.js#L684-L705](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L684-L705)). It reads karma with `ns.heart.break()`.

**Corporation.** None.

#### 2.1.4 Early game without SF4

- **8 GB home.** The daemon puts its helpers on `harakiri-sushi`, a 16 GB server that needs no open ports ([daemon.js#L100](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L100)). With less than 32 GB home it targets one server and skips sharing. Autopilot then exits with a message telling the player to buy home RAM "manually at a store like [alpha ent.]" ([autopilot.js#L1095-L1112](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L1095-L1112)).
- **Everything Singularity-gated is skipped:**
  - TOR and program buying ([daemon.js#L392-L393](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L392-L393)).
  - The opening study session ([#L489-L516](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L489-L516)).
  - Faction work.
  - Installs ("No singularity access, so you're on your own", [autopilot.js#L823-L824](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L823-L824)).
  - BN exit ([#L446-L450](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L446-L450)).
- **The one UI automation is `casino.js`.** It travels to Aevum by clicking through the page when Singularity isn't available ([casino.js#L154-L170](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/casino.js#L154-L170)).
- **Getting the code in:** the player pastes `git-pull.js` into `nano`, and it downloads the rest ([README](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/README.md#downloading-the-whole-repository)).

#### 2.1.5 Surviving resets

- **The callback is the orchestrator itself.**
  - `ascend.js` runs `installAugmentations(autopilot.js)` ([autopilot.js#L956](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L956), [ascend.js#L192-L203](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/ascend.js#L192-L203)).
  - The win runs `destroyW0r1dD43m0n(nextBn, "autopilot.js", { sourceFileOverrides: new Map() })` from a temporary script ([autopilot.js#L461-L463](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L461-L463)).
- **Arguments live in a file.** The game passes no args to a callback, so autopilot writes changed args to `autopilot.js.config.txt`, and `getConfiguration` reads them back ([#L191-L231](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L191-L231)).
- **Shared state is home text files:**
  - `reserve.txt` (money held back).
  - `/Temp/*.txt` caches, cleared by `cleanup.js` before a BitNode change.
  - An append-only `log.autopilot.txt` of install and BN-completion times ([#L1141-L1145](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L1141-L1145)).
- **Everything else is re-derived on start** from `getResetInfo()`, source files and multipliers ([#L148-L189](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L148-L189)).
- **RAM dodging through temp scripts (legitimate).** `getNsDataThroughFile(ns, "ns.singularity.getOwnedAugmentations()")` writes a one-line script that makes the call and writes the result to a file, runs it, and reads the file back ([helpers.js#L156-L160](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/helpers.js#L156-L160), [#L323-L380](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/helpers.js#L323-L380)). The orchestrator only ever pays for `run` and `read`, and each temp script pays the full RAM for its own call. This is how a SF4-heavy orchestrator fits in a small home.

#### 2.1.6 Last update and 3.0 status

- The last commit is 2026-05-04, three days after v3.0.0. It added 3.0's two new contract types. On 2026-04-26 the `getOtherGangInformation` → `getAllGangInformation` rename landed.
- `helpers.js` translates v3 names back to v2 when `ui.getGameInfo().versionNumber < 44` ([#L165-L190](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/helpers.js#L165-L190), [#L952-L954](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/helpers.js#L952-L954)), so it is written against the v3 API.
- umb ran a full static audit of a fork of it against 3.0.1 ([docs/legacy/scripts-compat-audit.md](https://github.com/UnderMyBed/bitburner-agent/blob/7990834f0358584fd0868f13b99e72e972046ca5/docs/legacy/scripts-compat-audit.md)). I re-checked its findings against alain's own `7a8951a`.

Breaks that remain at `7a8951a`, mapped to the current-state doc's list:

| 3.0 change | Where it bites | Effect |
|---|---|---|
| `darkweb` no longer in `ns.scan()` (#2139) | `hasTor = () => ns.scan("home").includes("darkweb")` ([Tasks/tor-manager.js#L12](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/Tasks/tor-manager.js#L12)); the daemon's gate on `!allHostNames.includes("darkweb")` ([daemon.js#L392](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L392)) | tor-manager is relaunched every 25 s for the whole BitNode, and each run pays SF4-scaled RAM for `purchaseTor` (32 GB at SF4.1). Fix: `ns.hasTorRouter()`, which exists in 3.0.1 ([d.ts#L7735](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/ScriptEditor/NetscriptDefinitions.d.ts#L7735)). |
| Hacknet RAM: 4 GB for the namespace → 0.5 GB per function (#2502) | `hacknet-upgrade-manager.js` references 14 hacknet functions (7 GB). The daemon still sizes it at 6.1 GB ([daemon.js#L353-L356](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/daemon.js#L353-L356)). | Early hacknet buying doesn't fit on small homes. |
| TIX no longer needs WSE (#2342) | `purchaseWseAccount` before TIX ([stockmaster.js#L609](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/stockmaster.js#L609), [ascend.js#L126](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/ascend.js#L126)) | $200m wasted per BitNode. Nothing breaks. |
| `ns.format.*` replaced the format helpers | `formatTime` calls `ns.ui.time`, which does not exist in 3.0.1 ([helpers.js#L956-L961](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/helpers.js#L956-L961); `time` is on `Format`, [d.ts#L4377](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/ScriptEditor/NetscriptDefinitions.d.ts#L4377)) | Only reached by `go.js --logtime`. Cosmetic. |
| New: darknet, BN15, The Red Pill from the labyrinth | No `ns.dnet` code, and BN15 is not in `defaultBnOrder` | **Cannot finish BN15**, so it cannot reach the finish line, except by a Bladeburner win. |
| New: sleeve purchase and memory APIs (#2443) | Still says buying sleeve memory "has no API, requires manual interaction" ([autopilot.js#L56](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L56)); only warns in BN10 ([#L421-L440](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L421-L440)) | BN10 needs a human to buy sleeves. |
| Fuzzy enums removed (#2091); `nuke` returns false (#2153); `ns.cloud.*` (#2367); `getResetInfo` replaces the removed player fields | Already handled (exact crime names; `crack-host` ignores results; the v3 cloud API; `getResetInfo` used throughout, [autopilot.js#L114-L115](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js#L114-L115)) | None. |

**Performance (secondary source).** umb ran its vendored fork of alain headless in a simulator of the real v3.0.1 engine. The setup was BN1.2 with SF1.1 + SF4.3 and the casino off. After 12 virtual hours the median seed had hacking 411, 14 augs installed and 512 GB home, and had not destroyed BN1 ([docs/sim/baselines.md](https://github.com/UnderMyBed/bitburner-agent/blob/7990834f0358584fd0868f13b99e72e972046ca5/docs/sim/baselines.md)). This is a simulation, not a real-time run.

### 2.2 cyguin: v3 fork of alain

- Every file not listed in its README is "byte-for-byte" alain. Only `autopilot.js` is rewritten ([README](https://github.com/cyguin/bitburner-scripts/blob/4e946a5cfa071ddf1593993e5c9dfcd78956e495/README.md#upstream-vs-fork)).
- **BN order:** alain's, plus `15.1` after `14.2`.
- **BN12 recursion:** an empty aug queue now means "rejoin" via `destroyW0r1dD43m0n(12)`. Before, the loop sat idle forever.
- **BN15:** a self-propagating darknet worm with solvers for "all 21 server models", cut to about 6.5 GB so it fits the 16 GB servers at depths 0–5, plus a BFS labyrinth solver. The README states that BN15 "is not complete" and that "solver reliability at scale is untested". Its key 3.0 finding is that `exec` needs the target to be adjacent at the moment it fires, and darknet servers drift away during the 5–10 s an interactive authentication takes.
- **Inheritance:** everything else (including tor-manager and the casino) is inherited unchanged, along with the §2.1.6 issues and the §3.4 DOM dodges.

### 2.3 quack: quacksouls/bitburner (and the bitwalk walkthrough)

**BitNode order.**
- The README is explicit: "Get level 3 of BitNode-4 as soon as possible. You can destroy BN1.1, then proceed to destroy BN4.1, BN4.2, and BN4.3" ([src/README.md](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/src/README.md)).
- Its development milestone saves, inferred from file names ([save/README.md](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/save/README.md)), go BN4.1–4.3 (with SF1.3) → BN1.2–1.3 → BN2.x → BN5.1 → BN10.x. These are the same kind of thing as our milestone saves.

**When it installs.**
- Scripts are **chain-loaded**: each one does a job, then `exec`s the next.
- Install comes after a faction's augs are bought and home RAM is upgraded: `faction/*.js` → `chain/home.js` → `singularity/home.js`, which waits briefly for the money to buy RAM and then execs `chain/install.js` ([singularity/home.js#L107-L121](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/src/singularity/home.js#L107-L121)). Then `singularity/install.js` runs `installAugmentations("/quack/go.js")` ([#L166](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/src/singularity/install.js#L166)).
- In effect it is "one faction (group) per reset".
- After The Red Pill, `singularity/daemon.js` waits for the hack level, connects and runs `installBackdoor()` ([#L35-L68](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/src/singularity/daemon.js#L35-L68)). That lands on the BitVerse page, so the next BitNode is not chosen by script.

**Money engine.**
- Crime pays for home RAM. Every RAM upgrade is followed by a `softReset` ([singularity/money.js#L92-L118](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/src/singularity/money.js#L92-L118)).
- Then hacking via `hgw/` (a Formulas-based parallel batcher on cloud servers), pre-4S and 4S stock bots, hacknet, coding contracts, a gang manager, and a corporation (`src/corporation/`: Agriculture, then Tobacco).
- `install.js` buys the cheapest program repeatedly and deletes it each time, a known way to farm Intelligence XP ([#L122-L142](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/src/singularity/install.js#L122-L142)).

**Early game without SF4.** Manual: `go.js` exits with "No access to Singularity API. Cannot automate gameplay." The bitwalk walkthrough is the human playbook:
- 3 hacknet nodes, free CS course, a job at FoodNStuff, crime.
- Self-hacking scripts on the seven 0-port servers.
- Home RAM.
- TOR and port openers.
- The factions Sector-12, Tian Di Hui, CyberSec ([plan.md](https://github.com/quacksouls/bitwalk/blob/1fa1e805c446b5df885770ddb5131bb8fce688ef/plan.md)).

Its `shell()` helper types terminal commands (for example `connect a; connect b`, then `backdoor`). It does this by setting the terminal input's value and calling React's `onChange` and `onKeyDown` props ([quack lib/util.js#L453-L467](https://github.com/quacksouls/bitburner/blob/90ca8312cbdae44b31c1ae414b6cb1efa5e580c7/src/lib/util.js#L453-L467)). The template comes from the game's old "inject HTML" docs.

**Surviving resets.** The callback is always `/quack/go.js`, which picks the next script from home's RAM tier and from whether this is BN8. Code delivery is `wget …/pull.js pull.js; run pull.js`, which matches our start-command idea.

**3.0 status.** Broken:
- `ns.nFormat` ×11.
- `ns.purchaseServer` / `getPurchasedServers` / `getPurchasedServerCost` ×17.
- One `"darkweb"` scan check.
- WSE bought before TIX.

### 2.4 kamukrass

- **No BitNode order.**
- **Installs:** never. `buyAugments` computes a purchase order, most expensive first with prerequisites and a ×1.9 running price ([playerAction.js#L230-L274](https://github.com/kamukrass/Bitburner/blob/7fdb7383e3c727d4c419d6dbd6fea18854d9e5ef/playerAction.js#L230-L274)), but the install is commented out ([#L282](https://github.com/kamukrass/Bitburner/blob/7fdb7383e3c727d4c419d6dbd6fea18854d9e5ef/playerAction.js#L282)).
- **Money:**
  - A "distributed-hack" burst batcher: 200 ms between H/G/W landings, 500 ms between bursts, adaptive hack fraction starting at 10% ([distributed-hack.js#L1-L60](https://github.com/kamukrass/Bitburner/blob/7fdb7383e3c727d4c419d6dbd6fea18854d9e5ef/distributed-hack.js#L1-L60)).
  - Pre- and post-4S stock traders, a corp script, and a gang script.
- **3.0 status:** written before 2.0. It calls Singularity functions at the top level (`ns.purchaseTor`, `ns.getOwnedAugmentations`, `ns.commitCrime`), uses `ns.nFormat` ×23 and `ns.purchaseServer`. It doesn't run on 2.x, let alone 3.x.

### 2.5 boyce: v3 hacking-only automation with measured times

An AI-agent-run, hacking-only v3 stack. Its research notes are the only **measured** v3 per-BitNode times I found ([our_automation_and_history.md](https://github.com/boycepoleonjr/bitburner/blob/8489de18e24ee5faa19f29771e8c178a5ce4785c/research_notes/BitNode%20roadmap%20to%20full%20completion/our_automation_and_history.md)). I read the notes but not the scripts, so the descriptions below are the repo's own.

**Times.** These are wall-clock times on a hosted game, with SF4.1 owned:

| BitNode | Measured time | Installs |
|---|---|---|
| BN4.1 | About 158 h from entry to destroy. The Red Pill was installed about 101 h in; the remaining ~57 h went on reaching hacking 9000. | 17 automatic |
| BN5.1 | About 58 h to "ready", including about 14.5 h of bootstrap under 16× Singularity RAM | 13 |
| BN1.1 | About 20 h for the stretch the agent ran | 4 manual |

The notes record two root causes for the BN4 tail: "NeuroFlux-only installs resetting hacking near a 9000 requirement", and "money-losing hacknet" (ROI 0.08 on install #1).

**BitNode order.** `DEFAULT_BN_ORDER = [1, 4, 2, 5, 10, 9, 3, 11, 12, 6, 7, 8, 13, 14]`. Its own roadmap then recommends BN1.2 *before* BN4.2/4.3.

**Ideas worth noting:**
- A "daemon-lite" bootstrap for small homes.
- A **reserved cloud server** (`pserv-sing`, 64 → 512 GB) that runs the 16×-cost one-shot Singularity scripts.
- A pure aug planner, separate from the `ns` side.
- An "nfgHold" rule: no NeuroFlux-only installs once hacking is at 90% of the World Daemon requirement.
- A destroy gate that backs up the save first.

### 2.6 umb: UnderMyBed/bitburner-agent

- **Goal:** a fresh save to every SF maxed, unattended, on Steam v3.0.1. The design is a Node.js "brain" outside the game, a tiny in-game agent of 3 GB or less, and a headless simulator built from the real game engine ([README](https://github.com/UnderMyBed/bitburner-agent/blob/7990834f0358584fd0868f13b99e72e972046ca5/README.md)).
- **Status:** pre-alpha, in M3. The README lists TOR/programs, home RAM, travel, dialogs, faction joins, aug buying, installs, BitNode destroys and the restarts after them, all "through the page".
- **Tutorial:** it treats leaving the fresh-save tutorial as the owner's one click, because "the game won't start the Agent while it runs". This is our "exit the tutorial" human action.
- **How it reaches the page:** `globalThis.eval("document")`, and the code says so outright: "The game charges 25 GB for the identifiers `document` and `window`, so neither appears anywhere in this code". Clicks call the element's React `onClick` with `{ isTrusted: true }` ([packages/ingame/src/page/game-page.ts#L1-L10](https://github.com/UnderMyBed/bitburner-agent/blob/7990834f0358584fd0868f13b99e72e972046ca5/packages/ingame/src/page/game-page.ts#L1-L10), [#L113](https://github.com/UnderMyBed/bitburner-agent/blob/7990834f0358584fd0868f13b99e72e972046ca5/packages/ingame/src/page/game-page.ts#L113)). **Both conflict with our rules** (§3.4).
- **Useful secondary research:**
  - [docs/research/community.md](https://github.com/UnderMyBed/bitburner-agent/blob/7990834f0358584fd0868f13b99e72e972046ca5/docs/research/community.md) surveys tooling, batcher designs, corp round thresholds from catloversg's corp script, and other v3 repos (SCHWARM, SphyxOS, d0sboots, ficocelliguy). I have not verified those repos myself.
  - The alain compatibility audit cited in §2.1.6.

### 2.7 Others, briefly

- **chrisrabe** (video series, last commit January 2024).
  - Batching scripts (`pirate`/`gimme-more-money` with a 50 ms attack delay), a hacknet autopilot, and corp division/product/recruiter scripts.
  - No orchestrator and no BitNode order.
  - `_stable/dev-tools-v2.js` opens the dev menu by walking React props to `router.toDevMenu()` ([#L1-L11](https://github.com/chrisrabe/bitburner-automation/blob/cb6725c4e415908c57e61f2e65b8a9603878a78d/_stable/dev-tools-v2.js#L1-L11)). That is a recorded exploit (§3.4).
  - 3.0: `ns.nFormat`, `ns.purchaseServer`.
- **mughur** (March 2023).
  - **Install:** time-based, after 12 h by default, or immediately once The Red Pill is bought. It buys the most expensive affordable aug repeatedly ([install.js#L14-L60](https://github.com/Mughur/BBScripts/blob/d04232cc92e10a19671588d5f949f0d16acfec87/install.js#L14-L60)).
  - **BN times:** appends total playtime to `times.txt` at each BitNode end ([end_BN.js#L14-L16](https://github.com/Mughur/BBScripts/blob/d04232cc92e10a19671588d5f949f0d16acfec87/end_BN.js#L14-L16)), a primitive split log.
  - **Random dev-menu call:** `startCorp1_2.js` calls `ns.openDevMenu()` at random ([#L205](https://github.com/Mughur/BBScripts/blob/d04232cc92e10a19671588d5f949f0d16acfec87/startCorp1_2.js#L205)). In 3.0.1 this only plays an April-fools animation; it doesn't open the real dev menu.
  - **3.0:** it has `.script` files, `getTimeSinceLastAug`, `ns.tail`, and `getPlayer().hacking`.
- **Snarling, xxxsinx, Jrpl, catloversg, d0sboots:** these are libraries or single mechanics, not run orchestrators. umb's survey says catloversg (the lead maintainer) has the most complete corp bot. I did not inspect it, so it is a lead for the corp ticket.

### 2.8 The in-game BitNode guides (the dev-maintained consensus)

v3.0.1 ships two guides:
- [bitnode_recommendation_short_guide.md](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/advanced/bitnode_recommendation_short_guide.md)
- [bitnode_recommendation_comprehensive_guide.md](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/advanced/bitnode_recommendation_comprehensive_guide.md)

What they say:
- **"Repeating BitNode 1 is the best choice"** first. SF1.2 is worth "8 levels of NFG", and most people do 1.3 in one go.
- **BN2 and BN5 are good early nodes.**
- **For automating everything, BN4 is needed, and it has to go to 4.3.** It "is not easy … especially if you … only have Source-File 1".
- **BN6/7:** Bladeburner is "a good choice to beat extremely hard BitNodes (BN9, BN13)".
- **BN10** is often done in one go for 8 sleeves.
- **BN8 and BN11 are best saved for later**, and BN11 is "very difficult for not much in return".
- **"Doing BitNodes in chronological order … is a classic mistake."**
- **Darknet The Red Pill:** SF15.1 "allows the use of the dark net to get The Red Pill from the final lab in all BitNodes (except for BN8), which in some cases may be quicker than unlocking it via Daedalus."

---

## 3. Synthesis

### 3.1 Consensus strategies

| Area | Consensus | Who |
|---|---|---|
| Delivery | `wget` (or paste into `nano`) one pull script from GitHub raw, which fetches the rest | alain, quack, bitwalk |
| BN order, front | BN1 → BN4 up to SF4.3 → BN1.2/1.3 → BN5 → BN2. The 1.2-before-4 versus 4-before-1.2 split is the main disagreement. | alain, quack, boyce, in-game guide |
| BN order, middle | BN10 (sleeves) early-ish, Bladeburner nodes as the tool for BN9/BN13, BN8 and BN11 late. Corps are optional (alain skips them). | alain, in-game guide, boyce |
| Install trigger | The Red Pill → install now. Otherwise a count of affordable augs that falls with time since the last install. Install quickly when the early augs are cheap. | alain, mughur (time), quack (per faction), boyce |
| Purchase order | Most expensive first, prerequisites first, ×1.9 per purchase, NeuroFlux last | alain, kamukrass, mughur, boyce |
| Pre-install routine | Kill workers, liquidate stocks and hashes, buy augs, then spend the rest on home RAM and cores, join pending factions, install with a callback | alain `ascend.js`, quack |
| Don't reset when… | close to the Daedalus requirements, close to 4S, mid-graft, or when the World Daemon is in reach | alain, boyce |
| Money | HWGW batches timed with `additionalMsec`; stocks from early on (pre-4S forecaster, 4S later, hack/grow manipulation); casino $10b per install; hacknet only under a payback gate; share() for rep | alain (all), quack, boyce |
| Gang | Crime for karma (Mug → Homicide) until −54k, then the gang faction is the main source of augs | alain, quack, in-game guide |
| Reset survival | Callback = orchestrator; state from `getResetInfo()` plus small text files on home; expensive calls in temporary single-purpose scripts | alain, quack, boyce |
| Small home | Run helpers elsewhere: an NPC server with root (alain uses `harakiri-sushi`) or a reserved cloud server for Singularity one-shots (boyce) | alain, boyce |

### 3.2 What carries over to 3.0.1

All of §3.1 carries over as ideas. The things checked against 3.0.1:

- **Callbacks:** `installAugmentations(cb)` and `destroyW0r1dD43m0n(n, cb, opts)` still run a callback 500 ms after the reset (current-state doc, Q5). alain's pattern works unchanged.
- **Temp-script RAM dodging is legitimate.** Each temp script pays its own static RAM, so nothing is evaded. The game only records `Bypass` when `ns.bypass(document)` is called from a 1.6 GB script ([Extra.ts#L21-L36](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Extra.ts#L21-L36)).
- **HWGW timing** with `additionalMsec` and `stock: true` is unchanged, and so are the formulas (current-state doc, 2d).
- **Casino cap:** $10b, measured by `moneySourceA.casino` ([Casino/Game.ts#L4-L19](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Casino/Game.ts#L4-L19)). `prestigeAugmentation` resets that counter ([PlayerObjectGeneralMethods.ts#L128](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L128)), so the community's "casino once per install" really is $10b each install.
- **Terminal injection still works:** `#terminal-input` exists and its `onKeyDown` has no `isTrusted` check ([TerminalInput.tsx#L446-L466](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Terminal/ui/TerminalInput.tsx#L446-L466)). That makes `connect`/`backdoor`/`buy` drivable without faking trusted clicks.
- **Page reloads:** the game restarts every script that was running when the save was made, and also runs the optional **autoexec** script from Settings ([NetscriptWorker.ts#L185-L262](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptWorker.ts#L185-L262)). alain's casino relies on the first. Both matter for our "retype the start command after a reload" rule (§3.5).
- **Karma:** `ns.heart.break()` still returns it ([NetscriptFunctions.ts#L1526](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions.ts#L1526)).

### 3.3 What depended on removed or changed 2.x behaviour

| 2.x assumption in community code | 3.0 reality | Affects |
|---|---|---|
| Purchased-server API at the top level (`ns.purchaseServer` …) | `ns.cloud.*` (#2367) | quack, kamukrass, chrisrabe |
| `ns.nFormat`, `ns.tail`, `ns.tFormat` | Removed; use `ns.format.*` / `ns.ui.*` | quack, kamukrass, chrisrabe, mughur |
| `.script` (NS1) files | Cannot run (#2083) | mughur |
| Fuzzy crime and work names (`"rob store"`) | Exact names or `ns.enums` only (#2091) | Any hand-typed crime or work code |
| `darkweb` shows up in `scan` | It's a darknet server now. Use `ns.hasTorRouter()`. | alain/cyguin tor-manager, quack |
| Hacknet namespace costs 4 GB once | 0.5 GB per function (#2502) | alain's hacknet-upgrade-manager sizing |
| TIX needs a WSE account first | Independent; only 4S *market data* needs WSE (#2342) | alain, quack (wasted $200m) |
| No API for sleeve purchase or memory | `ns.sleeve.purchaseSleeve` / `upgradeMemory` (#2443) | alain's BN10 still needs a human |
| The Red Pill only through Daedalus (or a BN2 gang) | Also through the darknet labyrinth; required in BN15 | alain has no route to finish BN15 |
| Infiltration as the money and rep engine (the 2023 "BN9 in 9 minutes" claims in umb's survey) | Rebalanced in #2210 (stat minimums, a market-demand factor) | Infiltration-first openers are stale |
| Singularity at the top level (pre-2.0) | `ns.singularity.*`, all gated by `checkSingularityAccess` | kamukrass |
| Analysis APIs return defaults on hacknet servers | They throw (#2261) | Naive "scan and analyze everything" loops (alain only with `--use-hacknet-servers`) |

### 3.4 Techniques that hit our rules

Our rules forbid anything the game records as an exploit, and they explicitly name dodging the DOM RAM cost (GLOSSARY "Exploit"; map #1 "Out of scope").

| Technique | Used by | Does the game record it? | Verdict for us |
|---|---|---|---|
| Reaching the DOM with `eval("document")`, `globalThis["document"]` or `globalThis.eval("document")`, so the static analyser never sees the identifier `document` and the 25 GB isn't charged ([RamCalculations.ts#L185-L191](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Script/RamCalculations.ts#L185-L191)) | alain [casino.js#L30](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/casino.js#L30), [#L411](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/casino.js#L411), [stockmaster.js#L625](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/stockmaster.js#L625), [stats.js#L33](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/stats.js#L33), [scan.js#L36](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/scan.js#L36); quack/bitwalk `shell()`; cyguin; chrisrabe; mughur `overview.js`; umb's whole page driver | **No.** `Bypass` is only granted through `ns.bypass(document)` ([Extra.ts#L21-L36](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Extra.ts#L21-L36)). | **Forbidden.** The game's own description of `Bypass` is "circumventing the ram cost of document", and our rules name it. UI automation must reference `document`/`window` directly and pay 25 GB. |
| Opening the dev menu (`router.toDevMenu()` via React props) | chrisrabe `dev-tools*.js` | **Yes:** `YoureNotMeantToAccessThis` on render ([DevMenu.tsx#L43-L45](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/DevMenu.tsx#L43-L45)) | **Forbidden.** |
| Calling React's `onClick` directly with `{ isTrusted: true }` | alain casino ([casino.js#L479-L503](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/casino.js#L479-L503)), umb | **No.** Only clicking the hidden `#unclickable` div records `Unclickable` ([Unclickable.tsx#L7-L11](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Exploits/Unclickable.tsx#L7-L11)). | **Grey; needs a decision.** It's allowed by the glossary's wording, but it gets past deliberate anti-script guards on, at least: committing crime ([SlumsLocation.tsx#L24-L27](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Locations/ui/SlumsLocation.tsx#L24-L27)), company work and infiltration ([CompanyLocation.tsx#L61-L73](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Locations/ui/CompanyLocation.tsx#L61-L73)), accepting a faction invite from the Factions page ([FactionsRoot.tsx#L88-L92](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/ui/FactionsRoot.tsx#L88-L92)), creating a program ([ProgramsRoot.tsx#L95-L110](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Programs/ui/ProgramsRoot.tsx#L95-L110)) and casino bets ([Casino/utils.ts#L3-L8](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Casino/utils.ts#L3-L8)). Without it, no-SF4 UI automation of those actions is impossible. The terminal path (`connect`, `backdoor`, `buy`) has no such guard. |
| Casino save-scumming: save while winning, force `location.reload()` on a big loss | alain [casino.js#L243-L244](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/casino.js#L243-L244), [#L404-L421](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/casino.js#L404-L421); SCHWARM, per umb's survey | **No.** | **Grey; needs a decision.** It isn't an exploit, but a script-forced reload is not one of our human actions. It only works hands-off because saved running scripts restart on load. It also needs `isTrusted` faking. |
| Roulette seed prediction | d0sboots, megaburn (per umb's survey; not inspected) | **No.** The source calls RNG0 "meant to be used as introduction to RNG manipulation", but roulette uses a WHRNG seeded from `Date` and "the house straight up cheats" on 10% of wins ([RNG.ts](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Casino/RNG.ts), [Roulette.tsx#L110](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Casino/Roulette.tsx#L110), [#L147-L152](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Casino/Roulette.tsx#L147-L152)) | Allowed, but it is also UI-only. |
| `ns.heart.break()` (karma); buying and `rm`ing programs for Intelligence; `sourceFileOverrides` in `destroyW0r1dD43m0n` | alain, quack | No | Allowed. These are normal APIs. |

### 3.5 What this means for our design

These are ideas only, for the tickets that own each decision:

1. **A fully hands-off BN1.1 from a fresh save is new ground.** Nobody has published one. The community's answer to the early game is "a human does it until SF4". Ours has to be UI automation that pays 25 GB.
   - A fresh home has 8 GB, so the page driver has to run somewhere else. The candidates are a cloud server (no SF gate) or a rooted NPC server with enough RAM, as alain and boyce do for their heavy scripts.
   - The `document` object is the same page whichever server the script runs on. That follows from how scripts run in the page; I haven't tested it.
2. **The `isTrusted` question decides how much of the no-SF4 game the page can drive.** Without faked trusted clicks:
   - Crime, company work, faction joining on the Factions page and program creation are all closed.
   - What is left is the terminal (`connect`/`backdoor`/`buy`/`run`) and any UI handlers without the guard. Aug purchase/install and travel aren't in the guarded list I found, but I have not verified each one.
   - This should go to the rules owner before the bootstrap design.
3. **Take the reset-survival pattern whole:** callback = the start command's orchestrator; state from `getResetInfo()` plus small text files on home; one temporary script per expensive call.
   - The callback has to fit in 8/32/128 GB, so keep it tiny and let it spawn the rest (current-state doc, Q5).
   - For page reloads: save while the orchestrator is running, or set it as the autoexec script. Then a reload might not need the human to retype anything. That needs testing.
4. **The BN order is the open question.** The community splits on BN4 before or after BN1.2/1.3. boyce's 158 h BN4.1 is a data point against going early. Automation leans the other way, because SF4.1 alone still leaves 16× RAM. Our order ticket should model both.
   - BN15 is unsolved in the community (cyguin is partial). Either a darknet route or a Bladeburner route has to be designed from scratch.
5. **Install policy starting points:**
   - alain's rules (The Red Pill now; a count threshold that decays over time; a quick early install; a momentum countdown; vetoes).
   - boyce's lesson: once The Red Pill is installed and hacking is near the World Daemon requirement, stop installing.
6. **Money engine starting points:**
   - HWGW with `additionalMsec`, ≤75% steal, padded grow/weaken, and XP-only phases near hacking targets.
   - Stocks early, with a pre-4S cycle detector. The casino only if the `isTrusted` and reload questions come out "allowed". Hacknet only with a strict payback gate (boyce lost money on it).
   - Corp has no full-automation prior art in the main suites. catloversg's corp bot is the lead to check.

---

## Not verified, or inferred

- **I didn't run anything.** All timing and performance figures come from the repos' own notes (boyce) or from a simulator (umb), not from my observation.
- **catloversg, d0sboots, SCHWARM, SphyxOS, ficocelliguy and megaburn** come only from umb's survey. I didn't inspect them.
- **The `isTrusted` list** comes from a GitHub code search (which indexes `dev`), checked file by file at v3.0.1 for Slums, Company, Factions, Programs and the casino. It may be incomplete, and I didn't check the Hospital, Arcade or Infiltration screens at v3.0.1.
- **I didn't verify whether a script-forced page reload counts as an allowed human action** under our rules. That is a rules question, not a game one.
- **quack's BitNode order beyond BN4** is inferred from its save-file names.
- **Discord and Reddit** were not read. That is where most community speedrun talk would be. umb's survey reports Reddit returned 403.
- **speedrun.com** was checked through its public API only (no game named Bitburner).
