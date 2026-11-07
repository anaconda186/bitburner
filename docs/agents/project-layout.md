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
| `npm run publish-release` | Push `build/` to the orphan `release` branch. CI runs it; for a local try, `-- --remote <path to a bare repo>`. |

## Folders

| Path | Holds |
|---|---|
| `src/` | Game scripts in TypeScript. **`src/` mirrors home:** `src/boot.ts` becomes `boot.js` at the root, and every other script goes under `src/sr/`. Nothing else may live in `src/` except tests. |
| `src/**/*.test.ts` | Unit tests, next to the code they test (seams A–E). Never compiled into `build/`. |
| `tools/` | Node-side scripts (`fetch-game`, `publish`, `ram-check`, later the harness and `compare`), in TypeScript run directly by Node (type stripping, no build step). Their tests sit beside them. |
| `test/` | Tests and checks that belong to no single file, such as `ns-api-guard.ts`, which proves the typecheck catches Netscript misuse. Later: the Playwright smoke harness. |
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

- **`sr/state.json` on home** holds only what the game forgets: `v, category, startedAt, buildSha, updatedAt, milestone, splits, reloads, builds`, in that order, then any newer fields.
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

## RAM budget (`tools/ram-budget.ts`)

- **Every entry script needs a row.** An entry script is a built `.js` file that exports `main`; files without `main` are libraries and need none. A new entry script with no row fails the gate, and so does a row whose script is not in the build.
- **A row is a budget in GB plus the contexts the script runs in** (`RAM_CONTEXTS`: `BN1.1`, `BN4`, `SF4.1`, `SF4.2`, `SF4.3`, `BN10 start`; `EVERYWHERE` is all of them). The gate prices the script in each with the game's own calculator and compares the worst case with the budget. Add a context preset when a row needs one; only the BitNode and the SF4 level change any cost.
- **The calculator** (`tools/ram-calc.ts`) bundles the pinned `RamCalculations.ts` and its import closure from `.game/source/` with esbuild, stubbing `@player`, `@swc/wasm-web` and `@babel/standalone`. Each built file is passed in at its home path, so imports are charged as in the game. Its tests (`tools/ram-calc.test.ts`) pin the SF4 multipliers and the 25 GB `document`/`window` charge.

## CI (`.github/workflows/ci.yml`)

- **One job, `gate`, runs on every push and PR:** `npm ci` → restore the `.game` cache → `fetch-game` → `typecheck` → `test` → `build` → `ram-check` → publish (pushes to `main` only).
- **A failed step stops the job,** so a failing push never publishes and the previous release stays live.
- **New gates** (the smoke test in #46) go as steps before "Publish to release", like the RAM budget step.
- **The `.game` cache key** is the hash of `tools/game-pin.ts` and `tools/fetch-game.ts`.
- **Runs are serialized per ref and never cancelled,** so `main` publishes in order.
