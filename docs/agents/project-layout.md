# Project layout, build and release

The conventions every ticket of the speedrun spec (#41) builds on. Set by #42.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install. Needs Node 24 or newer. |
| `npm run fetch-game` | Fill the gitignored `.game/` from the pins in `tools/game-pin.ts`. A no-op when `.game/pin.json` already matches; `-- --force` refetches. Run it before `typecheck`. |
| `npm run typecheck` | `tsc` over both projects (game scripts, then Node code). |
| `npm test` | Vitest, once. |
| `npm run build` | Clean `build/`, then compile `src/` into it. |
| `npm run ram-check` | The static RAM budget gate over `build/` (run `build` first; `-- --build <dir>` for another folder). |
| `npm run smoke` | The Playwright smoke test over `build/` in the real game (run `build` first). `-- --once` skips the retry, `--headed` shows the window, `--build <dir>` tests another folder. Needs Chromium once: `npx playwright install chromium`. |
| `npm run record-formulas` | Dev only: re-record the formula model's golden values (`test/golden/formulas.json`) with `ns.formulas.*` in the real game, on lab saves. `-- --headed` shows the window. Never part of CI. |
| `npm run dev` | The dev loop (#50): compiles `src/` on every change and pushes it into the connected game over the Remote API (port 12525 by default), and captures a milestone save whenever the run reaches a new milestone. `-- --open new` or `--open <milestone>` opens the game in its own window, and `--lab <save.gz>` resumes a lab save. |
| `npm run scenario -- <milestone>` | A scenario test, local only: loads `saves/<milestone>.gz`, types the start command once, and passes when the run reaches the next milestone (or `--until <name>`) on the current build. Headed, with `--timeout 12h` by default. Refuses to run in CI. |
| `npm run live` | The live split reader (#51): our Remote API server on port 12525 (`-- --port`, `--host`). Point the game's Options → Remote API at it and press Connect. It prints the split table whenever `sr/state.json` changes and exports the run at the finish line. `-- --once` prints once, `--export` exports now; both then exit. |
| `npm run compare -- <a.json> <b.json>` | Compares two exported runs, net times by default (`--gross`, `--both`). Exits 1 on runs of different categories. |
| `npm run publish-release` | Push `build/` to the orphan `release` branch. CI runs it; for a local try, `-- --remote <path to a bare repo>`. |

## Folders

| Path | Holds |
|---|---|
| `src/` | Game scripts in TypeScript. **`src/` mirrors home:** `src/boot.ts` becomes `boot.js` at the root, and every other script goes under `src/sr/`. Nothing else may live in `src/` except tests. |
| `src/**/*.test.ts` | Unit tests, next to the code they test (seams A–E). Never compiled into `build/`. |
| `tools/` | Node-side scripts (`fetch-game`, `publish`, `ram-check`, `smoke`, `dev`, `scenario`, `live`, `compare`), in TypeScript run directly by Node (type stripping, no build step). Their tests sit beside them. |
| `tools/harness/` | The Playwright harness (#46): the game in Chromium, the local release, our Remote API server and the smoke test's pure verdicts. Reused by the dev loop and scenario tests. |
| `test/` | Tests and checks that belong to no single file, such as `ns-api-guard.ts`, which proves the typecheck catches Netscript misuse, and `ci-gate.test.ts`, which pins the gate order in the workflow. |
| `test/golden/` | Golden-value fixtures recorded from the real game (`formulas.json`, by `npm run record-formulas`). Never edited by hand. |
| `runs/` | gitignored. Exported runs, `<date>-<category>-<build>.json`, and the rollback watcher's logs in `runs/watch/<startedAt>.json`. |
| `.smoke/` | gitignored. A failed smoke attempt's screenshot and terminal text (CI uploads it as the `smoke-evidence` artifact). |
| `saves/` | Milestone saves (#50), committed: `<milestone>.gz` (the game's own gzip save) plus the sidecar `<milestone>.json`. A scoped milestone's `:` is spelled `~` in the file name. Written only by the listener. |
| `lab-saves/` | gitignored. Lab saves, in the same format with `kind: "lab"`. Never a scenario start. |
| `.dev/` | gitignored. The dev loop's throwaway compiles. |
| `.game/` | gitignored. `app/` = the v3.0.1 static build (the zip's `resources/app/`), `source/<repo path>` = pinned game source files. The game's code is never committed. |
| `build/` | gitignored. Exactly the files the release ships. |

## TypeScript rules

- **Two projects.** `tsconfig.json` covers game scripts: browser globals, no Node types, emits to `build/`. `tsconfig.node.json` covers `tools/`, `test/` and all tests: Node types, no emit. Both extend `tsconfig.base.json`.
- **Netscript types:** `import type { NS } from "@ns";`. `@ns` maps to `.game/source/src/ScriptEditor/NetscriptDefinitions.d.ts`. It is always a type-only import, so it leaves no trace in the JS.
- **Relative imports carry `.ts`:** `import { decide } from "./decide.ts";`. `tsc` rewrites them to `.js` in `build/`, and Node and Vitest run them as written.
- **Erasable syntax only:** no `enum`, `namespace` or parameter properties. Node's type stripping needs this, and `erasableSyntaxOnly` enforces it.
- **`boot.js` imports nothing at runtime.** The game charges RAM for every imported file. Every name in a game script also counts toward RAM if it matches an NS function (see `docs/research/delivery-wget.md`, section 6).

## Release

- **Branch:** `release` is an orphan branch holding only built files. `boot.js` and `manifest.json` sit at the root, everything else under `sr/`. `publish` refuses any other layout.
- **Two commits per publish, pushed together:** (1) the built files, then (2) the same tree plus `manifest.json`:
  ```json
  { "sha": "<commit 1>", "source": "<main commit>", "files": { "boot.js": "<sha256>", "sr/x.js": "<sha256>" } }
  ```
  - `sha` is the ref for SHA-pinned URLs: `https://raw.githubusercontent.com/anaconda186/bitburner/<sha>/<path>`.
  - `source` is the main commit the build came from (the state file's `buildSha`).
  - `files` lists every file except `manifest.json`, as the sha256 of its exact bytes.
  - The manifest is read by older `boot.js` copies saved in players' games, so treat its shape as a contract: add fields, never rename or remove them.
- **History is kept.** Each publish's parent is the previous release tip, so older pinned SHAs keep working. The push is a plain fast-forward; if `release` moved, it fails and nothing changes.
- **Start command:** `wget https://raw.githubusercontent.com/anaconda186/bitburner/release/boot.js boot.js; run boot.js`, submitted twice on a fresh save.

## Boot and the conductor (set by #43)

- **`boot.js` starts with the live-run guard** (#44). If `ns.ps("home")` shows `sr/conductor.js`, or a `boot.js` with a lower pid than its own, it prints `boot: run already live` and exits, touching nothing. Of two boots started together, the later one stands down. Then it reads its one argument, `--category <open|strict>` (or `--category=<x>`); anything else prints an `ERROR boot:` line with the usage and exits.
- **`boot.js`** fetches `manifest.json` from the `release` branch, hashes every listed file already on home (sha256 of its text as UTF-8, the same bytes the manifest hashes), and fetches only the missing or changed ones from `<manifest sha>/<path>`. boot.js is in the list too, so home's copy follows the build. It retries the manifest and each failed file forever, printing each failure with `tprint`, with the backoff 1, 2, 4, 8, 16, then 30 s. Then it calls `ns.spawn("sr/conductor.js", { spawnDelay: 0, temporary: true, preventDuplicates: true })`.
- **`sr/conductor.js` is a fixed entry point.** Old copies of boot.js in players' saves spawn it by name, so it never moves or gets renamed.
- **Temporary scripts:** boot.js is the only script started non-temporary (by the terminal, autoexec or a reset callback). Every script a run script launches passes `temporary: true` (the casino is the one planned exception, #23).
- **The conductor** (`src/sr/conductor.ts`) loops snapshot → `decide` (`src/sr/decide.ts`, pure) → act, once a second. Each iteration sits in a try/catch that prints `ERROR conductor: ...` with `tprint` and waits `backoffMs(failures)` (`src/sr/backoff.ts`). A `ScriptDeath` (a kill or a reset) is rethrown, never retried.
- **Backoff:** `src/sr/backoff.ts` for everything under `sr/`. boot.js keeps an identical copy (`retryDelayMs`), because it may import nothing. Both have the same tests.

## State file (set by #44)

- **`sr/state.json` on home** holds only what the game forgets: `v, category, startedAt, buildSha, updatedAt, milestone, splits, reloads, builds`, then `installs, resetAt` (#49), in that order, then any newer fields.
- **Writers:**
  - `boot.js` creates the file only when it is missing, after the fetch. `startedAt` and `updatedAt` are set to the moment that boot started, `buildSha` to the manifest's `source`, the category to the argument or `open`, and the lists start empty.
  - An existing file is never written by boot. A different `--category` is ignored with `WARN boot: this run is category <c>; --category <x> ignored`.
  - After that, only the conductor writes it. `test/state-writers.test.ts` enforces this on the sources: the path is spelled out only in `boot.ts` and `sr/state.ts`, and `STATE_FILE`/`stateWrite` reach the game only through `sr/run-state.ts`, which only the conductor imports.
- **Pure rules (seam E), `src/sr/state.ts`:**
  - `parseState(text)` returns `{ok, state} | {ok:false, error}`. `""` means missing. Every field except `startedAt` gets a default. Unknown fields are kept. A newer `v` than `STATE_VERSION`, a wrong-typed field or an unknown category is refused.
  - `serializeState(state)`.
  - `stateWrite(state, last, nowMs)` returns `{state, text} | null`. It writes on any change and every `REFRESH_MS` (10 s), with `updatedAt = nowMs`.
  - `CATEGORIES` and `DEFAULT_CATEGORY` are exported too. boot.js keeps import-free copies of the path, version and categories, and `src/boot.test.ts` checks them against `state.ts` by behaviour.
- **The conductor's hold:** `openRunState(ns)` in `src/sr/run-state.ts` returns `{ state, keep(nowMs) }`, or prints `ERROR conductor: <why>` and returns null. The conductor then exits, so a build that can't use the file refuses to run and leaves it untouched. `keep` runs once per iteration, after `carryOut`. Later tickets that change the state (milestones, splits, reloads, builds) add pure functions to `state.ts` and a setter on the record.
- **Schema growth:** add fields with a default in `parseState`, never rename or remove one, and bump `STATE_VERSION` (and boot's copy) only for a true break.

## Helpers, snapshot and actions (set by #47)

- **A helper** is a one-purpose entry script in `src/sr/h/` (home path `sr/h/<name>.js`), written as `main` calling `serve(ns, (arg) => <one call>)` from `src/sr/h/serve.ts`. It is launched with `exec` (1 thread, temporary) and two arguments: the argument as a JSON string, and a reply port. It writes exactly one `Reply` (`{ ok: true, value }` or `{ ok: false, error }`, in `src/sr/helper-contract.ts`) to that port and exits. `serve` also replies from `atExit` if the helper is killed or crashes. Values must be plain JSON: no Map, no class instances.
- **Registering:** add every helper to `src/sr/helpers.ts`. A probe goes in `PROBES` (plus its value type in `ProbeValues`), and an action helper goes in `CALLS`. Give it a row in `tools/ram-budget.ts`. `src/sr/helpers.test.ts` fails if a helper in `src/sr/h/` is not registered. `src/sr/h/serve.ts` is copied next to any helper launched off home, so it must import nothing at runtime.
- **Probes** fill snapshot fields: `snapshot.probes[name]` is the latest reply plus `atMs`. A probe is launched and not awaited, and its reply lands in the snapshot on the next loop. It is relaunched once its reading is `maxAgeMs` old.
- **Action helpers** (`{ kind: "call", script, arg, host }`) are launched one at a time and awaited. Their outcome lands in `snapshot.lastCall`. At most one per `decide`, and none while `snapshot.callRunning`.
- **Placement:** sub-deciders return `Want`s (actions without a host). `place(snapshot, wants)` in `decide.ts` is the last step of `decide`. It drops any helper that fits nowhere or has no known RAM cost. Home comes first, then the rooted server with the most free RAM.
- **A failed launch** (scp, exec or a throw) is "not done". It is never fatal, and `decide` wants it again next loop.
- **Conductor RAM:** 3.85 GB of its 4 GB budget. `tools/ram-budget.test.ts` keeps boot's and the conductor's budgets at 8 GB or less in total. Every identifier reachable from the conductor (`decide.ts` and its imports included) that is named like an NS function is charged; `probe` is one of them (`dnet.probe`).

## Long-lived workers (set by #72)

- **A worker** is a helper-shaped script that keeps running: the BN8 trader now, the money engine and the driver later. It lives in `src/sr/h/` and is registered in `WORKERS` in `src/sr/helpers.ts` as `{ script, port, files }`. `port` is its fixed status port, below `REPLY_PORT_BASE` (the trader has port 1). `files` lists every library it imports beyond the helper runtime; they are copied with it when it runs off home, and `src/sr/helpers.test.ts` checks the list against its imports.
- **Launch:** like a helper (`exec`, 1 thread, temporary), with args `[argJson, statusPort]`. The conductor clears the port first.
- **Reports:** the worker keeps one `WorkerReport` (`{ pid, atMs, value }`, `helper-contract.ts`) on its status port, replaced with `postReport` from `h/serve.ts` as it works. Its `value` is the worker's own news (the trader's is `TraderNews`: ticks, oracle, cash, net worth, positions, orders, closes).
- **Liveness:** each loop the conductor peeks the port and checks `isRunning` on the pid it launched and the pid in the report. So a conductor started again by boot adopts a live worker instead of starting a second one. After a reload the port is empty and nothing runs, so the worker is started again.
- **Restart rule (pure):** `src/sr/workers.ts` keeps a record per worker (`afterLaunch`, `observeWorker`). A failed launch, or a worker that dies within `HEALTHY_MS` (60 s), adds a failure; one that ran that long is forgiven. `decide` wants `{ kind: "start", worker, arg }` when the worker is wanted, isn't running, and `backoffMs(failures)` has passed since the last failure. `place` puts it like a probe.
- **No stop yet.** Killing a worker from the conductor would cost `kill` (0.5 GB), which it can't afford. A later ticket that needs a stop should send it over the port or through an action helper.
- **Control ports (#53):** a worker that takes instructions has `control` (a second fixed port below `REPLY_PORT_BASE`) in its `WorkerSpec`. The conductor peeks every control port into `snapshot.controls[name]` (absent when empty). A `{ kind: "control", worker, message }` action needs no RAM; `place` passes it through in order, and the conductor clears the port and writes `message`. The worker only ever peeks it, so a worker started again finds its instructions waiting. Ports are empty after a reload or a reset until the conductor writes them again, so a worker must treat an empty port as a safe default.
- **`homeHeadroom` (#53):** a worker with this flag goes on home only if `homeReserveGb(snapshot)` stays free beside it (see the money engine below).
- **Handing over:** a worker that starts a copy of itself posts its last report with the copy's pid (`postReport(ns, port, value, pid)`), so the conductor sees the copy alive and starts no other.

## The money engine (seam B, set by #53)

- **Rooting is the conductor's.** The action helper `root` (`sr/h/root.js`, 1.90 GB, in `CALLS`) takes `{ hosts }`, runs every port opener and NUKE on each and replies `{ rooted }`. `decide` calls it with every host the network probe found that isn't in `freeRamGb` (so isn't rooted), at most every `ROOT_EVERY_MS` (10 s, judged on `snapshot.lastCall`). On a fresh save this roots the 0-port servers within seconds, which is what gives the engine its first host.
- **The worker** `engine` (`sr/h/engine.js`, 4.65 GB, status port 2, control port 3, `homeHeadroom`). Its argument is `{ control }`. Each loop (500 ms) it peeks its orders, reads the world (scan, root, max and used RAM of every rooted server; money, security and required level of every rooted server with money; `getPlayer`; `self()` for its own host and RAM), asks `schedule` for jobs and `exec`s them (1 thread each script, `temporary`), copying the job scripts to a host first. Its report value is `EngineNews` (`host, split, jobs, threads, launched, refused, lastError`).
- **Job scripts** `sr/j/hack.js` (1.70 GB), `grow.js` and `weaken.js` (1.75): one call each, args `[target, additionalMsec]`. `JOB_RAM_GB` holds their per-thread cost, and `src/sr/money-engine.ram.test.ts` checks it against the game's calculator.
- **Orders** (`EngineOrders` in `src/sr/money-engine.ts`): `{ split: { money, exp, sharing }, homeReserveGb }`. The split is fractions of the engine's RAM (spec: money, exp, share, plus off = all 0). The share part is called `sharing` because a field called `share` is charged as `ns.share` (2.4 GB) to everything that imports the module, the conductor included. `readOrders(raw)` makes an empty or malformed port `ORDERS_OFF`.
- **`decide`'s side:** `engineOrders(snapshot)` sends `ramSplit(resetPoint(snapshot))` (#58, below), off in BN8 and off until the route probe has read. `homeReserveGb(snapshot)` is the dearest probe or action helper that may run now (the route probe's 2.6 GB in BN1; 5.6 with the sleeves probe). The orders are written whenever the port reads differently, and the engine is started (like any worker, with backoff) whenever they aren't off. Off doesn't stop a running engine: it launches nothing. **#56 (casino) and later plans change the split here.**
- **The scheduler** (pure, seam B): `schedule(snapshot, orders) → Job[]`. A `Job` is `{ script, host, target, threads, additionalMsec, landsAtMs, steal, securityRise }`. `EngineSnapshot` is `{ nowMs, engineHost, engineRamGb, hosts: HostView[], targets: TargetView[], player, mults, inFlight: Job[] }`.
  - **RAM:** a host's room is its free RAM minus, on home, `homeReserveGb`. The pool is every host's room plus what the engine's own jobs in flight hold there; the money share of the pool, minus the money jobs in flight, is what new money jobs may take.
  - **Drain** (the only stage so far): each step gives the target paying most per GB-second (chance × money × one thread's fraction, per hack-second at today's security) the threads it takes to steal everything that will be left of its money, `ceil(1/fraction)`, on the host with the most room. Targets are projected through the hacks in flight: money × (1 − steal) each, security + `hackSecurityRise` each. A target needs at least $1 and a level the player has.
  - **The move to home:** `moveHome(snapshot, orders)` is true when the engine runs elsewhere and home has the engine's RAM plus the reserve free. The engine then `exec`s itself on home with `{ control, inFlight }`, posts its report with the copy's pid and exits. While the engine is elsewhere and home will have room once its own jobs there land, the scheduler keeps that room free on home, so the move can happen.
  - **In flight:** `stillInFlight(jobs, nowMs)` keeps a job until `landsAtMs + LAND_SLACK_MS` (1 s). That book is the engine's only memory; a reload or reset kills the jobs anyway, and an engine that died alone at worst hacks a target once more.
  - **BitNode multipliers (#57)** come with the orders: `EngineOrders.mults` (a `NodeMults`), which `readOrders` requires (orders without them are off). `decide`'s `engineOrders` fills them from `nodeMults(route, reading)` in `src/sr/node-mults.ts`: the `bitnode` probe's reading (`sr/h/bitnode.js`, `getBitNodeMultipliers`, 5.6 GB; launched only with SF5 or in BN5, and only until it has read once), else `NODE_MULTS_TABLE` (BN1 all 1; BN4 `ScriptHackMoney` 0.2, `HackExpGain` 0.4, `CloudServerSoftcap` 1.2, from `BitNode.tsx:633`), else BN1's. The fixed front of the BitNode order (BN1.1, BN4.1-4.3) is the only stretch without SF5, so the table needs no more rows. A new field read by a formula goes in `NodeMults`, `NEUTRAL_MULTS`, the table and the probe's `FIELDS`.
- **Placement on a fresh save:** home (8 GB, conductor 3.85) can't hold the engine with the reserve, so `place` puts it on the rooted server with the most free RAM, a 16 GB 0-port server. Probes then keep home's 4.15 GB, since the engine never fills the reserve and drain finds no room for a hack thread in what is left.
- **Batches (#57):** `schedule` batches one target when the money RAM can run batches at the spacing, and drains the other targets with the RAM the batch pipeline won't need. With too little RAM for that (`starved`) it drains, and batches only when drain finds nothing.
  - **The target** (`chooseTarget`, #58): rooted targets with money, growth, base security above 0 and a level the player has, ranked live by what their batches would earn on the money RAM (`sizeBatches`, our formulas: income per GB-second). With nothing batched yet the best is batched. Otherwise the batches stay (the target of the latest batch job) unless the best earns `switchRatio` (1.25) times as much; that one is then prepared on the side (purpose `prep`: weaken to the minimum, grow to full) with at most `prepShare` (0.1) of the money RAM, never hacked, and the batches move to it once it is `ready` (minimum security and full money as read, none of its prep still to land).
  - **Free slots first:** a batch is fitted into every free slot from the earliest landing on, before a late one is added (#57's in-game pipeline drain, regression test in `money-engine.batch.test.ts`).
  - **A batch** is hack, weaken, grow, weaken, landing `landGapMs` (100 ms) apart; batches land `spacingMs` (1 s, the spec's tunable) apart. Every job of a batch is launched at once, padded with `additionalMsec` to its landing; its duration is taken from the target as it is now (the call starts at once and fixes it). Slots are filled from the earliest landing a weaken launched now allows to `launchAheadMs` (2 s) past it, so each loop adds a batch or two and none is skipped.
  - **Sizing** (`sizeBatches`): `held` = one batch per spacing over a weaken at minimum security plus the launch lead, plus one. Each batch gets the most hack threads whose batch fits `pool / held` GB, up to `maxSteal` (0.9) of the money. So the fraction stolen rises and falls with the RAM. A grow is never split over hosts (each piece would raise the security the next grows at), so no batch's grow is bigger than the biggest host.
  - **The projection:** the target as read now plus every job of the engine's still to land, applied in landing order with the formulas (a hack as if it succeeds: the worst case), is what each new batch is planned on. So the batch's first weaken and grow also repair any drift (repair threads). A projection that is badly drifted (security over min by more than `badSecurity` 5, or money under `badMoney` 0.5 of the max), or drifted at all while no hack is on the way (a target being prepared), gets a repair wave instead: weaken to the minimum, grow to full, weaken; no hack that loop. Hacks then land only after the repair.
  - **The guard:** nothing is launched on the target while one of its jobs lands within `guardMs` (50 ms), since the new job's duration would be read from the security before it. The engine's 500 ms loop always meets a quiet window (a batch's landings span 300 ms of each second).
  - Tunables: `ENGINE_TUNABLES` in `money-engine.ts`. Move them into the spec's global tunables table when one exists.
  - **The outlook** (`outlook(snapshot, orders)`, `EngineOutlook`): the best target's modelled batch income on all the engine's RAM and on twice that, posted in `EngineNews.outlook` for the fleet rule. In the unit tests' simulated game the batches earn within 15% of it.
- **The engine reads** `getServerMaxMoney`, `getServerMinSecurityLevel`, `getServerGrowth` and (#58, for ranking) `getServerBaseSecurityLevel` too (5.05 GB; budget 5.1, a hair over in the float sum). Every server with a maximum above 0 is a target, money or not. Thread counts are called `hackThreads` and `growThreads` in the code: a bare `hack` or `grow` identifier is charged as `ns.hack` or `ns.grow`.
- **The exp farm (#58)** fills the `exp` part of the split (`farmJobs`). A cycle is a 1-thread grow, then the hack threads, then a weaken for both, landing a `landGapMs` apart, cycles at least `farmSpacingMs` (250 ms) apart, grows and hacks launched at most `farmLeadMs` (1 s) before their duration lands them. The grow keeps money on the server, so every hack earns full exp (a hack on an empty server earns a quarter). Targets rank by exp per GB-second of hack threads at minimum security (`farmRate`: exp × (chance + (1 − chance)/4) per GB × hack time); the one farmed stays unless another earns `switchRatio` times as much; one target's cycles are capped by the spacing and the biggest host, and the rest of the exp RAM goes to the next target. A target above its minimum security is weakened first (purpose `farmPrep`). The farm keeps off the targets the money jobs use. The unit tests show more than twice the exp per GB-second of grow plus weaken on the same RAM.
- **Share (#58)** fills the `sharing` part (`shareJobs`): job script `sr/j/share.js` (`SHARE_JOB`, 4.0 GB a thread: base 1.6, `share` 2.4), one 10 s `ns.share()` each (`SHARE_MS`), roomiest host first, target `""`. They end within 10 s, so a split change reaches them within 10 s.
- **Purposes:** every `Job` has `purpose` (`drain`, `batch`, `prep`, `farm`, `farmPrep`, `sharing`) and `launchedAtMs`. Each part of the split counts only its own purposes' jobs in flight against its share of the pool.
- **The RAM split (#58,** `src/sr/ram-split.ts`, a pure sub-decider**):** `ramSplit(point, SPLIT_TUNABLES)`. Points (`ResetPoint`): `off` (nothing); `expStart` (all exp); `saving` (all money); `working { favor }` (`shareFraction` 0.25 share and the rest exp under `donateFavor` 150, all money at it); `climb` (all exp). `SPLIT_TUNABLES`: `expStartMs` 600,000, `shareFraction` 0.25, `donateFavor` 150. `resetPoint(snapshot)` in `decide.ts`: `off` until the route is read and in BN8 (its exp-only engine, story 104, is the BN8 tickets' to switch on, keeping the trader's room); `expStart` for `expStartMs` after `snapshot.fleetBoughtAtMs`; else `saving`. **Hooks:** #56 returns `off` while the casino runs, #59/#61/#65 return `working` with the faction's favor, #64 `climb`.
- **The exp start's clock:** `fleetBought(snapshot, orders)` in `fleet.ts` is true on a fresh fleet reading with every slot owned and no purchase the rule would make now. The conductor keeps the first time it saw that (`Memory.fleetBoughtAtMs`, no NS call) and passes it as `snapshot.fleetBoughtAtMs`. It is conductor memory: a reload during the exp start begins it again (at most another `expStartMs` of exp); a reset restarts the conductor, so each reset gets its own.
- **A split change steers new launches only:** jobs in flight keep their RAM until they land. In the game (BN1.1, hacking 300) the money part's grows and weakens held the whole fleet for minutes after a switch to exp, so a short exp start farmed nothing. Freeing it would need the engine to kill over-share jobs (`ns.kill`, +0.5 GB); not done.
- Keep `money-engine.ts` and `ram-split.ts` free of NS-named identifiers (`hack`, `grow`, `weaken`, `share`, `ps`, …); `ram-check` shows the conductor's and engine's cost.

## The fleet (set by #57)

- **The rule** (`src/sr/fleet.ts`, a sub-decider of `decide`): `nextDoubling` is the cheapest step across the slots: double an owned cloud server, or fill an empty slot at the size of the smallest server owned (`FLEET_TUNABLES.baseRamGb`, 8 GB, while there is none), within the game's RAM limit. Prices are `cloudServerCost` with the engine's BitNode multipliers. `fleetPurchase` takes it only if its payback (`cost / (GB added × the outlook's marginal income per GB)`, the marginal being `(incomeAt2xPerSec − incomePerSec) / poolGb`) is at most `paybackS` (600 s) and the money left after `plannedAugReserve(s)` covers it. That reserve is 0 until an aug plan (#60 and later) sets it.
- **Slots:** `sr-00` … `sr-24` (`FLEET_HOSTS`). While `driverWanted` (BN1.1), `sr-00` is the driver's host (#54 buys it at 32 GB): `decide` passes it to `fleetWant` as reserved, so the rule never buys it and keeps its slot free, but doubles it like any other once it exists. Elsewhere it is a slot like any.
- **One purchase per action:** `fleetWant(s, orders, reserved, reserve?)` wants one action-helper call, only while the engine's money split is on, and only with a `fleet` reading the probe took (its own `readAtMs`, not the collection time) after the last purchase call, which also lists every server in `snapshot.boughtServers` (#54: `purchaseServer` renames a taken name instead of failing, so a stale reading would buy a slot twice). The `fleet` probe has `afterCalls` (a new `ProbeSpec` field) naming the two purchase helpers, so it is read again right after each one. About one purchase every two or three conductor loops.
- **No import loops:** `fleet.ts` takes the orders as an argument rather than importing `decide.ts`'s `engineOrders`. The game refuses to load a script whose imports go round in a circle (a RUNTIME ERROR at start), though Node and Vitest don't mind; `test/no-import-cycles.test.ts` checks every game script.
- **Helpers:** `buyServer` (`sr/h/buy-server.js`, 3.85 GB, `{ host, ram }` → the hostname; `ns.cloud.purchaseServer`'s `""` becomes a failed reply; shared contract with #54), `fleetUpgrade` (`sr/h/upgrade-server.js`, 1.85 GB, `{ host, ram }` → the hostname; not called `upgradeServer`, which is charged as `ns.cloud.upgradeServer`). The probe `fleet` (`sr/h/fleet.js`, 2.9 GB) gives `{ servers: { host, ramGb }[], limit, ramLimitGb, money }`.
- **The home reserve** is now the buy helper's 3.85 GB (the dearest action helper).

## The driver (set by #54)

- **Its host:** in BN1.1 (`driverWanted`: BN1, SF1 not owned) `decide` buys `sr-00` at 32 GB (`DRIVER_HOST`, `DRIVER_HOST_RAM_GB`) through the action helper `buyServer` (`sr/h/buy-server.js`, 3.85 GB: `{ host, ram }` → the hostname from `ns.cloud.purchaseServer`, a failed reply when the game buys nothing). It buys once the `stats` probe's money reaches `cloudServerCost(32)` ($1.76m), only after the network probe has read, and tries a failed purchase again after `BUY_RETRY_MS` (10 s). The run's cloud servers are named `sr-00` … `sr-24`; the fleet (#57) owns the rest.
- **Never twice:** `purchaseServer` renames a duplicate (`sr-00-0`) instead of failing, so a server counts as there when the network probe lists it or when this conductor bought it (`snapshot.boughtServers`, from the conductor's own record of `buyServer` replies; no NS call).
- **The worker** `driver` (`sr/h/driver.js`, 27.25 GB: base 1.6, `document` 25, getPlayer 0.5, fileExists 0.1, hasTorRouter 0.05; status port 4, control port 5). `WorkerSpec.host` pins it to `sr-00`: `place` puts it there or nowhere, before any probe. The engine's orders carry `hostReserveGb: { "sr-00": <driver RAM> }` in BN1.1, so the money engine never fills the driver's room (a static reserve: a driver that died finds its room still free).
- **The UI kit** `src/sr/ui.ts` names `document` and nothing else of the page: `waitFor` (polls every 50 ms, throws after `UI_WAIT_MS`, 10 s), `withText`, `startingWith`, `sidebarItem` (text ends with the label), `goTo(page)`, `reactProps`, `trustedClick` (the faked trusted click; Open category, guarded buttons only), `setInput` (native setter plus `input` event) and `typeCommand(line)` (Terminal page, enabled input, value, Enter; `;` chains). Any script importing it pays the 25 GB. The conductor and helpers never import it. `src/sr/driver.ram.test.ts` prices the driver with the game's calculator: one `document` charge, no `window`, at most 32 GB.
- **Jobs** (`src/sr/driver-jobs.ts`, pure): `DriverJob` is `options`, `tor`, `buy { programs }` or `travel { city }`. The conductor keeps one `DriverOrder = { seq, job }` on the control port; the driver posts `DriverNews = { host, facts: { money, city, tor, programs }, optionsSet, done, lastError }`. `decide` writes the next order (`seq` one above both the port's and `done`) only once `news.done` has reached the port's `seq`, so jobs run one at a time and a driver started again redoes the waiting one. Every job checks the game first, so redoing a finished one changes nothing.
- **Spending order** (`nextDriverJob(news, wantedCity)`): the options (no money), then TOR ($200k), then BruteSSH ($500k), then travel to `wantedCity` ($200k), then the other port openers in price order, as many as the money covers, in one `buy a; buy b` chain. Each step waits for its money before anything later. `buy -a` isn't used: it goes on to Formulas.exe ($5b) and the other dark web items. **`wantedCity(snapshot)` in `decide.ts` returns null today; #56 (the casino in Aevum) and #59 (city factions) fill it in.**
- **What the jobs do:** `options` sets autoexec to `boot.js` (Options → System) and turns on "Suppress faction invites", "Suppress travel confirmations" and "Suppress augmentations confirmation" (Options → Gameplay), and clicks the save icon if it changed anything, so a reload keeps them. `tor` goes City → any tech vendor → "Purchase TOR router" (Chongqing and New Tokyo have none; TOR comes before any travel). `buy` types into the terminal. `travel` clicks the city on the Travel page (its letter on the world map, or the "Travel to <city>" button with ASCII art off). Every job ends back on the Terminal page.
- **Failure:** any error (a UI wait timing out included) ends the driver after `ERROR driver: <why>; exiting, the conductor starts it again`, and the worker restart rule brings it back with backoff.
- **Milestone** `bn1.1:driver` (`BN1_1` in `milestones.ts`): the driver runs and has reported.

## The casino (set by #55)

- **The worker** `casino` (`sr/h/casino.js`, 54.6 GB: base 1.6, `window` 25, `document` 25 through `sr/ui.js`, exec 1.3, getMoneySources 1, getPlayer 0.5, getServerMoneyAvailable and isRunning 0.1 each; status port 6, no control port). It is the only script that names `window` (`src/sr/casino.ram.test.ts` checks this and its DOM charges against the game's calculator), and it fits a 64 GB cloud server (`CASINO_HOST_RAM_GB`). Its argument is `{ category }`; anything but `"open"` is refused (faked clicks and script reloads are Open only).
- **Non-temporary:** `WorkerSpec.survivesReload` makes the conductor's launch non-temporary (`launchHelper`'s last parameter); only the casino has it. So each save records the casino as running, and the game starts it again after every reload, on the same server with the same arguments, and it posts its report again. Every other run script stays temporary.
- **Each load:** first line `window.onbeforeunload = null`; then the cap check (`getMoneySources().sinceInstall.casino > 10e9`, `capReached`), before navigating and before each hand, never from the page; then a check that the player is in Aevum (else it fails); City → Iker Molina Casino → Play blackjack. Each hand: bet `betFor(money)` (all in, at most $100m), click the save icon and wait until IndexedDB holds a different save, then Start, Hit/Stay (`shouldHit`, basic strategy) with `trustedClick`, all in one synchronous task. The outcome comes from the money before and after (`handOutcome`), not the page. A loss calls `window.location.reload()`.
- **The way out:** at the cap or after any error (a UI wait timing out included), it posts its report and runs `boot.js` on home (`exec`, temporary, no arguments), trying every 2 s for a minute unless the conductor is already running. A reload never reaches that code; a kill (ScriptDeath) doesn't launch boot.
- **Its report** (`CasinoNews` in `src/sr/blackjack.ts`, read with `readCasinoNews`): `{ host, phase: "starting" | "playing" | "capped" | "failed", hands, winnings, lastError }`. `hands` counts this load only.
- **Not built here (#56):** no `decide` wants it yet. #56 adds the start (`{ kind: "start", worker: "casino", arg: { category } }`, placed on the 64 GB server), "wait" while it runs, the relaunch, the skip rule, boot's casino check and travel to Aevum (`wantedCity`).

## The BN8 trader (seam C, set by #72)

- **`src/sr/trades.ts`** is pure. `decideTrades(snapshot) → Order[]`, where the snapshot is `{ cash, oracle, stocks: StockView[] }` and an order is `{ kind: "buyLong" | "sellLong" | "buyShort" | "sellShort", sym, shares }`. Sells come first, then buys. It also exports `tickEdge`, `netWorth`, `appendPrice` and `TRADER_TUNABLES` (trend window 45 ticks, horizon 100, trend z 1, hold fraction 0.5, commission $100k).
- **Edge:** `(2·forecast − 1) · volatility / 2` per tick. The oracle trader reads both from the 4S TIX API. The price-only trader uses the share of up-ticks over the last 45 moves (zero unless more than one standard error from even) and the mean absolute log move. Stocks rank by `|edge| · 100 − 2 · spread`, and each buy must earn more than its commissions (two for a new position, one for a top-up). A position is sold when its edge flips or falls to half the entry threshold. An unknown edge (fewer than 45 moves seen) holds what is held and buys nothing.
- **`src/sr/h/trader.ts`** is the thin shell, 26.75 GB. It loops on `stock.nextUpdate()`, reads every stock, places the orders at market and reports. It turns oracle whenever `has4SDataTixApi()` is true. A tick that throws is printed and retried after 6 s.
- **When it runs:** `traderWanted(snapshot)` in `decide.ts`: the `route` probe says BN8 and the `market` probe (`sr/h/market.js`, 1.65 GB: `hasTixApi`) says TIX. The BN8 session plan (#73, #74) narrows this. It will also need a cash reserve and a stop, which this ticket doesn't build.
- **Model cases:** `docs/research/bn8-stocks-model/golden.py` exports `golden.json` from the model's own traders. `src/sr/trades.model.test.ts` checks edge directions, closes and entry sides against them.

## BitNode order and milestones (set by #48)

- **The order** is one table, `BITNODE_ORDER` in `src/sr/order.ts`: 45 `{ bn, level, finish }` entries, `finish` being `"hacking"` or `"blackops"`. Change the order only there.
- **Position** (`position(route)` in `order.ts`) follows from `RouteFacts = { currentNode, ownedSF }` alone. It gives `playing` (the current BitNode at the level above the one owned), its `index` in the order (-1 if it's not in it), `onRoute` (true when `playing` is the first destruction not yet owned), `next` (the BitNode to enter on destroying this one, or null when that reaches the finish line) and `finished`. Nothing about the position is stored.
- **The `route` probe** (`sr/h/route.js`, 2.6 GB, `maxAgeMs` 60 s) reads `getResetInfo` and returns `RouteFacts` plus `lastAugReset` and `lastNodeReset` (#49), with `ownedSF` as a plain object. The conductor can't afford `getResetInfo` itself. So `snapshot.probes.route` is the snapshot's route; until it lands, nothing that needs the position is known.
- **Milestones** (`src/sr/milestones.ts`): `{ name, scope?, test(snapshot, route) }`.
  - The spine (`SPINE`) is `bn<N>.<L>`, one per entry, and has no scope. Its test is SF N ≥ L, so it passes just after the destruction, in the next BitNode.
  - Plans make their extras with `scoped(bn, level | undefined, suffix, test)`. That gives `bn<N>.<L>:<suffix>`, or `bn<N>.<suffix>` for any level of BitNode N. An extra is checked only while `position(route).playing` matches its scope, so a skipped extra is just absent.
  - Add a plan's list to `MILESTONES = registry(SPINE, ...)`. `registry` throws on a name used twice.
  - `milestonesReached(milestones, snapshot, reached)` returns the due names in registry order. Each test is checked on its own.
- **Recording:** after `carryOut`, the conductor calls `milestonesReached(MILESTONES, snapshot, reachedMilestones(record.state))`. For each name it calls `record.update((s) => recordMilestone(s, name, nowMs, splitStats(snapshot)))` and prints `splitLine(record.state)`. `recordMilestone` (in `state.ts`) sets `milestone` and appends a split (next section). `reachedMilestones` reads the names back from the splits plus `milestone`. That is how a milestone counts once, across reloads too, since the state file rolls back with the save.

## Splits, reloads and builds (set by #49)

- **A split** (`Split` in `state.ts`) is `{ milestone, ms, build, lostMs, installs, stats: { hack, money, M, homeRam, sleeves } }`:
  - `ms` is gross, since `startedAt`.
  - `build` is the build running (`currentBuild`), `lostMs` the reload loss so far and `installs` the installs so far.
  - Net = `ms - lostMs` (`splitTime`; `runTime(state, nowMs)` for the run as a whole).
- **Stats come from probes, never from conductor NS calls** (`splitStats(snapshot)` in `src/sr/splits.ts`). A stat is null until a probe has read it.
  - The `stats` probe (`sr/h/stats.js`, 2.15 GB, 30 s) gives `hack` (hacking level), `money`, `M` and `homeRam`. `M` is `getPlayer().mults.hacking`, without the BitNode's HackingLevelMultiplier, because reading that needs SF5.
  - The `sleeves` probe (`sr/h/sleeves.js`, 5.6 GB, 5 min) gives `{ count }`. It is launched only where `sleevesPossible(route)` holds (BN10, or SF10 owned), through the new optional `onlyIf(readings)` on a `ProbeSpec`. Elsewhere `sleeves` is 0.
  - **Never write the identifier `hack` in conductor-reachable code.** It is charged like `ns.hack` (0.1 GB). The probe quotes the key (`"hack": ...`), and `splits.ts` builds the empty stats from strings.
- **Terminal:**
  - Each split prints `conductor: split <name> <gross> (+<delta from the previous split>)`. Once reloads have cost anything, it adds `, net <net>`.
  - The format is `[<d>d ]H:MM:SS` (`formatDuration`).
  - When a loop records milestones and `runFinished(state)` (every spine milestone reached), the conductor prints `finishSummary(state)`: two lines with gross, net, milestone count, reloads and their loss, installs and builds.
- **Conductor start-up** (boot.js never writes an existing file, so the conductor does this):
  1. Right after `openRunState`, it captures `start = { atMs, savedUpdatedAt }`. It reads the build from `manifest.json` on home (`buildOnHome`, a free `ns.read`) and calls `noteBuild`, which appends `{ sha, fromMs }` to `builds` only when the build differs from `currentBuild`.
  2. Once the route probe's first reading lands, `accountStart(state, start, route)` runs once, before that loop's milestones:
     - `resetAt` null means the run's first start: it just stores `lastAugReset`.
     - A different `lastAugReset` means a reset, not a reload. `installs` goes up by one if `lastAugReset > lastNodeReset` (an install, not a BitNode entry). No reload record is written.
     - The same `lastAugReset` means a page reload or a kill. One `{ atMs, gapMs }` is appended to `reloads`, where `gapMs = atMs - savedUpdatedAt`, the heartbeat the reload rolled back to. The conductor prints `conductor: reload; <gap> lost since the last save`.
- **Why `installs` and `resetAt` are fields:** the game has no install count, and it can't tell a reload from a reset restart. Only reloads are reload loss.

## Formula model (set by #52)

- **One pure module, `src/sr/formulas.ts`,** holds our own implementation of the game's formulas, shared by every decider and the money engine. No run script calls `ns.formulas` (`test/no-formulas.test.ts` checks the compiled sources); Formulas.exe only cross-checks the model, through the golden values.
- **Inputs:** `Target` (the server fields, as `ns.getServer` gives them), `Hacker` (`skills.hacking`, `skills.intelligence` and the five `hacking_*` mults, as `ns.getPlayer` gives them) and `NodeMults` (the BitNode multipliers the formulas read, named as in the game; `NEUTRAL_MULTS` is BN1). Multipliers are always an argument, never a global.
- **Hacking:** `hackChance`, `hackExp`, `hackFraction` (ns `hackPercent`), `hackTimeMs`, `growTimeMs`, `weakenTimeMs`, `growFactor` (ns `growPercent`), `grownMoney` (ns `growAmount`), `growThreadsFor` (ns `growThreads`, from the server's `moneyAvailable`), `weakenAmount`, `hackSecurityRise(threads, fraction)` (#53: 0.002 per thread, at most `ceil(1/fraction)` threads; golden values from `ns.hackAnalyzeSecurity` on the real servers), plus `coreBonus` and `intelligenceBonus`. Times are in ms, like `ns.formulas`. The chance, fraction and times take a `HackTarget` (`hasAdminRights`, `hackDifficulty`, `requiredHackingSkill`), so a caller reads only those. `growSecurityRise(threads)` (#57) is a grow's rise if every thread is used, 0.004 per thread, the most it can add (hand-worked cases only). Darknet servers (fixed 16 s hack) are not modelled: `ns.hack` refuses them and `scan` never lists them.
- **Other:** `skillFromExp`, `expForSkill`, `hackingLevel(exp, playerHackingMult, bn)`, `cloudServerCost(ram, bn)` and `cloudServerMaxRam(bn)`.
- **Adding a formula:**
  1. Write it with a doc comment citing its v3.0.1 source as `src/<path>:<line>` (a test fails on an exported function without one).
  2. Take every BitNode multiplier it reads as an input: add the field to `NodeMults` and `NEUTRAL_MULTS`.
  3. Record golden values: add cases to `tools/golden/formulas-recorder.ts`, run `npm run record-formulas`, and add a `misses(...)` test in `src/sr/formulas.test.ts`. The comparison is exact (`Object.is`): the model does the game's arithmetic in the game's order.
  4. Add hand-worked cases for multipliers the lab saves don't reach.
  5. Never name an export like an NS function (`hack`, `grow`, `share`, `getServer...`): run scripts import the module, and the RAM test there prices every export at exactly the base 1.6 GB.
- **The recorder:** `tools/record-formulas.ts` starts a new game, saves it, and edits it (`tools/golden/lab-save.ts`) into two lab saves with Formulas.exe and SF5 on a 64 GB home: BN1 (every multiplier 1) and BN12 level 30 (SF12.29; most hacking multipliers 1.02^±30, cloud max RAM 2^19). In each it pushes the game script `tools/golden/formulas-recorder.ts` (transpiled by esbuild) over the Remote API, runs it, and reads back its JSON. The cases come from a seeded PRNG, but a new game randomizes server stats, so each recording has different numbers.

## RAM budget (`tools/ram-budget.ts`)

- **Every entry script needs a row.** An entry script is a built `.js` file that exports `main`; files without `main` are libraries and need none. A new entry script with no row fails the gate, and so does a row whose script is not in the build.
- **A row is a budget in GB plus the contexts the script runs in** (`RAM_CONTEXTS`: `BN1.1`, `BN4`, `SF4.1`, `SF4.2`, `SF4.3`, `BN10 start`; `EVERYWHERE` is all of them). The gate prices the script in each with the game's own calculator and compares the worst case with the budget. Add a context preset when a row needs one; only the BitNode and the SF4 level change any cost.
- **The calculator** (`tools/ram-calc.ts`) bundles the pinned `RamCalculations.ts` and its import closure from `.game/source/` with esbuild, stubbing `@player`, `@swc/wasm-web` and `@babel/standalone`. Each built file is passed in at its home path, so imports are charged as in the game. Its tests (`tools/ram-calc.test.ts`) pin the SF4 multipliers and the 25 GB `document`/`window` charge.

## Smoke test and harness (set by #46)

- **What it checks** (`tools/smoke.ts`), in the real v3.0.1 build (`.game/app`) in headless Chromium:
  1. New game, Exit Tutorial, then Options → Remote API pointed at the harness's server (host `127.0.0.1`, a free port, reconnection delay 1 s), Connect.
  2. The start command typed twice (the second once the `wget` has answered). Passes if the conductor rewrites `sr/state.json` (`updatedAt` past `startedAt`) within 10 min, `ps` still lists `sr/conductor.js`, the page threw nothing, no game error dialog opened, and the terminal's only error line is `Script boot.js does not exist on home.` (once).
  3. The RAM cross-check: every `.js` in the build, entry script or library, priced by `tools/ram-calc.ts` in `BN1.1` and by the game's `calculateRam` on home. Any difference over 0.005 GB, or a script either side can't price, fails. There is no fixed list, so new scripts are covered as they land.
  4. Save (the save icon, then wait for IndexedDB to change), reload, Connect again, type the start command once. Passes if the state file keeps the same `startedAt` and is written after the retype, the conductor runs and no error line shows at all.
- **Flake rule:** a failed attempt is retried once in a fresh browser (`retryOnce`); a second failure exits 1. Each attempt logs a `findings` line (load, connect, start, reload and resume times, the timer probe, the oldest heartbeat seen, the start phase's error lines).
- **The local release** (`tools/harness/release.ts`): `page.route` answers `https://raw.githubusercontent.com/anaconda186/bitburner/**` from `build/`. `release/<path>` serves every file and `release/manifest.json`; `<sha>/<path>` serves the files, where `sha` is made from the file hashes (stable per build); anything else is a 404. Every answer has `access-control-allow-origin: *`. The manifest has publish's shape, so boot.js runs exactly as against the real branch.
- **Remote API** (`tools/harness/remote-api.ts`): `startRemoteApi()` is a JSON-RPC WebSocket server (the game is the client). It uses the newest connection, so it survives a reload. Read state through `getFile("sr/state.json")`: `cat` doesn't put file text into the terminal.
- **The game** (`tools/harness/game.ts`): `serveGame`, `openBrowser(release)`, `loadGame`, `exitTutorial`, `connectRemoteApi(page, port)`, `typeLine` (real key presses), `terminalLines` (with the game's error styling, a class ending in `-error`), `errorDialogs`, `isRunningOnHome` (types `ps`), `saveGame`, `readSave`/`seedSave` (IndexedDB `bitburnerSave` v2, `savestring`, `save`) and `probeTimers`.
- **Pure verdicts** (`tools/harness/verdict.ts`, tested): `judgeStart`, `judgeResume`, `compareRam`, `retryOnce`, `terminalErrors`. Add a rule here with a test, then collect what it needs in `smoke.ts`.
- **Never click or type with bare Playwright calls in the game.** A loaded save opens the Offline dialog about 250 ms after the terminal appears, and it blocks clicks and takes the focus. Use `clickThrough` (inside the helpers) and `typeLine`, which close dialogs and retry.
- **Always press Connect after a load.** The game's own auto-connect fires once, 2 s after page start, before the save (and so the port) has loaded. See `docs/research/headless-game.md` §6 for this and the throttling findings.
- **Browser:** the pinned `playwright` (exact version in `package.json`) and its Chromium; CI installs it with `npx playwright install --with-deps chromium` and caches `~/.cache/ms-playwright`.

## Dev loop, milestone saves and scenario tests (set by #50)

- **Push watcher** (`npm run dev`, `tools/dev.ts`):
  - It serves the Remote API on `--port` (12525 by default, the game's own placeholder), so any game can connect to it from Options → Remote API.
  - It compiles `src/` into a throwaway folder under `.dev/` (`compile` in `tools/harness/devloop.ts`), so `build/` stays the smoke test's.
  - On a change under `src/` (tests excluded), it recompiles and pushes only the changed files plus `manifest.json` (`pushPlan` in `tools/harness/push.ts`). A game that connects or reconnects gets the whole build.
  - A pushed script takes effect at its next start. Helpers are launched fresh each time, so they run new code at once. The conductor runs it after a reload and one retype, or after `kill` and `run boot.js`.
  - A local build's `source` is `devSource(head, dirty, sha)`: the commit when `src/` is clean, `<commit>-dirty-<8 hex of the build>` otherwise. So the state file's `builds` tells edited builds apart.
  - `--open new|<milestone>` opens the game in its own window. The raw URLs are answered from the latest local build (`followingRelease`), so boot.js fetches it as well. After a reload of that window, it presses Connect again by itself.
- **Milestone saves** (`tools/harness/saves.ts`):
  - **The listener** (`startListener` in `devloop.ts`) reads `sr/state.json` every 2 s. When `milestoneToCapture(seen, now)` names a milestone, it calls `getSaveFile` and `storeCapture` writes `saves/<name>.gz` and `saves/<name>.json`. A capture of the same milestone replaces both files.
  - **What counts:** only a change it saw, to a milestone the run hadn't reached. Its first reading doesn't count, nor does a reload rolling back to an earlier milestone or a different `startedAt` (another run loaded). When one loop reaches several milestones, the save is filed under the last.
  - **The sidecar** (`Sidecar`) is read from the save itself: `kind`, `milestone`, `build` (the state's `currentBuild`), `gameVersion` (`GAME_VERSION`), `capturedAt`, `category`, `startedAt`, `bitNodeN` and `sourceFiles`.
- **Lab saves are kept apart by a mark in the save, not by where the file sits:**
  - `markLabSave` puts `lab-save.txt` (`LAB_MARKER`) on home. Home keeps text files through installs and BitNode entries, so every later save of that game carries the mark too.
  - `saveFacts` treats the marker, or any game exploit flag, as a lab save. Captures of a lab game go to `lab-saves/` with `kind: "lab"`.
  - `npm run dev -- --lab <file>` marks a save before loading it. **A throwaway script that loads an edited save into a watched game must mark it the same way.**
- **Scenario tests** (`npm run scenario -- <milestone>`, `tools/scenario.ts`):
  - **Start:** it takes a milestone name, never a path. `loadScenarioSave` reads only `saves/`, and `scenarioStart` refuses a missing sidecar, a lab save (by its sidecar or its contents), another target version, or a sidecar that doesn't match the save's state file.
  - **Load:** `resumeFromSave` seeds IndexedDB, loads the game, presses Connect and types the start command once, as a player does after a reload.
  - **RAM cross-check:** once the state file shows the build under test, the RAM cross-check runs in the save's own context, `{ bitNodeN, sourceFiles }` from the save (`staticRam(files, context)`), not BN1.1.
  - **Verdict:** `judgeScenario` in `tools/harness/scenario-verdict.ts`.
    - It passes when the save's run (same `startedAt`) reaches `--until`, or else any milestone the save didn't have, on the build under test.
    - It fails on any error line in the terminal after the typed command, a page error, a game error dialog, a RAM mismatch, a new run, or `--timeout` (12h by default).
    - Terminal lines are diffed with `newLines`, which copes with the terminal dropping its oldest lines when full.
  - **Captures:** milestones it reaches on the way are captured like the dev loop's (`--no-capture` turns this off).
  - **Options:** `--build <dir>` tests a built folder instead of compiling, and `--root <dir>` moves `saves/` and `lab-saves/` elsewhere (both are for checks). `--headless` exists for checks too; the default is headed.
  - **Never in CI:** it exits at once under `GITHUB_ACTIONS` or `CI`, and `test/ci-gate.test.ts` fails if the workflow mentions it.
- **Remote API additions:** `startRemoteApi(host, listenPort)` takes a fixed port, plus `pushFile(filename, content, server?)` and `getSaveFile()`, which returns gzip bytes and refuses a text save.

## Live reader, exports and compare (set by #51)

- **Pure rules (seam E), `tools/runs.ts`:**
  - **The rollback watcher's log** (`WatchLog = { startedAt, windows, seen }`): `watchState(log, state, nowMs)` adds every split read (`Seen = { milestone, ms }`) and the time it was watching. Two reads more than `WATCH_GAP_MS` (60 s) apart start a new window. A state with another `startedAt` starts a new log.
  - `rolledBack(log, state)` lists the splits the watcher saw that the state no longer has, whether or not the run reached the milestone again later (a re-reach has a different `ms`). `watchedMs(log)` is the time watched. `attached(log)` drops a log that watched for no time (a single read), so a one-off export counts as unwatched.
  - `rollbackText(r)` is the only wording: `rollbacks unobserved` without a watcher, `rollbacks: none seen, watched X of Y` or `rollbacks: N (names), watched X of Y` with one. Never "none" without a watcher.
  - **Exports:** `exportName(state)` is `<start as 2026-11-07T153012Z>-<category>-<first 7 of buildSha>.json`. The start time to the second keeps two runs of one build on one day apart and sorts the names. `exportText(state, log, nowMs)` writes `{ export: 1, exportedAt, state, watch }`. `parseRun(text)` reads that, or a state file copied out by hand (an unwatched run), through `parseState`, and drops a log of another run. A newer `export` format is refused.
  - `liveTable(state, nowMs, log)` gives the reader's table: the run's header (category, start, builds, gross, net, reloads, installs), one line per split (gross, net, net segment, build, installs, stats), the splits seen rolled back in time order, then `rollbackText`.
- **`compare` (seam E), `tools/compare.ts`:** `compare(a, b)` returns `{ ok: false, error }` for different categories. Otherwise it gives a `Report` with one `Row` per milestone of either run.
  - Order: A's milestones (rolled-back ones included, by time), with each of B's own milestones placed after the one B reached before it.
  - A segment runs from the previous milestone both runs reached (or the start). So a skipped milestone doesn't distort the next segment, and a segment delta is always the change in the split delta.
  - Deltas are B − A (positive means B was slower), as `Times = { grossMs, netMs }`, or null where either side has a gap.
  - `Side.builds` lists every build that ran in the segment, from `buildSha` and the `builds` records' wall-clock `fromMs`. `buildsDiffer` is set where both runs reached the milestone and those lists differ.
  - `renderCompare(report, { columns: "net" | "gross" | "both", labels })` gives the text. Net is the default. A gap shows as `gap`, a milestone lost and never re-reached as `rolled back`, and a missing delta as `-`. The notes column says `builds differ` and `rolled back in A/B`.
- **The live reader, `tools/live.ts`:**
  - `watchRun(api, { outDir, everyMs, show, log })` works on any `RemoteApi`. It polls `getFile("sr/state.json")`, keeps the watcher's log in `runs/watch/<startedAt>.json` (reloaded on restart, so the log survives a restart of the reader), calls `show` when the file or the log changes, and exports when `runFinished(state)` first holds. `exportNow()` exports the last run read.
  - **The game connects to one Remote API server at a time.** Anything else that runs a server, such as the dev loop, should attach `watchRun` to its own server rather than run `npm run live` beside it.
  - `startRemoteApi(host, listenPort = 0)` takes the port as an optional second argument, so a real game's saved Remote API settings keep working across restarts.
- **Not unit tested:** the CLI shells (`live.ts`, compare's `import.meta.main`). The scratchpad's `verify/t51-live.ts` checked them in the real game.

## CI (`.github/workflows/ci.yml`)

- **One job, `gate`, runs on every push and PR:** `npm ci` → restore the `.game` cache → `fetch-game` → `typecheck` → `test` → `build` → `ram-check` → install Chromium → `smoke` → publish (pushes to `main` only). On a failure the `.smoke/` evidence is uploaded.
- **A failed step stops the job,** so a failing push never publishes and the previous release stays live.
- **New gates** go as steps before "Publish to release", like the RAM budget and smoke steps. `test/ci-gate.test.ts` fails if a gate ends up after publish or a step may continue past a failure.
- **The `.game` cache key** is the hash of `tools/game-pin.ts` and `tools/fetch-game.ts`.
- **Runs are serialized per ref and never cancelled,** so `main` publishes in order.
