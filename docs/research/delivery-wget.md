# Delivering the start command with `wget`

Research date: 2026-10-28. Answers [#5](https://github.com/anaconda186/bitburner/issues/5).

Sources:
- The game's source at tag [`v3.0.1`](https://github.com/bitburner-official/bitburner-src/tree/v3.0.1) (commit `3162fd2`). I read it from a source tarball of the tag and did not run it. Every `V301/path#Lx` link below goes to `https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/path#Lx`.
- HTTP headers of the candidate hosts, fetched with `curl` on 2026-10-28 using `Origin: https://bitburner-official.github.io`. These are header checks only; I did not run a real browser `fetch`. What a browser would do is inferred from the headers and the CORS rules.

Vocabulary follows [GLOSSARY.md](../../GLOSSARY.md).

---

## Summary

1. **No single terminal line can download and then run a script on a fresh save.** The terminal splits a line on `;` and runs each part synchronously, one after another. `wget` only starts a `fetch` and returns at once; the file is written later, in a promise callback. So in `wget URL boot.js; run boot.js`, the `run` executes before `boot.js` exists and fails with "Script boot.js does not exist on home." `&&` is not supported. Aliases do not help, because a fresh save has none.
   - **The smallest human input is the same line submitted twice:** `wget <boot-url> boot.js; run boot.js`, then Up-arrow and Enter. The first submission downloads; the second runs. After a page reload, one submission is enough, because `boot.js` is already in the save.
   - **This is a rules decision for the map:** the glossary says the start command is a *single* terminal command. Either a "start command" becomes this line entered twice, or it becomes two commands (`wget ...`, then `run boot.js`). I found no way inside the rules to reach one submission (see section 5).
2. **CORS is not a problem with the right hosts.** The web game runs on origin `https://bitburner-official.github.io`, with no Content Security Policy. All of these send `Access-Control-Allow-Origin: *`: `raw.githubusercontent.com`, any `*.github.io` GitHub Pages site, `gist.githubusercontent.com` and `cdn.jsdelivr.net`.
   - **URLs that redirect fail.** `github.com/.../raw/...` and `gist.github.com/.../raw` redirect without a usable CORS header, so a browser `fetch` should reject them. Use the final host directly.
   - **The repo must be public.** `raw.githubusercontent.com/anaconda186/bitburner/...` returns 404 while the repo is private.
3. **`ns.wget` costs 0 GB, waits for the write to finish, and returns `true`/`false`.** That makes a tiny bootstrap the clean way to deliver many files. `boot.js` downloads `manifest.json`, reads it, downloads every listed file in parallel to SHA-pinned URLs, and then hands over to the entry script.
   - **RAM:** 1.6 GB base + 1.0 GB `ns.run` = **2.6 GB**, or 1.6 + 2.0 GB `ns.spawn` = **3.6 GB**. Both fit on an 8 GB home. With `ns.spawn(entry, {spawnDelay: 0})`, the bootstrap's RAM is freed before the entry starts, so the entry gets all 8 GB.
4. **File rules.** The target must end in `.js`, `.jsx`, `.ts`, `.tsx` or `.script` (scripts), or `.txt`, `.json` or `.css` (text). Only HTTP 200 counts as success. Existing files are overwritten. I found no size limit in the write path.
5. **The tutorial blocks every terminal command except the current tutorial step.** A fresh save always starts in it. Exiting takes one click on "Exit Tutorial" in the tutorial panel, which only clears a flag. After that nothing is blocked. The tutorial state is not saved and only starts when no save exists, so a reload does not bring it back.
6. **Other ways of getting files in all need extra human actions:**
   - `upload`: a directory picker and a confirmation dialog.
   - Remote File API: an external server, plus a port setting changed in Options. It also has no "run" message.
   - Pasting into `nano`.
   - Importing a save: a file dialog. It is also not a fresh save, and a crafted save is save editing.
   - There is no drag-and-drop handler.
   - None of these beats `wget`.

---

## 1. How `wget` works

### 1a. Terminal `wget`

[V301/src/Terminal/commands/wget.ts#L6-L35](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/wget.ts#L6-L35):

- **Arguments:** exactly two string arguments, `wget [url] [target file]`. Anything else is a usage error ([#L7-L10](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/wget.ts#L7-L10)).
- **Target:** resolved against the terminal's current directory. It must have a script or text extension ([#L12-L16](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/wget.ts#L12-L16)).
- **Transport:** a plain `fetch(url)` with no options ([#L18](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/wget.ts#L18)). The defaults are a CORS-mode GET with no credentials and no custom headers, which the browser sends as a "simple" request with no preflight. That matters because `raw.githubusercontent.com` answers a preflight `OPTIONS` with **403** (tested).
- **Success:** only `response.status === 200` is accepted ([#L20-L23](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/wget.ts#L20-L23)). The body is read with `response.text()` and written with `server.writeToContentFile` ([#L24](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/wget.ts#L24)). The terminal prints "wget successfully retrieved content to new file ..." or "... and overwrote ...".
- **Returns immediately.** The function is `void`, and the write happens in `.then`. It never sets a terminal "action", so the next command on the line runs at once.

### 1b. `ns.wget(url, target, host?)`

[V301/src/NetscriptFunctions.ts#L1375-L1412](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L1375-L1412). Signature `wget(url: string, target: string, host?: string): Promise<boolean>` ([V301 d.ts#L8880-L8899](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ScriptEditor/NetscriptDefinitions.d.ts#L8880-L8899)).

- **Same transport and rules** as the terminal command: a plain `fetch(url)`, HTTP 200 only, and the same extension check.
- **It is `async` and awaits the write,** so `await ns.wget(...)` returns after the file exists. It returns `true` on success. On a bad extension, a network or CORS error, or a non-200 status it logs and returns `false`; it does not throw.
- **The target path is resolved relative to the calling script's directory** (`helpers.filePath` → `resolveFilePath(filename, ctx.workerScript.name)`, [V301/src/Netscript/NetscriptHelpers.tsx#L718-L723](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L718-L723)). An unparseable path **throws** rather than returning `false`.
- **`host`** can write to another server (default: the script's own server).
- **RAM cost: 0 GB** ([V301/src/Netscript/RamCostGenerator.ts#L648](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L648); also "RAM cost: 0 GB" in the d.ts).

### 1c. What gets written

- `writeToContentFile` sends text extensions to `writeToTextFile` and everything else to `writeToScriptFile` ([V301/src/Server/BaseServer.ts#L255-L291](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/BaseServer.ts#L255-L291)). Both overwrite an existing file or create a new one.
- **Overwriting a script** goes through the `content` setter, which invalidates the compiled module ([V301/src/Script/Script.ts#L37-L42](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/Script.ts#L37-L42)). Instances already running keep the old code; the next launch uses the new code.
- **Extensions:**
  - Scripts: `.js`, `.jsx`, `.ts`, `.tsx`, plus `.script`, which can be written but not run in 3.x ([V301/src/Paths/ScriptFilePath.ts#L20](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Paths/ScriptFilePath.ts#L20)).
  - Text: `.txt`, `.json`, `.css` ([V301/src/Paths/TextFilePath.ts#L8](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Paths/TextFilePath.ts#L8)).
  - The check is only `path.endsWith(ext)`.
  - The help text says the same ([V301/src/Terminal/HelpText.ts#L562-L574](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/HelpText.ts#L562-L574)), and its own example uses `raw.githubusercontent.com`.
- **Size and other quirks:**
  - I found no size check anywhere in the write path.
  - Every byte becomes part of the save, which autosaves every 60 s by default ([V301/src/Settings/Settings.ts#L17](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Settings/Settings.ts#L17)).
  - Every script is parsed for the static RAM calculation, so oversized files cost parse time but are not rejected.
  - `.ts` files are transpiled by the game itself ([V301/src/NetscriptJSEvaluator.ts#L102](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptJSEvaluator.ts#L102)). Shipping our compiled `.js` avoids that step and keeps us in control of the output.
- **URL imports are not a shortcut.** The RAM calculator skips `http(s)://` imports ([V301/src/Script/RamCalculations.ts#L135-L137](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/RamCalculations.ts#L135-L137)), but the module loader only resolves imports to files on the server ([V301/src/utils/ScriptTransformer.ts#L135-L150](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/utils/ScriptTransformer.ts#L135-L150)). Even if a URL import loaded, any NS call that the static RAM count missed trips the dynamic RAM check and kills the script ([V301/src/Netscript/NetscriptHelpers.tsx#L435-L470](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L435-L470)). Files must be downloaded with `wget`.

---

## 2. Hosts and CORS

### 2a. The game's origin

- **Release build:** the README names `https://bitburner-official.github.io/` as the release build and `/bitburner-src/` as the development build ([V301/README.md#L9](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/README.md#L9)). Both are on the origin **`https://bitburner-official.github.io`**.
- **Where each build comes from:**
  - The dev build is deployed from `bitburner-src` by [`deploy-dev.yml`](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/.github/workflows/deploy-dev.yml) (`actions/deploy-pages`).
  - The release build is the separate repo [`bitburner-official/bitburner-official.github.io`](https://github.com/bitburner-official/bitburner-official.github.io). Its latest commit is "Update to 3.0.1 (#21)" from 2026-05-17.
  - The live `dist/main.bundle.js` contains `VersionString:"3.0.1"`, so the target version is what is being served.
- **No CSP:** the page sends no `Content-Security-Policy` header and its HTML has no CSP meta tag, so `connect-src` places no limit on `fetch`.

### 2b. Header checks

Each `curl` request was a GET sent with `Origin: https://bitburner-official.github.io`.

| URL form | Status | `Access-Control-Allow-Origin` | Cache | Works from the game? |
|---|---|---|---|---|
| `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` (tag, branch or commit SHA) | 200 | `*` | `max-age=300`, `text/plain` | **Yes** |
| `raw.githubusercontent.com/anaconda186/bitburner/main/README.md` (private repo) | 404 | `*` | | **No, until the repo is public** |
| `github.com/<owner>/<repo>/raw/<ref>/<path>` | 302 → raw | *empty* | | **No.** The redirect itself fails the CORS check. |
| GitHub Pages: `bitburner-official.github.io/bitburner-src/`, `octocat.github.io/`, `pages.github.com/` | 200 | `*` | `max-age=600`; `.js` served as `application/javascript` | **Yes** |
| `gist.githubusercontent.com/<user>/<id>/raw[/<sha>/<file>]` | 200 | `*` | `max-age=300` | **Yes** |
| `gist.github.com/<user>/<id>/raw` | 301 → gist raw | *(none)* | | **No.** Same redirect problem. |
| `cdn.jsdelivr.net/gh/<owner>/<repo>@<tag or sha>/<path>` | 200 | `*` | `max-age=31536000, immutable` | **Yes** |
| `cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/<path>` | 200 | `*` | `max-age=604800, s-maxage=43200` | Yes, but stale for hours. Avoid for anything that changes. |
| Preflight `OPTIONS` to `raw.githubusercontent.com` | 403 | | | Irrelevant: the game never preflights. |

### 2c. Choice of host

**Recommendation: `raw.githubusercontent.com` from this repo once it is public.** It needs no deploy step and it is the host the game's own help text uses.

- **Mutable entry points:** point the start command's `boot.js` and the `manifest.json` at a branch. They can then be up to about 5 minutes stale, from `max-age=300` at the CDN and in the browser's HTTP cache, because `fetch` uses the default cache mode.
- **Everything else:** download the listed files from a **commit-SHA URL** recorded in the manifest. That makes the file set immutable and consistent, even if a push lands during the download.
- **Alternatives:**
  - GitHub Pages (`anaconda186.github.io/bitburner/`) works equally well, but needs a Pages deploy.
  - jsDelivr is a fallback for SHA-pinned files only.

---

## 3. Terminal parsing: chaining, aliases, and `run` after `wget`

### 3a. `;` chaining, no `&&`

- **Input:** pressing Enter calls `Terminal.executeCommands(line)` ([V301/src/Terminal/ui/TerminalInput.tsx#L241-L251](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/ui/TerminalInput.tsx#L241-L251)).
- **Splitting:** `parseCommands` splits the line on `;` outside quotes, applies aliases once, splits again and drops empty parts ([V301/src/Terminal/Parser.ts#L13-L26](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Parser.ts#L13-L26)).
- **Running:** `executeCommands` then runs them in a plain synchronous loop: `for (const command of allCommands) this.executeCommand(command);` ([V301/src/Terminal/Terminal.ts#L681-L692](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L681-L692)).
- **No `&&`, `||` or conditionals.** `&&` is not special anywhere in the parser, so it would become an ordinary argument.
- **Arguments:** they are split on whitespace, with quotes respected ([Parser.ts#L29-L35](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Parser.ts#L29-L35)). A URL must not contain a bare `;`.
- **Timed actions:** if a timed action such as `hack` or `analyze` is running, later commands are **rejected, not queued** ("Cannot execute command ... while an action is in progress", [Terminal.ts#L706-L707](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L706-L707)). They cannot be used as a delay.

### 3b. `run` straight after `wget` on the same line

- **It fails on a fresh save.** `wget` returns before the file is written (1a). `run` → `runScript` → `createRunningScriptInstance` immediately does `server.scripts.get(path)` and fails with "Script boot.js does not exist on home." ([V301/src/NetscriptWorker.ts#L266-L278](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L266-L278); [V301/src/Terminal/commands/runScript.ts#L58-L67](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/runScript.ts#L58-L67)).
- **"Run by path" is no different.** Typing `boot.js` or `./boot.js` as the command ([Terminal.ts#L861-L862](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L861-L862)) goes through the same synchronous path.
- **It works when the file already exists**, for example on a retype after a reload, since scripts are saved. `run` then launches the saved copy while `wget` refreshes it in the background. If the remote `boot.js` changed, the old one runs this time.

### 3c. Aliases

- **A fresh save has none.** The maps start empty. The only writers are the `alias` command and loading from a save ([V301/src/Alias.ts#L4-L56](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Alias.ts#L4-L56)).
- **They persist.** They are saved as `AliasesSave` / `GlobalAliasesSave` in the save object ([V301/src/SaveObject.ts#L219-L220](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SaveObject.ts#L219-L220), [#L492-L499](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SaveObject.ts#L492-L499)), so they survive reloads and resets.
- **Substitution:** applied to the first word (local aliases) or any word (global `-g` aliases), recursively, with loop protection ([Alias.ts#L82-L115](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Alias.ts#L82-L115)).
- **Not settable from scripts.** v3.0.1 has no NS API for aliases. `ns.ui.alias` exists only on `dev` (#2806), and there is no `alias` in [V301/src/NetscriptFunctions/UserInterface.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions/UserInterface.ts).
- **Not useful for the start.** An alias would only shorten the line, and defining one costs another command. A script could install one through UI automation, but only after the run has started. It would only shorten the retype after a reload, and costs the 25 GB DOM RAM.

---

## 4. The tutorial

- **When it starts:** only on the "no save found" branch of `Engine.load`, which calls `iTutorialStart()` ([V301/src/engine.tsx#L380-L392](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/engine.tsx#L380-L392)).
  - `ITutorial` is not part of the save, so a page reload with a save present never restarts it.
  - The only other entry point is the "reactivate tutorial" callback in the UI ([V301/src/ui/GameRoot.tsx#L450-L458](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/GameRoot.tsx#L450-L458)).
- **What it blocks:**
  - **Every terminal command except the exact command for the current step.** Anything else prints "Bad command. Please follow the tutorial or click 'Exit Tutorial' if you'd like to skip it." and returns ([V301/src/Terminal/Terminal.ts#L714-L856](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/Terminal.ts#L714-L856)). So `wget` cannot be typed during the tutorial.
  - **Killing scripts.** `killWorkerScript` refuses with "Processes cannot be killed during the tutorial." ([V301/src/Netscript/killWorkerScript.ts#L17-L21](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/killWorkerScript.ts#L17-L21)). This also breaks `ns.spawn` (section 6) and `kill`/`killall`. `dev` lifts this (#2797).
  - **Buying hacknet nodes**, except at its own step ([V301/src/Hacknet/HacknetHelpers.tsx#L38-L46](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Hacknet/HacknetHelpers.tsx#L38-L46)).
  - **The character overview.** The tutorial panel takes its place while the tutorial runs ([V301/src/ui/GameRoot.tsx#L533-L545](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/GameRoot.tsx#L533-L545)).
- **Exiting:** the panel always shows an "Exit Tutorial" button (labelled "Finish Tutorial" on the last page) wired to `iTutorialEnd` ([V301/src/ui/InteractiveTutorial/InteractiveTutorialRoot.tsx#L618-L620](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ui/InteractiveTutorial/InteractiveTutorialRoot.tsx#L618-L620)).
  - `iTutorialEnd` sets `isRunning = false`, resets the step, adds "hackers-starting-handbook.lit" to home's messages and emits an event ([V301/src/InteractiveTutorial.ts#L101-L108](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/InteractiveTutorial.ts#L101-L108)).
  - So exiting is **exactly one click**, with no confirmation and no other side effects. After it, every block above is gone.
- **Fresh home:** 8 GB, root access, and `NUKE.exe` only. There are no scripts ([V301/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L63-L78](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L63-L78)). Nothing is already present that the first `run` could start.

---

## 5. Getting to a single submission: what I ruled out

Within the human actions in the glossary, nothing gives a true single submission on a fresh save:

| Idea | Why it fails |
|---|---|
| `wget …; run …` | `run` executes before the fetch resolves (3b). |
| `&&`, or waiting with `hack`/`analyze` between them | No `&&` exists. Timed actions reject later commands instead of queueing them (3a). |
| An alias | None on a fresh save. Defining one is a command of its own (3c). |
| `run <url>` | `run` only takes a server file path ([V301/src/Terminal/commands/run.ts#L10-L33](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/run.ts#L10-L33)). |
| `expr` | It strips every character except `-()0-9eE/*+.%` before `eval`, so no code can get through ([V301/src/Terminal/commands/expr.ts#L8-L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/expr.ts#L8-L14)). Abusing it would be an exploit anyway. |
| Autoexec script setting | It runs `Settings.AutoexecScript` only when a save is loaded, and the default is `""` ([V301/src/NetscriptWorker.ts#L185-L212](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L185-L212), [Settings.ts#L15](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Settings/Settings.ts#L15)). Setting it means clicking through Options. |

**Options for the map** (my ranking):

1. **Recommended: one line, entered twice on a fresh save.**
   - The line is `wget https://raw.githubusercontent.com/anaconda186/bitburner/<branch>/dist/boot.js boot.js; run boot.js`.
   - **First submission:** downloads `boot.js`, and the `run` fails harmlessly.
   - **Second submission** (Up, Enter): runs it.
   - **After a reload:** a single submission runs the saved `boot.js` and refreshes it.
   - **The cost:** "type the start command" in the human-action list must allow a second Enter on the first try, or the glossary's "single terminal command" must change.
2. **Two different commands:** `wget <url> boot.js`, then `run boot.js`. This is equally short, but the human has to remember two lines, and the retype after a reload is a different line from the first start.
3. **Paste a bootstrap into `nano boot.js`, save, then `run boot.js`.** This is more human work and nothing is gained.

---

## 6. The bootstrap pattern for many files

**Shape:**
1. The start command fetches only `boot.js`.
2. `boot.js` fetches a manifest from the same branch.
3. The manifest lists a commit SHA, the entry script and all files.
4. `boot.js` downloads every file in parallel from SHA-pinned URLs, checks that they all succeeded, then hands over to the entry script.

```js
// boot.js: 1.6 GB base + 2.0 GB spawn = 3.6 GB static RAM
const BRANCH = "https://raw.githubusercontent.com/anaconda186/bitburner/release/dist/";
export async function main(ns) {
  if (!(await ns.wget(BRANCH + "manifest.json", "manifest.json"))) {
    ns.tprint("ERROR boot: manifest download failed");
    return;
  }
  // manifest: { "sha": "<commit>", "entry": "main.js", "files": ["main.js", "lib/x.js", ...] }
  const m = JSON.parse(ns.read("manifest.json"));
  const base = `https://raw.githubusercontent.com/anaconda186/bitburner/${m.sha}/dist/`;
  const ok = await Promise.all(m.files.map((f) => ns.wget(base + f, f)));
  const failed = m.files.filter((_, i) => !ok[i]);
  if (failed.length) {
    ns.tprint(`ERROR boot: ${failed.length} downloads failed: ${failed.join(" ")}`);
    return;
  }
  ns.spawn(m.entry, { spawnDelay: 0 });
}
```

**RAM on 8 GB home** (V301 [RamCostGenerator.ts](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts)):

| Item | GB | Source |
|---|---|---|
| Script base | 1.6 | [#L11](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L11) |
| `wget`, `read`, `write`, `tprint`, `sleep` | 0 | [#L564-L575](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L564-L575), [#L623-L625](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L623-L625), [#L648](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L648) |
| `run` | 1.0 | [#L25](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L25), [#L589](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L589) |
| `spawn` | 2.0 | [#L27](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L27), [#L591](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L591) |
| `fileExists` / `isRunning` (optional checks) | 0.1 each | [#L36-L37](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/RamCostGenerator.ts#L36-L37) |

- **`ns.run(entry)` → 2.6 GB.** The bootstrap still holds its 2.6 GB when the entry starts, so the entry must fit in 5.4 GB at launch.
- **`ns.spawn(entry, {spawnDelay: 0})` → 3.6 GB.**
  - `spawn` kills the caller first, which frees its RAM synchronously through `removeWorkerScript` → `updateRamUsed`. Then it starts the entry at once ([V301/src/NetscriptFunctions.ts#L653-L683](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptFunctions.ts#L653-L683); [V301/src/Netscript/killWorkerScript.ts#L63-L124](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/killWorkerScript.ts#L63-L124)). The entry therefore gets the full 8 GB.
  - **The default `spawnDelay` is 10 000 ms** ([V301/src/Netscript/NetscriptHelpers.tsx#L260-L272](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Netscript/NetscriptHelpers.tsx#L260-L272)), so always pass `0`.
  - **During the tutorial, `spawn` cannot kill the caller.** That does not matter here, because the tutorial is already exited.
- **Static RAM quirk:**
  - **Name collisions are charged.** The RAM calculator charges for **any identifier** whose name matches an NS function or `document`/`window`, including object property names and local variables ([V301/src/Script/RamCalculations.ts#L185-L192](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/RamCalculations.ts#L185-L192), [#L407-L411](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Script/RamCalculations.ts#L407-L411)). Inside `boot.js`, avoid names such as `run`, `exec`, `scan`, `ls`, `ps`, `kill` or `hack`, or anything containing `document`/`window`.
  - **Imports are charged too.** The cost includes everything the script imports, so `boot.js` must import nothing.
- **Bootstrap design notes:**
  - **Text files:** the manifest must be `.json` or `.txt` to be writable.
  - **Paths:** they are resolved relative to `boot.js`'s directory, so keep `boot.js` at the root.
  - **Fewer files would cut requests.** One request per file is fine for tens of files. The build could also inline small modules to cut the count.
  - **Retyping is harmless.** The pattern overwrites everything, so retyping it re-downloads the same SHA.
- **Note for other tickets: scripts come back by themselves after a reload.** Running scripts are saved and restarted automatically on load, unless `ExcludeRunningScriptsFromSave` is set ([V301/src/NetscriptWorker.ts#L218-L262](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/NetscriptWorker.ts#L218-L262); [V301/src/Server/BaseServer.ts#L300-L302](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Server/BaseServer.ts#L300-L302)). They start again from the top of `main`, with their in-memory state lost. After a reload the orchestrator may already be running before the human retypes anything. The entry script should therefore be idempotent, or detect a duplicate of itself and exit.

---

## 7. Other ways to get files into a fresh save

| Method | One step? | Extra human actions | Verdict |
|---|---|---|---|
| Terminal `upload [dir]` | No | Pick a local folder in a file dialog, then confirm the "Upload files to …?" prompt ([V301/src/Terminal/commands/upload.ts#L11-L24](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/upload.ts#L11-L24), [#L127](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Terminal/commands/upload.ts#L127)). It still needs `run` afterwards. | Out: extra clicks, and the files must be on the local disk. |
| Remote File API (RFA) | No | An external WebSocket server, plus setting the port in Options. The default port `0` means disabled ([V301/src/RemoteFileAPI/RemoteFileAPI.ts#L6-L14](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/RemoteFileAPI.ts#L6-L14); [Settings.ts#L45-L51](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Settings/Settings.ts#L45-L51)). RFA can push and read files but has **no run message** ([V301/src/RemoteFileAPI/MessageHandlers.ts#L88-L254](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageHandlers.ts#L88-L254)), so `run` must still be typed. | Out. It is useful for development only. |
| Drag and drop | — | I found no `onDrop`/`dragover` handler in `src/`. | Not available. |
| Paste into `nano`/`vim` | No | Open the editor, paste, save, then run. | Out: more steps than `wget`. |
| Import a save (Options → Import, `SaveObject.importGame`, [V301/src/SaveObject.ts#L291-L330](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/SaveObject.ts#L291-L330)) | No | A file dialog and a confirmation. | Out. The game does not flag importing: `Exploit.EditSaveFile` is never set by code, and players add it by hand ([V301/src/Exploits/Exploit.ts#L25-L29](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Exploits/Exploit.ts#L25-L29)). But an imported save is not a fresh save, and a save prepared to carry scripts is save editing, which the map rules out. |

---

## Open questions

- **The human-action rule:** does "type the start command" allow one repeated Enter on a fresh save (option 1), or should the start command become two commands? This is a map decision.
- **No real browser test yet.** The CORS verdicts come from headers. Once the repo is public, a one-line `wget` from the live game will confirm them.
- **Branch name:** which branch serves `boot.js` and `manifest.json` (`main`, or a dedicated `release` branch that only moves when a build passes)? This depends on how builds are published.
