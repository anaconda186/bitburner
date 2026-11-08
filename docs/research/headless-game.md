# Running the game locally for automated tests

Research ticket: [#6](https://github.com/anaconda186/bitburner/issues/6). Research date: 2026-10-28.

Sources: the game's source code at `bitburner-official/bitburner-src`, tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1) (commit `3162fd2`), the target version. I read it from a local clone with `git show v3.0.1:<path>`. **I did not install, build or run anything.** Every link below is pinned to the tag. `V301/path#Lx` means `https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/path#Lx`.

Statements marked **(inference)** are my reading of the code or my estimate, not something the source states or something I ran.

---

## Summary

1. **Building is ordinary.** It needs Node 24 or newer and npm. `npm ci` then `npm run build` writes a static site to `.app/` (`index.html` + `dist/`). `npm run start:dev` serves a dev build on `localhost:8000`. The build scripts are bash, so on Windows they need Git Bash. The tag does **not** contain built bundles, so something has to build them. The v3.0.1 GitHub release zips contain a built copy inside the Electron app **(inference)**.
2. **The game's own jest tests do run Netscript without a browser.** They use jsdom, build Player and servers in memory with a few init calls, and either call `ns.*` directly or write a `.js` file to `home` and run it as a real script. They can also load a real save file from disk (`loadGame`). So our compiled scripts *could* be run the same way.
   - What that environment cannot do: **show the UI** (the router is stubbed out and no React tree is mounted), so UI automation can't be tested there. It runs **in real time** unless fake timers are used. It also ties us to the game's **internal** modules, which are not a public API.
3. **A Playwright harness is feasible with parts the game already has:**
   - **Inject a save:** pre-seed IndexedDB (`bitburnerSave` / `savestring` / key `save`, value = gzip bytes or a base64 string), or import a file through the Options page.
   - **Push scripts:** the Remote API (the game is the *client* and connects to our WebSocket server), or the real `wget` start command against a local HTTP server.
   - **Run scripts:** type into `#terminal-input`. The Remote API has no "run" message.
   - **Read state back:** the Remote API's `getSaveFile`, reading IndexedDB, files our scripts write, or (dev build only) `globalThis.Bitburner`.
4. **Tick speed is 1× real time.** The engine runs a 200 ms cycle off `Date`. Script timings (`hack`, `sleep`) are plain `setTimeout`s. Playwright's `page.clock` can fake all of these, including `performance`, so faster runs are *possible*. But it is untested here, the gain is capped by CPU, and splits measured that way mean nothing.
5. **Cost (inference):**
   - Unit tests only: about 0 extra.
   - Game jest environment: about 1 day to set up. It is cheap to keep while pinned to v3.0.1, but it breaks on internal refactors whenever we move versions.
   - Playwright harness: about 2–4 days for a smoke harness. Upkeep is moderate (UI selectors, timing flakiness) but limited, because the target version is fixed.
6. **Recommendation:**
   - Keep the standing decision now: unit tests of pure logic, plus manual runs from milestone saves.
   - Add a **small Playwright smoke harness** against a local **production** build of v3.0.1, but only once the start command and UI automation exist. These are the riskiest parts, and only a real browser can test them.
   - **Don't adopt the game's jest environment.** It can't see the UI, it can't go faster than real time without fake timers, and it couples us to private code. Its one unique strength, real RAM costs, is also available through the Remote API's `calculateRam`.

---

## 1. How the game is built and served locally

| What | Command | Evidence |
|---|---|---|
| Node version | `"engines": { "node": ">=24" }`. A `preinstall` script enforces it. CI uses Node 24. CONTRIBUTING says the Electron build was "Tested on Node 24.13.0 (LTS) on Windows" and that some jest snapshot tests fail below v24. | [V301/package.json#L114](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/package.json#L114), [#L132](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/package.json#L132), [V301/.github/workflows/ci.yml#L56-L69](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/.github/workflows/ci.yml#L56-L69), [V301/CONTRIBUTING.md#L172](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/CONTRIBUTING.md#L172), [#L230-L232](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/CONTRIBUTING.md#L230-L232) |
| Install | `npm ci` (CI) or `npm install` (CONTRIBUTING) | [ci.yml#L66-L67](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/.github/workflows/ci.yml#L66-L67), [CONTRIBUTING.md#L162-L167](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/CONTRIBUTING.md#L162-L167) |
| Dev server | `npm run start:dev` runs `webpack serve --mode development` with hot reload on **port 8000** | [package.json#L127](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/package.json#L127), [V301/webpack.config.js#L31-L41](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/webpack.config.js#L31-L41) |
| Static build | `npm run build` (production) or `npm run build:dev` (development). Both run `bash tools/build.sh <mode>`, which runs webpack and then copies `index.html`, `favicon.ico` and `dist/` into **`.app/`**. Any static file server can serve `.app/`. | [package.json#L128-L129](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/package.json#L128-L129), [V301/tools/build.sh](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/tools/build.sh) |
| Container | The `Dockerfile` builds with `npm ci && npm run build` (or `build:dev` when `BUILD_MODE=dev`) and serves `.app` with nginx. `docker-compose.yml` maps it to `localhost:8080`. | [V301/Dockerfile](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/Dockerfile), [V301/docker-compose.yml](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/docker-compose.yml) |
| Official pages build | GitHub Pages is deployed from `.app` by a manual workflow, with an optional "dev mode" (`build:dev`) | [V301/.github/workflows/deploy-dev.yml#L33-L43](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/.github/workflows/deploy-dev.yml#L33-L43) |

Notes:

- **No built bundles at the tag.** `git ls-tree v3.0.1 dist` shows only icons and favicons. `.gitignore` excludes the generated bundles, so serving v3.0.1 locally means building it.
- **A prebuilt alternative (inference, to verify by unzipping):** the v3.0.1 GitHub release has `bitburner-win32-x64.zip` (181 MB) and other platform zips. `tools/package-electron.sh` copies `.app/*` into the Electron package ([V301/tools/package-electron.sh](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/tools/package-electron.sh)) and passes no `--asar` flag. The zip's `resources/app/` therefore *should* hold the exact production `index.html` + `dist/`, which we could serve without building.
- **Development vs production build.** A development build sets `process.env.NODE_ENV = "development"`. That turns off minification and exposes `globalThis.Bitburner` (`Player`, `GetAllServers`, `Factions`, `Companies`, `SaveObject.saveObject/loadGame`, and more) ([V301/src/engine.tsx#L395-L412](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L395-L412)). That is handy for reading state, but it is not the target build. Opening the dev menu flags the `YoureNotMeantToAccessThis` exploit ([V301/src/DevMenu.tsx#L44](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/DevMenu.tsx#L44)).
- **The Electron wrapper adds nothing a browser harness needs.** It supports `--no-scripts` (loads with `?noScripts`), `--export-save` and `--dev` (devtools), and sets `backgroundThrottling: false` ([V301/electron/main.js#L256-L262](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/electron/main.js#L256-L262), [V301/electron/gameWindow.js#L26](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/electron/gameWindow.js#L26), [#L46-L47](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/electron/gameWindow.js#L46-L47)). The run targets the **web** release, so a plain browser is the closer match. `?noScripts` also works on the web ([V301/src/NetscriptWorker.ts#L233](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L233)).
- **The game's CI has no browser tests.** `ci.yml` runs build, lint, prettier, `npm run test` (jest) and a docs check. The jest config still ignores a leftover `.cypress` path ([V301/jest.config.js#L8](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/jest.config.js#L8)), but no Cypress or Playwright suite exists at the tag.

## 2. The game's jest tests: Netscript in memory, no browser

### The environment

- **jest + babel + jsdom.** [V301/jest.config.js](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/jest.config.js):
  - `roots` are `src/` and `test/`.
  - It uses a custom babel transform and a jsdom test environment ([V301/FixJSDOMEnvironment.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/FixJSDOMEnvironment.ts)), which adds `Blob`, `CompressionStream`, `DecompressionStream`, `Response`, `URL` and more "when testing code that loads save data".
  - Monaco, `monaco-vim` and `utils/Protections` are mocked out, and `@swc/wasm-web` is mapped to `@swc/core`.
- **The tests are at `test/jest/**`.** About 60 files ([V301/test/jest](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1/test/jest)), including `Netscript/RunScript`, `Netscript/Singularity`, `Netscript/RamCalculation`, `Migration/Migration`, `FullSave` and `Save`.

### How Player and servers are set up

The shared helpers are in [V301/test/jest/Utilities.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Utilities.ts):

- `initGameEnvironment()` ([#L45-L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Utilities.ts#L45-L56)) stubs `Router.toPage = () => {}`, because "it only works properly after the main UI is loaded". It then initialises number formats and Source-Files.
- `setupBasicTestingEnvironment()` ([#L58-L88](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Utilities.ts#L58-L88)) repeats the "new game" steps of `Engine.load()`: `prestigeAllServers`, `setPlayer(new PlayerObject())`, `initBitNodeMultipliers`, `Player.init`, `initForeignServers` and `reapplyAllAugmentations`. It then **grants SF4.3, simulates a flume (`enterBitNode`) and sets money to 1e15**. Our tests would need their own setup without those gifts.
- `getNS()` / `getWorkerScriptAndNS()` ([#L90-L116](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Utilities.ts#L90-L116)) give an `ns` object bound to a dummy `test.js` running on `home` with 1024 GB. Most Netscript tests call `ns.*` directly on that object (for example `Singularity.test.ts`).
- `fixDoImportIssue()` ([#L25-L43](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Utilities.ts#L25-L43)) swaps the script loader's blob URLs for `data:` URLs and a real dynamic `import()`. With that in place, **real script files** run.

### Running a real script file

[V301/test/jest/Netscript/RunScript.test.ts#L84-L135](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Netscript/RunScript.test.ts#L84-L135) does the following:

1. Writes `import.js` and `simple_test.js`, which use an ES `import` between them, to home with `writeToScriptFile`.
2. Computes static RAM with `script.getRamUsage`.
3. Starts the script with `startWorkerScript`.
4. Waits on `workerScript.atExit`.
5. Asserts the script's log lines.

Other tests in the file cover running from the terminal (`runScript`), root-access and RAM errors, and circular imports.

### Loading a real save from disk

[V301/test/jest/Migration/Migration.test.ts#L11-L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Migration/Migration.test.ts#L11-L27) reads `.gz` save files with `fs.readFileSync`. It mocks `db.load`/`db.save` (IndexedDB) and calls `loadGame(saveData)`. It then saves and reloads again with `saveObject.saveGame()` / `getSaveData()`.

`loadGame` only restores state ([V301/src/SaveObject.ts#L457-L566](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SaveObject.ts#L457-L566)). The rest of `Engine.load` (BitNode multipliers, entropy, restarting saved scripts, offline progress; [V301/src/engine.tsx#L239-L380](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L239-L380)) would have to be repeated by hand **(inference)**.

### Time

- Script delays are real `window.setTimeout`s: `netscriptDelay` ([V301/src/Netscript/NetscriptHelpers.tsx#L419-L432](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L419-L432)) is used by `hack` ([#L561](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L561)) and `sleep`.
- The game loop (`Engine.start` / `updateGame`) is **not** started in tests. No test calls it, so passive things such as work, hacknet production and stock ticks don't advance unless a test calls `Engine.updateGame(n)` itself **(inference)**.
- Some tests use jest fake timers (`jest.useFakeTimers()`, `advanceTimersByTimeAsync`, `runAllTimersAsync`), for example [V301/test/jest/Darknet/Darknet.test.ts#L726-L742](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/Darknet/Darknet.test.ts#L726-L742) and [V301/test/jest/FullSave.test.ts#L29](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/test/jest/FullSave.test.ts#L29). So a `hack()` that takes minutes could be skipped forward **(inference: no game test does this to HGW calls)**.

### Could our scripts be exercised this way?

**Yes, with limits (inference).** One setup that would work:

- Check out bitburner-src at v3.0.1 next to our repo, for example as a pinned git submodule.
- Run `npm ci` with Node 24 (`ELECTRON_SKIP_BINARY_DOWNLOAD=1` avoids pulling Electron).
- Point jest at a config that extends theirs, with our test folder added to `roots`.
- Import their `Utilities.ts`.
- Write our compiled `.js` files onto `home` (or load a milestone save), then run them with `startWorkerScript`.

The limits:

- **No UI.** `Router.toPage` is stubbed and nothing mounts `GameRoot`. No test at the tag renders React. A script that uses `document.querySelector` to click "Join faction" finds nothing. This rules out the riskiest code in a BN1 bootstrap: UI automation, which a fresh save needs because it has no SF4 (see `bitburner-current-state.md`, fact 2).
- **Global singletons.** `Player`, `AllServers` and `Factions` are module globals, so every test must reset them, as the game's own tests do in `beforeEach`.
- **Private API.** Everything imported (`setupBasicTestingEnvironment`, `startWorkerScript`, `loadGame`) is internal and can change in any release.
- **Not the target build.** The code is babel-transformed TypeScript running in jsdom, not the webpack production bundle in a real browser.

## 3. A Playwright harness against a local build

### Saves: how they are stored, and how to inject one

- **Storage:** IndexedDB database `bitburnerSave`, version **2**, object store `savestring`, key `save` ([V301/src/db.ts#L12-L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/db.ts#L12-L37), [load #L73-L101](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/db.ts#L73-L101), [save #L103-L127](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/db.ts#L103-L127)). Settings are stored inside the save too. Nothing relevant is kept in `localStorage`.
- **Format:** `SaveData = string | Uint8Array` ([V301/src/types.ts#L49](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/types.ts#L49)).
  - If `CompressionStream` exists (all current browsers), it is the **gzip** of a JSON string that starts with `{"ctor":"BitburnerSaveObject"`. Otherwise it is base64 of that string ([V301/src/utils/SaveDataUtils.ts#L14-L72](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/utils/SaveDataUtils.ts#L14-L72)).
  - The JSON has one field per subsystem (`PlayerSave`, `AllServersSave`, `SettingsSave`…), and each field is itself a JSON string ([V301/src/SaveObject.ts#L191-L233](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SaveObject.ts#L191-L233)).
  - The exported file (`bitburnerSave_<time>_BN<n>x<lvl>.json.gz`) is that same byte string. A milestone save exported from the game is therefore already in the right form ([#L265-L289](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SaveObject.ts#L265-L289)).
- **Three ways to inject (the first two inferred from the code above):**
  1. **Pre-seed IndexedDB.** Before the first load, an `addInitScript` (or a blank page on the same origin) opens `bitburnerSave` v2, creates `savestring`, and `put`s the bytes under `save`. Then navigate to the game. On load, the game calls `db.load()` and `Engine.load(saveData)` ([V301/src/ui/LoadingScreen.tsx#L37-L38](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/LoadingScreen.tsx#L37-L38)). Each Playwright browser context has its own IndexedDB, so tests stay isolated.
  2. **Import through the UI.** Use Options → Import with `page.setInputFiles`. `importGame` writes the save to IndexedDB and then calls `location.reload()` ([V301/src/SaveObject.ts#L291-L336](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SaveObject.ts#L291-L336)).
  3. **Dev build only.** Call `globalThis.Bitburner.SaveObject`.
- Importing a save is not an exploit. The game records `EditSaveFile` only when someone edits the exploit list in their save by hand ([V301/src/Exploits/Exploit.ts#L26-L29](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Exploits/Exploit.ts#L26-L29)). Milestone saves are development-only anyway.

### Getting our scripts in

- **Remote API (RFA).** The game is a WebSocket **client**. It connects to `ws://<RemoteFileApiAddress>:<RemoteFileApiPort>`, and the port is 0 (off) by default ([V301/src/Settings/Settings.ts#L45-L51](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Settings/Settings.ts#L45-L51), [V301/src/RemoteFileAPI/RemoteFileAPI.ts#L6-L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/RemoteFileAPI.ts#L6-L14), [Remote.ts#L41-L48](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/Remote.ts#L41-L48)).
  - The harness runs the WebSocket server.
  - Methods ([V301/src/RemoteFileAPI/MessageHandlers.ts#L88-L263](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageHandlers.ts#L88-L263)): `pushFile`, `getFile`, `getFileMetadata`, `deleteFile`, `getFileNames`, `getAllFiles`, `getAllFileMetadata`, `calculateRam`, `getDefinitionFile`, `getSaveFile` and `getAllServers`.
  - There is **no "run script" method**.
  - **Connection timing caveat (inference):** the only automatic connect is a single `setTimeout(newRemoteFileApiConnection, 2000)` at page start ([V301/src/index.tsx#L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/index.tsx#L37)). The port comes from the save's settings. If loading takes longer than 2 s, the port is still 0 and no connection is made. The harness would then press "Connect" on the Remote API options page ([V301/src/GameOptions/ui/RemoteAPIPage.tsx#L161](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/GameOptions/ui/RemoteAPIPage.tsx#L161)).
- **`wget`, the real start-command path.** The terminal's `wget <url> <file>` uses `fetch` and writes the result onto the current server ([V301/src/Terminal/commands/wget.ts#L6-L35](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/wget.ts#L6-L35)). If the harness serves our build output over a local HTTP server with CORS, it tests the exact start command a run uses.
- **A milestone save that already contains the files.** This works, but it goes stale as soon as the scripts change.
- **Running scripts.** Type into the terminal input, `#terminal-input` ([V301/src/Terminal/ui/TerminalInput.tsx#L450](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/ui/TerminalInput.tsx#L450)), then press Enter. On a fresh save the harness must first click "Exit Tutorial", because the tutorial blocks every other command (`bitburner-current-state.md`, fact 7). This is the same as the human actions.

### Reading state back

- **RFA `getSaveFile`** returns the current save as a char-per-byte string with `binary: true` ([MessageHandlers.ts#L223-L252](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageHandlers.ts#L223-L252)). In Node: turn it into bytes, `zlib.gunzipSync`, `JSON.parse`, then parse each `*Save` field again.
- **RFA `getFile`** reads a text file our scripts write (for example a `state.json` with splits). This is the cheapest and most stable option, because it uses our own format.
- **`page.evaluate`** can read IndexedDB the same way the game does.
- **Dev build only:** `page.evaluate(() => globalThis.Bitburner.Player.money)`.

### Tick speed

- **Real time is 1×.** `Engine.start` measures elapsed `Date` time, runs `updateGame(n)` for the whole number of 200 ms cycles, and reschedules itself with `setTimeout` ([V301/src/engine.tsx#L415-L442](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L415-L442), [V301/src/Constants.ts#L19](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Constants.ts#L19)). Script waits are `setTimeout`s (§2). Nothing in the game speeds it up.
- **Faster with a fake clock (inference, untested).** Playwright's `page.clock` replaces `Date`, `setTimeout`/`setInterval`, `requestAnimationFrame`, `performance` and others ([playwright.dev/docs/clock](https://playwright.dev/docs/clock)).
  - `runFor(ms)` fires every timer along the way. The speedup is then limited by how fast the CPU can run the game cycles and React re-renders.
  - `fastForward(ms)` jumps ahead and fires each due timer once. The engine handles that like lag catch-up, as one big `updateGame(n)`.
  - Neither is measured here.
- **The time-compression check (inference).** The game's detector compares `performance.now()` across a 15 s `setTimeout` and flags `TimeCompression` if less than 500 ms passed ([V301/src/Exploits/loops.ts#L15-L31](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Exploits/loops.ts#L15-L31)). A clock that fakes both consistently should not trip it.
  - Even so, accelerated runs only tell us whether the logic works. They say nothing about splits.
  - Script timing across many timers (batch landing order) may not be faithful under a fake clock.
  - Real-time smoke tests from milestone saves are the honest use.

## 4. Cost to build and keep working (inference)

| Option | Build cost | Upkeep against game updates | What it catches |
|---|---|---|---|
| **Unit tests of pure logic** (standing decision) | Our own test runner only. About 0 extra. | None. It doesn't touch the game. | Maths and planning bugs (batch sizing, target choice, BitNode order). Not the game's real behaviour. |
| **Game jest environment** | About 1 day: pinned bitburner-src checkout, `npm ci` on Node 24 (heavy `node_modules`), a jest config that extends theirs, a setup helper without the SF4/money gifts, and save loading plus the missing `Engine.load` steps. The first test run has to transform the whole game with babel, which takes minutes (not measured). | Close to zero while the target version stays v3.0.1, which the map fixes. A version bump means re-pinning and fixing breakage in internal helpers, perhaps hours to a day per bump. | Real Netscript semantics (errors, RAM, formulas, resets called directly) without a browser. **Not** UI automation, real time, page reloads or the start command. |
| **Playwright harness** | About 2–4 days: build v3.0.1 once (or extract the release zip), serve `.app`, seed IndexedDB, drive the terminal, a small WebSocket RFA server, state readback, and a timeout/retry policy. | Moderate: terminal and tutorial selectors, the RFA connect race, flaky waits. All of these change only when the target version changes. Every test is real time (minutes), so it suits a few smoke tests rather than a large suite. | The exact production build, the real start command, UI automation, resets and the callback restart, page-reload recovery, and splits. |

## 5. Recommendation

**Keep unit tests of pure logic as the base. Add a small Playwright smoke harness once the start command and UI automation exist. Do not adopt the game's jest environment.**

Reasons:

- **The riskiest code can only be tested in a browser.** That code is the bootstrap: exit the tutorial, `wget` the start command, drive the UI without SF4, survive resets through the callback script, and resume after a page reload. The jest environment stubs the router and mounts no UI, so it can test none of this. Playwright can test all of it against the exact v3.0.1 production build.
- **Milestone saves fit Playwright directly.** An exported save is the same gzip bytes the game keeps in IndexedDB, so seeding one is a single `put`. Reading results back through a file our scripts write (`getFile`) keeps the harness off the game's internal structures.
- **The jest environment's strengths are covered elsewhere:**
  - Its real formulas are available in-game through `ns.formulas` once we own Formulas.exe, and our pure logic can take the numbers as inputs.
  - Real RAM costs are available through RFA `calculateRam`.
  - What it uniquely adds (running scripts in memory) costs a coupling to private internals and still runs in real time unless we fake timers.
- **Keep the harness small and real-time.** About five smoke tests is plenty: "fresh save → start command → first hack running", "milestone save M → next milestone within N minutes", and "page reload mid-run → run resumes". Treat `page.clock` acceleration as an experiment only, never as a source of splits.
- **Wait to build it.** Nothing in the harness pays off until there is a bootstrap to test. Until then the standing decision is enough.

### Open points to verify when the harness is built

- That the v3.0.1 release zip's `resources/app/` is a usable static build (it would save the build step).
- How long a load takes compared with the 2 s RFA auto-connect.
- Whether `page.clock` runs the game stably, and how fast.

These are answered in §6, apart from `page.clock`.

## 6. Findings from the smoke harness (#46)

Measured on 2026-11-07 with the harness in `tools/harness/` and `npm run smoke`, on Windows 11, Playwright 1.61.1 and its Chromium 149.0.7827.55 (Playwright build 1228), against the real v3.0.1 release zip's `resources/app/`. These were **run**, not inferred, unless marked. The CI runner was **not** measured here (nothing was pushed). Every smoke attempt logs a `findings` line with the same probes, so the first CI run records the CI numbers.

### The open points above

- **The release zip's `resources/app/` is a usable static build.** Served over plain HTTP from 127.0.0.1, it runs in stock Chromium with no Electron. The smoke test passes on it, start command included.
- **The 2 s Remote API auto-connect can't be relied on.** The game connects only once, 2 s after page start, and the port comes from the save, which loads after `initSwc()` (21 MB of wasm).
  - On a new game there is no save, so the port is still 0 when the auto-connect fires. Page start to the "Exit Tutorial" button took 1.95–6.5 s across 19 headless loads.
  - After a reload with a 15–20 KB save, the terminal was back in 1.4–4.8 s. Loading the same save seeded into a fresh browser took 2.1 s. That is a race against the 2 s timer, which the auto-connect often loses.
  - So the harness always presses **Connect** on Options → Remote API after each load (`connectRemoteApi`). That takes about 0.6–1.4 s, menus included.
- **A loaded save opens the "Offline for N seconds" dialog** about 230 ms after the terminal appears. It blocks Playwright's real clicks and takes the keyboard focus. Escape closes it. The harness retries each click after closing dialogs, and checks what it typed before pressing Enter. Without that, the reload step failed all 6 attempts of one series of 3 runs.
- **`page.clock` was not tried.** The smoke test runs in real time (about half a minute when it passes), so it needed no speed-up.

### Throttling: headless, headed, and a page behind another tab

The probe (`probeTimers`) times 100 ms `setTimeout`s in the game's page. The game's engine tick and every `ns.sleep` are `setTimeout`s (§3, "Tick speed"). The heartbeat check reads `sr/state.json` through `getFile` every 5 s for 6 minutes and records how old `updatedAt` is. The conductor refreshes it every 10 s (`REFRESH_MS`), so an unthrottled run stays under about 10 s plus the read gap. 6 minutes is past the 5 minutes after which Chrome's intensive throttling of hidden pages starts (about one wake-up a minute). The three modes ran at the same time, one run each, on the build from before #47 and #48 were merged (a conductor that only beats).

| Mode | `visibilityState` / focus | Timer lateness in front, p50 / max | Just after a second tab came to the front, p50 / max | Oldest heartbeat over 6 min behind that tab |
|---|---|---|---|---|
| Headless shell (Playwright's default headless) | visible / focused | 8 / 27 ms | 9 / 10 ms | 7.3 s |
| New headless (`channel: "chromium"`) | visible / focused | 9 / 16 ms | 28 / 186 ms | 10.5 s |
| Headed window | visible / focused | 9 / 11 ms | 30 / 214 ms | 10.1 s |

- **Nothing is throttled under Playwright, headless or headed.** The 8–9 ms lateness is the ordinary timer overhead of a page in front: it was the same headed as headless. The higher figures just after the second tab opened were taken while that tab was loading. After 6 minutes behind it the p50 was back to 8–9 ms in every mode, and the heartbeat was never older than one refresh plus one read gap.
- **A page behind another tab still reports `visible` and focused.** Playwright emulates focus and visibility for every page, so bringing another tab to the front doesn't hide the game. So the harness **cannot reproduce** background-tab throttling as it stands. Testing it would need the Chrome DevTools Protocol (for example `Emulation.setFocusEmulationEnabled` off, or `Page.setWebLifecycleState`). That wasn't tried, because background tabs are out of scope for runs (#1).
- **The smoke test runs headless, in Playwright's default headless shell.** Both headless modes behaved the same, and the shell is the lighter one. **(inference)** The same focus emulation applies on the Linux CI runner, so its windows should not be throttled either. Read the CI log's `findings` line (`timers`, `maxStateAgeMs`) to confirm it.
- **A real player's browser is a separate question.** The findings above cover Playwright only. In a normal Chrome, a hidden tab or a minimised window is still throttled as described in `realtime-throughput.md` §4, and a visible window that is fully covered by another window may be too (Chromium's occlusion tracking). None of that was measured here.

### Other facts the harness relies on

- **Error lines** in the terminal carry a class ending in `-error`, from the tss-react `makeStyles` key in `ANSIITypography`. A `tprint` starting with `ERROR` or `FAIL` gets it. `WARN` gets `-warning` instead (from the source; not run).
- **A script that throws** opens a modal with `<h2>RUNTIME ERROR</h2>` and prints nothing to the terminal. The harness reads these modals too.
- **The first submission** of the start command on a new game prints `Script boot.js does not exist on home.` as an error line, as designed (user story 2). The smoke test allows exactly that line, once, in the start phase only.
- **Timings of a passing smoke** (4 passing runs on the build with #47 and #48 merged):
  - first submission to the conductor's first state write: 4.5–9.4 s;
  - reload: 1.4–4.8 s;
  - retype to the conductor writing again: 3.7–5.6 s;
  - the oldest heartbeat seen: 8.7–11.4 s.

  The whole attempt takes about half a minute. The conductor's first iteration rewrites the file boot created, so `updatedAt` passes `startedAt` soon after `conductor: up`.
- **The save** after a start is a 15 KB gzip. Reading it with `readSave` and loading it into a fresh browser with `seedSave` skips the tutorial and brings the run's files and state file onto home.
- **A broken conductor fails the smoke test:**
  - one that throws on start fails in about 10 s (an error modal, a state file never refreshed, nothing in `ps`);
  - one whose every iteration fails fails in about 6 s (`ERROR conductor:` lines);
  - one that runs but never writes the state file fails at the 10-minute deadline.
