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
| `npm run publish-release` | Push `build/` to the orphan `release` branch. CI runs it; for a local try, `-- --remote <path to a bare repo>`. |

## Folders

| Path | Holds |
|---|---|
| `src/` | Game scripts in TypeScript. **`src/` mirrors home:** `src/boot.ts` becomes `boot.js` at the root, and every other script goes under `src/sr/`. Nothing else may live in `src/` except tests. |
| `src/**/*.test.ts` | Unit tests, next to the code they test (seams A–E). Never compiled into `build/`. |
| `tools/` | Node-side scripts (`fetch-game`, `publish`, `ram-check`, `smoke`, later `compare`), in TypeScript run directly by Node (type stripping, no build step). Their tests sit beside them. |
| `tools/harness/` | The Playwright harness (#46): the game in Chromium, the local release, our Remote API server and the smoke test's pure verdicts. Reused by the dev loop and scenario tests. |
| `test/` | Tests and checks that belong to no single file, such as `ns-api-guard.ts`, which proves the typecheck catches Netscript misuse, and `ci-gate.test.ts`, which pins the gate order in the workflow. |
| `.smoke/` | gitignored. A failed smoke attempt's screenshot and terminal text (CI uploads it as the `smoke-evidence` artifact). |
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

## CI (`.github/workflows/ci.yml`)

- **One job, `gate`, runs on every push and PR:** `npm ci` → restore the `.game` cache → `fetch-game` → `typecheck` → `test` → `build` → `ram-check` → install Chromium → `smoke` → publish (pushes to `main` only). On a failure the `.smoke/` evidence is uploaded.
- **A failed step stops the job,** so a failing push never publishes and the previous release stays live.
- **New gates** go as steps before "Publish to release", like the RAM budget and smoke steps. `test/ci-gate.test.ts` fails if a gate ends up after publish or a step may continue past a failure.
- **The `.game` cache key** is the hash of `tools/game-pin.ts` and `tools/fetch-game.ts`.
- **Runs are serialized per ref and never cancelled,** so `main` publishes in order.
