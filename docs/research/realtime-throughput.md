# Real-time speed, offline time and bonus time (v3.0.1)

Research date: 2026-10-28. Answers [#7](https://github.com/anaconda186/bitburner/issues/7).

Sources:
- The game's source at tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1) (commit `3162fd2`). I read it from a local clone and did not run it. Every `V301/...` link below is `https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/...`.
- For browser timer behaviour: MDN and the Chrome developer blog.

Statements marked **(inference)** are my reasoning from the code or the docs. No source states them directly.

---

## Summary

1. **The game clock is wall-clock time and it catches up.** The engine is a self-rescheduling `window.setTimeout` with a 200 ms period. Each tick measures `Date` time since the last tick and runs `updateGame(n)` for however many whole 200 ms cycles have passed. A late tick does not lose game time; it processes several cycles at once. `requestAnimationFrame` is not used. ([V301/src/engine.tsx#L415-L442](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L415-L442))
2. **Script timers are separate from the game clock.** `ns.sleep`, `hack`, `grow`, `weaken`, `share` and `stanek.chargeFragment` each wait on a plain `window.setTimeout` for a duration in milliseconds ([NetscriptHelpers.tsx#L419-L432](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L419-L432)).
   - So hack/grow/weaken durations are real wall-clock milliseconds.
   - They can only finish **late**, never early, and they never catch up.
   - The duration is fixed when the call starts. The effect (chance, money, security) is computed when the timer fires.
3. **Nothing in the game throttles itself in a visible window.** No per-call delay, no cycle quota and no speed setting. The only things that keep the run below real time are:
   - main-thread load, since every script, the engine and React share one thread
   - the browser's 4 ms clamp on short nested timers
   - the 200 ms granularity of cycle-based actions
   - the page becoming *hidden* (minimised, screen off, possibly fully covered), which turns on the browser's background throttling
4. **Offline time is real time spent with the page closed or reloading.** On load the game measures `now − Player.lastUpdate` from the save, and the save is at most one autosave old (60 s by default). Offline time is credited as follows:
   - **Hacking money:** 75 % of the average hacking income since the last augmentation install.
   - **Scripts:** hacking exp, and half-rate grow/weaken effects.
   - **Hacknet, passive faction rep and current work:** in full.
   - **Gang, Corporation, Bladeburner, Sleeves, Stanek, Stock market, IPvGO and Darknet:** stored as bonus cycles.

   Scripts restart from the top of `main`, and anything in flight is lost. Everything since the last autosave is rolled back.
5. **Bonus time is stored cycles, not extra cycles.** Each mechanic banks cycles it could not process and later spends them faster than real time, up to a cap:

   | Mechanic | Speed-up |
   |---|---|
   | Gang | 25× |
   | Sleeves | 15× |
   | Corporation | 10× |
   | Bladeburner | 5× |
   | Stanek charging | 5× |
   | IPvGO AI | 5× |
   | Darknet | 3× drain, plus a 1.5× XP and 1.3× phishing bonus while it lasts |
   | Stock market | 1.5× |

   A mechanic never gets more total game time than the real time that passed. Bonus time only moves processing later.
6. **Using bonus time is legal and designed.** The game's own docs and tooltips say it builds up "while offline or when the game is inactive (e.g. when the tab is throttled by browser)".
   - **What TimeCompression detects:** a 15-second `setTimeout` chain that fires less than 500 ms of `performance.now()` after the previous firing, i.e. someone sped up the timers. ([V301/src/Exploits/loops.ts#L15-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Exploits/loops.ts#L15-L31))
   - Spending stored cycles never touches it.
   - Creating stored cycles by hand, through the dev menu or by editing the save, is flagged as other exploits.
7. **Throughput takeaway:** banking bonus time on purpose never makes the run faster overall, because the cycles are only conserved.
   - The one legal, free "bank" in a foreground window is an **idle sleeve**. An idle sleeve keeps storing cycles and spends them at 15× once it is given a task. Idle time is deferred, not lost.
   - Everything else banks only from stalls or offline time, and both cost the hacking engine more than they return.

---

## 1. How the game loop advances

### The tick

`Engine.start` ([V301/src/engine.tsx#L415-L442](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L415-L442)) does the following:
- reads `new Date().getTime()`
- works out `diff = now − Engine._lastUpdate`
- turns that into `floor(diff / 200)` whole cycles (`MilliPerCycle: 200`, [V301/src/Constants.ts#L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L19))
- calls `Engine.updateGame(cycles)`
- moves `_lastUpdate` forward by exactly those cycles, so the remainder (`offset`) carries over
- reschedules itself with `window.setTimeout(Engine.start, 200 − offset)`

This has three consequences:
- **No catch-up cap.** If the tick is 3 s late, the next call is `updateGame(15)`. Nothing is dropped and nothing is limited.
- **A negative `diff` is reset to 0.** A clock change backwards does not make game time run backwards.
- **Game time is tied to the wall clock, not to how many ticks ran.** Even if the browser fires ticks late, the cycle-based mechanics stay in step with real time (some of them through bonus time, see §5).

### What one `updateGame(n)` does

[V301/src/engine.tsx#L81-L139](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L81-L139)

It adds `n × 200 ms` to the play-time counters, then calls:
- `Terminal.process(n)`
- `Player.processWork(n)`
- `processStockPrices(n)`
- `gang.process(n)`
- `staneksGift.process(n)`
- `corporation.storeCycles(n)` followed by `corporation.process()`
- `bladeburner.storeCycles(n)`
- `sleeve.process(n)` for each sleeve
- `processDarknet(n)`
- `updateOnlineScriptTimes(n)`
- `processHacknetEarnings(n)`
- the counter-based jobs: faction invites, passive rep, messages, Bladeburner every 5 cycles, coding contracts, achievements, autosave

It then fires `GameCycleEvents` so React re-renders.

These keep exact pace with real time however large `n` is:
- player work ([PlayerObjectWorkMethods.ts#L11-L17](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectWorkMethods.ts#L11-L17)). Crime, for example, loops `commit()` for every completed unit ([CrimeWork.ts#L35-L48](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Work/CrimeWork.ts#L35-L48)).
- hacknet production
- passive faction rep
- terminal actions

Only the mechanics with a per-tick cap turn surplus cycles into bonus time (§5).

### Terminal actions are quantised to ticks

A terminal `hack`, `backdoor` or `analyze` subtracts `200 ms × n` per tick and finishes on the first tick where less than 0.01 s is left ([V301/src/Terminal/Terminal.ts#L165-L169](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L165-L169)). So a terminal action can end up to about 200 ms after its nominal time. This matters only for UI-automated terminal actions such as `backdoor` before SF4.

---

## 2. How script timers are scheduled

Every time-consuming NS call goes through `helpers.netscriptDelay` ([V301/src/Netscript/NetscriptHelpers.tsx#L419-L432](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L419-L432)). It:
- creates a `window.setTimeout(…, time)`
- stores the handle in `ws.delay` so that killing the script can clear it
- sets `ws.env.runningFn`

| Call | Delay | Source |
|---|---|---|
| `ns.sleep(t)` | `t` ms | [NetscriptFunctions.ts#L250-L258](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L250-L258) |
| `ns.asleep(t)` | `t` ms. A bare `setTimeout` that does **not** mark the script busy. | [#L259-L265](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L259-L265) |
| `ns.hack` | `calculateHackingTime(server, Player) × 1000 + additionalMsec` | [NetscriptHelpers.tsx#L537-L561](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L537-L561) |
| `ns.grow` | `calculateGrowTime × 1000 + additionalMsec` | [NetscriptFunctions.ts#L266-L286](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L266-L286) |
| `ns.weaken` | `calculateWeakenTime × 1000 + additionalMsec` | [#L342-L362](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L342-L362) |
| `ns.share` | `ShareBonusTime` | [#L394-L403](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L394-L403) |
| `stanek.chargeFragment` | 1000 ms, or 200 ms in bonus time | [NetscriptFunctions/Stanek.ts#L47-L52](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Stanek.ts#L47-L52) |

What this means:

- **Hack/grow/weaken durations are wall-clock milliseconds.** They do not depend on game cycles. Game ticks do not drive them, and the engine's catch-up does not speed them up.
- **The duration is fixed at the call; the outcome is computed when the timer fires.** In `hack`, `calculateHackingChance` and `calculatePercentMoneyHacked` run inside the `.then`. `grow` and `weaken` read the server and apply their effect at completion.
  - A batcher therefore lands each operation on whatever server state exists when its timer fires.
  - Any lateness (§3, §4) moves the landing time later.
  - `additionalMsec` is the built-in way to pad an operation to a chosen landing time.
- **Timers fire late, never early.** A `setTimeout` callback cannot run until the main thread is free ([MDN: Late timeouts](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#late_timeouts)). Unlike the engine, a script timer does not make up for a late start. Lateness accumulates down a chain of sleeps unless the script schedules against `Date.now()` / `performance.now()` targets **(inference)**.
- **One blocking call per script.** While a delayed call is pending (`runningFn` set), *any* other NS call from the same script except `asleep` throws a `CONCURRENCY` error and kills the script. The check is in `checkEnvFlags`, which runs on every call ([NetscriptHelpers.tsx#L399-L416](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L399-L416)). Running work in parallel means more scripts or threads. `ns.asleep` is the exception, because it neither sets nor checks `runningFn`.

---

## 3. `ns.sleep` granularity and per-script overhead

### Granularity

`ns.sleep(t)` is exactly `setTimeout(t)`. The game adds no minimum and no rounding. The limits come from the browser:

- **The 4 ms nested-timer clamp.** "Browsers will enforce a minimum timeout of 4 milliseconds once a nested call to `setTimeout` has been scheduled 5 times" ([MDN: Nested timeouts](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#nested_timeouts)). Chrome's "minimal throttling" for visible pages does the same: timers are not throttled "unless the timeout is under 4ms and the chain count is 5 or greater" ([Chrome blog: Heavy throttling of chained JS timers](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)).
  - **(inference)** A `while (true) { …; await ns.sleep(0); }` loop counts as a nested chain. `netscriptDelay` resolves inside the previous timer's callback, so the script's next `setTimeout` is called inside that same timer task, and the nesting level rises.
  - So a tight sleep loop settles at about **4 ms per iteration**, about 250 iterations per second per script.
  - `sleep(t)` with `t ≥ 4` is not affected.
- **Main-thread contention.** All scripts, the 200 ms engine tick and React rendering share one thread. The real floor is "4 ms or however long the thread is busy, whichever is longer".

### Per-script and per-call overhead

- **Per NS call:** the API proxy runs `checkEnvFlags` (is the script killed?) and `updateDynamicRam` (a lookup after the first call) before the real function ([V301/src/Netscript/APIWrapper.ts#L78-L83](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/APIWrapper.ts#L78-L83)). There is no artificial delay. Log messages are lazy closures, so `ns.disableLog` saves building the strings **(inference from `helpers.log(ctx, () => …)`)**.
- **Per script launch:** `exec` and `run` reserve RAM and create a `WorkerScript` synchronously, then start `main` asynchronously after `compile` ([V301/src/NetscriptWorker.ts#L48-L67](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L48-L67), [#L105-L158](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L105-L158)).
  - The first run of a given source text builds a blob-URL ES module and `import()`s it.
  - Later runs reuse `script.mod`, or a module cache keyed by the transformed code ([V301/src/NetscriptJSEvaluator.ts#L49-L59](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptJSEvaluator.ts#L49-L59), [#L186-L223](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptJSEvaluator.ts#L186-L223)).
  - So repeated HGW-worker launches pay the compile cost once.
- **RAM:** the 1.6 GB base cost is paid per script instance (see `bitburner-current-state.md`, §2c). This is the binding per-script overhead early on. CPU is not.
- **Per tick:** `updateOnlineScriptTimes` loops over all running scripts every tick ([NetscriptWorker.ts#L171-L176](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L171-L176)), which is cheap. **(inference)** React re-renders on every `GameCycleEvents` emit. A heavy page such as Active Scripts with thousands of entries costs more main-thread time than the Terminal.

---

## 4. Does anything slow the game below real time in a foreground window?

Inside the game, no:
- the engine catches up on wall-clock time
- there is no speed setting
- there is no per-call delay

What can still cost real time:

1. **Main-thread saturation.** Script callbacks run late (§2). The engine does not lose cycles, but every `sleep`/HGW completion lands late, so a batcher's timing slips.
2. **Short-timer clamping** at 4 ms (§3).
3. **Tick quantisation** of terminal actions, up to about 200 ms (§1).
4. **The page becoming hidden.** Chrome applies minimal throttling only while "the page is visible" or has played sound in the last 30 s. Otherwise:
   - timers are checked once per second
   - after 5 minutes hidden with chained timers and silence, they are checked once per minute (intensive throttling, Chrome 88+)

   ([Chrome blog](https://developer.chrome.com/blog/timer-throttling-in-chrome-88); [MDN: Timeouts in inactive tabs](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#timeouts_in_inactive_tabs)).
   - MDN says a page is `hidden` when it is a background tab, its window is minimised, or the device's screen is off. It also says the visibility event fires when "the document is entirely obscured by another window" ([MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)).
   - **(inference)** "Its own active window" must therefore also mean: not minimised, not fully covered by another window, and screen-off/lock disabled.
   - Chromium tracks native window occlusion: a window is "occluded" when it is hidden or fully covered by opaque windows ([Chromium `window_occlusion_tracker.h`](https://chromium.googlesource.com/chromium/src/+/74.0.3729.169/ui/aura/window_occlusion_tracker.h)).
   - Background tabs are out of scope (#1), but a covered window is an easy way to fall into that state by accident.

---

## 5. Offline progress: closing, reloading, reopening

### How offline time is measured

The autosave is a game-cycle counter: `AutosaveInterval × 5` cycles, default `AutosaveInterval: 60` s ([engine.tsx#L225-L236](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L225-L236), [Settings.ts#L17](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Settings/Settings.ts#L17)). `Player.lastUpdate` is refreshed every tick and saved with the game.

There is no save on unload. `onbeforeunload` only shows a "Your work will be lost" prompt ([V301/src/index.tsx#L54-L58](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/index.tsx#L54-L58)).

On load, `timeOffline = now − Player.lastUpdate` (clamped ≥ 0) and `numCyclesOffline = floor(timeOffline / 200)` ([engine.tsx#L257-L264](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L257-L264)).

**(inference)** After a reload, in-game state rolls back to the last autosave, which can be up to about 60 s old. The whole gap from that save to the reload is then credited as "offline".

### What offline time grants

[engine.tsx#L266-L351](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L266-L351)

| What | Offline treatment |
|---|---|
| Hacking money | `moneySourceA.hacking / playtimeSinceLastAug × timeOffline × 0.75` (`OfflineHackingIncome`, [Constants.ts#L22](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L22)). This is a since-last-augmentation average, not the current rate. |
| Script hacking exp | `confidence × online exp rate × timeOffline`. `confidence` is `onlineRunningTime / 4 h`, capped at 1 ([ScriptHelpers.ts#L14-L72](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/ScriptHelpers.ts#L14-L72)). |
| Script grow/weaken | Applied at **half** the online call rate ([ScriptHelpers.ts#L34-L54](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/ScriptHelpers.ts#L34-L54), [#L74-L91](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/ScriptHelpers.ts#L74-L91)) |
| Running scripts | Restarted from the top of `main` with their saved args. In-flight HGW and script state are lost ([NetscriptWorker.ts#L218-L264](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L218-L264); in-game doc [offlineandbonustime.md](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/programming/offlineandbonustime.md)) |
| Current player work | `processWork(numCyclesOffline)` at the full rate, with `Player.focus = true` |
| No current work (not BN2) | Each joined faction that offers work gets `max(hack, security, field rep rate) / number of factions` per cycle |
| Hacknet, passive faction rep | Full rate |
| Coding contracts | Bonus generation in proportion to the time |
| Gang, Corp, Bladeburner, Sleeves, Stanek, Stock market, IPvGO, Darknet | Added to stored cycles, which become bonus time (§6) |

**So, do scripts earn offline?** Yes, but only through these flat averages: 75 % of the since-augmentation hacking-money average, plus exp and half-rate grow/weaken. No script code runs.

For a speedrun a reload is pure loss **(inference)**:
- up to one autosave interval of real progress is rolled back
- the reload itself takes time
- every script restarts cold
- the offline refund is below the online rate

That fits #1: a reload is a recovery case, not a tactic.

---

## 6. Bonus time, mechanic by mechanic

The general pattern: a mechanic adds incoming cycles to `storedCycles` and processes at most a cap per call. At normal speed it processes exactly what comes in, so the store stays near 0. A surplus builds up only when cycles arrive in a lump, from a late tick (§1) or from offline time (§5). The surplus is then spent above real-time speed.

| Mechanic | Banks from late ticks? | Banks offline? | Normal rate | Bonus rate (speed-up) | Source |
|---|---|---|---|---|---|
| **Gang** | yes, `process(n)` each tick | yes | 10 cycles processed every 10 ticks (`minCyclesToProcess` = 2 s) | up to 25 cycles per tick (`maxCyclesToProcess` = 5 s): **25×** | [Gang.ts#L99-L110](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Gang/Gang.ts#L99-L110), [Gang/data/Constants.ts#L28-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Gang/data/Constants.ts#L28-L31) |
| **Sleeves** | yes, `process(n)` each tick | yes | 5 cycles every 5 ticks (1 s) | up to 15 cycles per tick: **15×** | [Sleeve.ts#L263-L275](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L263-L275) |
| **Corporation** | yes, `storeCycles(n)` then `process()` each tick | yes | one state (10 cycles) every 10 ticks, so a full 5-state market cycle every 10 s | one state per tick, a market cycle every 1 s: **10×** | [Corporation.ts#L105-L117](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/Corporation.ts#L105-L117), [Corporation/data/Constants.ts#L52-L54](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/data/Constants.ts#L52-L54) |
| **Bladeburner** | yes, `storeCycles(n)` each tick | yes | `process()` every 5 cycles, using 1 s | up to 5 s per call: **5×** | [Bladeburner.ts#L275-L277](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L275-L277), [#L1376-L1381](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/Bladeburner.ts#L1376-L1381), [engine.tsx#L199-L208](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L199-L208) |
| **Stanek's Gift** | yes, `process(n)` each tick, minus 1 per tick | yes | `chargeFragment` takes 1000 ms | 200 ms while `storedCycles ≥ 5`. Each tick with a bonus charge uses 5 cycles: **5×** | [StaneksGift.ts#L46-L62](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/CotMG/StaneksGift.ts#L46-L62), [NetscriptFunctions/Stanek.ts#L47-L52](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/Stanek.ts#L47-L52) |
| **IPvGO** | **no.** `Go.storeCycles` is called only on load | yes, but only if a game has been played (`previousGame` set) | AI `waitCycle` is 200 ms | 40 ms per wait, using 2 cycles: **5×** | [Go.ts#L61-L65](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/Go.ts#L61-L65), [goAI.ts#L877-L883](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Go/boardAnalysis/goAI.ts#L877-L883) |
| **Darknet** | yes, `processDarknet(n)` | yes | drains 1 per tick | drains up to 3 per tick. While `stored > 2 × cyclesPerMutation`, charisma exp is ×1.5 and phishing ×1.3. **(inference)** The mutation clock (`cyclesSinceLastMutation`) counts cycles as they arrive, so it follows real time either way. | [NetworkMovement.ts#L28-L43](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/controllers/NetworkMovement.ts#L28-L43), [DarknetState.ts#L151-L163](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/models/DarknetState.ts#L151-L163), [effects.ts#L119](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/effects.ts#L119), [phishing.ts#L35](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DarkNet/effects/phishing.ts#L35) |
| **Stock market** | yes, `processStockPrices(n)` | yes | one price tick per 6 s of stored cycles | ticks allowed every 4 s of wall clock: **1.5×** | [StockMarket.ts#L234-L251](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/StockMarket.ts#L234-L251), [StockMarket/data/Constants.ts#L4-L5](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/StockMarket/data/Constants.ts#L4-L5) |

The game states the multipliers itself in UI tooltips: Bladeburner "up to 5x", Corporation "up to 10x", Gang "up to 25x" ([Bladeburner/ui/Stats.tsx#L198-L199](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Bladeburner/ui/Stats.tsx#L198-L199), [Corporation/ui/Overview.tsx#L428-L429](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Corporation/ui/Overview.tsx#L428-L429), [Gang/ui/BonusTime.tsx#L23-L24](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Gang/ui/BonusTime.tsx#L23-L24)). The Corporation docs say a full cycle "takes 10 seconds. If you have enough bonus time, it takes 1 second" ([corporation/miscellany.md#L5](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/advanced/corporation/miscellany.md#L5)).

**Reading the store from a script:** these all cost 0 GB ([RamCostGenerator.ts#L130](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L130), [#L296](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L296), [#L374](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L374), [#L491](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L491)):
- `ns.bladeburner.getBonusTime()`, `ns.corporation.getBonusTime()`, `ns.gang.getBonusTime()` and `ns.stock.getBonusTime()` return milliseconds (`storedCycles × 200`).
- `ns.go.getGameState().bonusCycles` returns the IPvGO count.
- The matching `nextUpdate()` promises are also 0 GB (`CycleTiming`).

### Sleeves are the exception: they bank while idle

`Sleeve.process` adds `numCycles` to `storedCycles` **before** it returns early for `!this.currentWork` ([Sleeve.ts#L266-L267](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L266-L267)). An idle sleeve (`setToIdle` → `stopWork` → `currentWork = null`) therefore piles up bonus time 1:1 with real time, even in a foreground window. As soon as it gets a task it works at 15× until the store runs out.

The store is cleared only by `Sleeve.prestige()`, which is called from `prestigeSourceFile`, i.e. when a BitNode ends ([Sleeve.ts#L227-L252](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Sleeve/Sleeve.ts#L227-L252), [PlayerObjectGeneralMethods.ts#L143-L148](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L143-L148)). **(inference)** The bank survives augmentation installs, because I found no reset in the augmentation-install path.

The other mechanics spend their store every tick whether or not anything is assigned:
- Bladeburner still spends stored seconds on stamina, chaos and counts with no action.
- Corporation, Gang and Darknet process every tick.
- Stanek removes 1 per tick.

So they cannot bank by idling in the foreground.

---

## 7. Is using bonus time legal? What TimeCompression detects

**The detector.** `timeCompression()` ([V301/src/Exploits/loops.ts#L15-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Exploits/loops.ts#L15-L31)) is started from `Engine.load` ([engine.tsx#L240](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L240)). It:
- schedules `window.setTimeout(minute, 15000)`
- each time it fires, checks `performance.now() − last < 500`, and if so calls `Player.giveExploit(Exploit.TimeCompression)` and stops
- otherwise records `last` and reschedules

It catches anything that makes a 15 s timer fire in under 0.5 s of `performance.now()` time, e.g. overriding `window.setTimeout` to shrink delays, or tampering with the timer or clock functions.

It cannot be triggered by:
- late timers, from a busy thread or background throttling, since late is always ≥ 15 s
- stored cycles or bonus time, which never touch `setTimeout` delays except Stanek's and IPvGO's own fixed 200 ms / 40 ms
- offline time

**Bonus time is a designed mechanic.** The game's own documentation says some activities "accumulate 'Bonus Time' while the game is closed or in an inactive browser tab" ([offlineandbonustime.md#L23-L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/programming/offlineandbonustime.md#L23-L27)). The tooltips say the same, adding "(e.g. when the tab is throttled by browser)". Spending it is not recorded as an exploit anywhere in `src/Exploits/` ([Exploit.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Exploits/Exploit.ts)).

**What is flagged:** creating stored cycles or time artificially.
- The dev menu has "time skip" and edits for `storedCycles` in every mechanic ([DevMenu/ui/TimeSkipDev.tsx#L17](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DevMenu/ui/TimeSkipDev.tsx#L17), [DevMenu/ui/GangDev.tsx#L17-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DevMenu/ui/GangDev.tsx#L17-L31)). Opening it is `YoureNotMeantToAccessThis`.
- Editing `lastUpdate` or `storedCycles` in the save is `EditSaveFile`.
- Patching timers is `TimeCompression`.

All three are exploits under the run's rules (#1, GLOSSARY "Exploit").

---

## 8. Real-time throughput implications for the run

1. **Bonus time cannot make the run faster overall.** Every stored cycle is a real 200 ms that the mechanic did not process at the time. Spending it faster only gets that mechanic back to where it would have been. The one source that adds cycles nobody would otherwise have, offline time, costs the hacking engine more than it pays (§5). And a reload is only allowed as recovery (#1). **(inference)**
2. **Deliberately stalling the main thread is legal but harmful.** A synchronous busy loop is not flagged, because timers fire late, not early. It converts real time into stored cycles 1:1, but it freezes every script and HGW timer meanwhile. It is never worth it. **(inference)**
3. **Idle sleeves are the one free legal "bank".** **(inference)** A sleeve with nothing useful to do loses nothing by idling. Its time comes back at 15× when it gets a task, for example once a better task opens up (a faction joined, a crime affordable, the gang's karma target). The task is then done with the later, better options. This does not make sleeves *more* productive than working the whole time at the same task, but it makes idle stretches free. The bank is cleared at each BitNode end.
4. **Expect some bonus time after any stall or recovery reload, and don't fight it.** Gang, Corporation, Bladeburner, Stanek and the stock market will run faster for a while after a reload or a long main-thread stall. Scripts that pace themselves on mechanic cycles should wait on `nextUpdate()` (0 GB) instead of assuming fixed periods (10 s for Corporation, 2 s for Gang, 6 s for stocks). They may also read `getBonusTime()` (0 GB).
5. **The hacking engine runs on wall clock and main-thread health.** HGW timings are fixed when the call starts and land late when the thread is busy.
   - Batch landing order should be enforced with `additionalMsec` and real-clock targets, with tolerance for lateness.
   - Keep the number of very short `sleep`s low (4 ms clamp).
   - Keep the visible page cheap to render (Terminal rather than Active Scripts) **(inference)**.
6. **Window hygiene is part of "full speed"** (§4). The page has to stay *visible*: foreground tab, window not minimised, ideally not fully covered by another window, and no screen-off or lock. Otherwise Chrome's 1 s and then 1 min timer alignment applies and scripts crawl. The game itself would keep its cycles through catch-up and bonus time.

---

## Open questions

- **Nested-timer threshold in today's Chrome.** The HTML spec and MDN say the 4 ms clamp starts at the 5th nested call. Chrome proposed raising that threshold (blink-dev "Increased max nesting level for setTimeout(0)", 2022), and the thread suggests it did not ship. I did not find a current Chrome doc that settles it. A measurement in the target browser would settle it.
- **Whether a fully covered (not minimised) window reports `hidden` in the target browser on Windows.** MDN's wording and Chromium's occlusion tracker suggest it does. Verify it with `document.visibilityState` before relying on it either way.
