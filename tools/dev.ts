// npm run dev [-- --port 12525] [--open new|<milestone>] [--lab <save.gz>] [--headless] [--no-capture] [--root <dir>]
//
// The inner loop (#50), against the live game, with no release in between:
// - Serves the Remote API on --port (default 12525, the game's own
//   placeholder). Point any game at it (Options → Remote API, Connect).
// - Compiles src/ on every change and pushes what changed into the connected
//   game with pushFile, manifest.json included. A game that connects (or
//   reconnects) gets the whole build. Helpers run the new code from their
//   next launch; the conductor from its next start (a reload and one retype
//   of the start command, or `kill` it and `run boot.js`).
// - Captures a milestone save whenever the state file's milestone changes to
//   a new one: saves/<milestone>.gz plus a sidecar (build, target version).
//   A lab game's saves go to lab-saves/ instead. --no-capture turns it off;
//   --root puts saves/ and lab-saves/ somewhere other than the repo.
// - --open opens the game in its own window (the harness's Chromium), with
//   the raw GitHub URLs answered from the latest local build, so the start
//   command and boot.js run it too: `new` for a new game (exit the tutorial
//   and type the start command yourself), or a milestone name to resume that
//   milestone save (the start command is typed once for you). --lab <file>
//   resumes any save as a lab save instead: it is marked as one first, so
//   nothing it reaches is ever filed as a milestone save. After a reload of
//   that window, Connect is pressed again by itself.

import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { GAME_DIR } from "./fetch-game.ts";
import { compile, devRelease, followingRelease, push, resumeFromSave, startListener } from "./harness/devloop.ts";
import { connectRemoteApi, exitTutorial, loadGame, openBrowser, serveGame, type GameSession } from "./harness/game.ts";
import type { Pushed } from "./harness/push.ts";
import { startRemoteApi } from "./harness/remote-api.ts";
import { loadScenarioSave, markLabSave } from "./harness/saves.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "12525" },
    open: { type: "string" },
    lab: { type: "string" },
    game: { type: "string", default: join(GAME_DIR, "app") },
    headless: { type: "boolean", default: false },
    capture: { type: "boolean", default: true },
    root: { type: "string", default: "." },
  },
  allowNegative: true,
});

const repo = resolve(".");
/** Where saves/ and lab-saves/ go. */
const root = resolve(values.root);
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const fail = (why: string): never => {
  console.error(`dev: ${why}`);
  process.exit(1);
};
if (values.open !== undefined && values.lab !== undefined) fail("use --open or --lab, not both");

const first = await compile(repo);
if (!first.ok) fail(`the first compile failed:\n${first.output}`);
let files = (first as { files: Map<string, Uint8Array> }).files;
const release = followingRelease(await devRelease(repo, files));
log(`dev: built ${files.size} files, source ${release.manifest.source}`);

const api = await startRemoteApi("127.0.0.1", Number(values.port));
log(`dev: Remote API on 127.0.0.1:${api.port}`);
const listener = startListener(api, root, { capture: values.capture, log });

// Pushes: the whole build to each new connection, then only changes.
let pushed: Pushed | null = null;
let pushedOn = 0;
let pushing = Promise.resolve();
const pushNow = (why: string) =>
  (pushing = pushing.then(async () => {
    if (!api.isConnected()) return;
    if (api.connections() !== pushedOn) pushed = null;
    pushedOn = api.connections();
    try {
      const r = await push(api, pushed, files, release);
      pushed = r.pushed;
      if (r.count > 0) log(`dev: pushed ${r.count} files (${why}), source ${release.manifest.source}`);
    } catch (e) {
      pushed = null;
      log(`dev: push failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
setInterval(() => {
  if (api.isConnected() && api.connections() !== pushedOn) void pushNow("game connected");
}, 500);

// Recompile on any change under src/, debounced; tests aren't compiled.
let timer: NodeJS.Timeout | undefined;
let compiling = Promise.resolve();
watch(join(repo, "src"), { recursive: true }, (_event, name) => {
  if (name !== null && /\.test\.ts$/.test(String(name))) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    compiling = compiling.then(async () => {
      const r = await compile(repo);
      if (!r.ok) return log(`dev: compile failed, nothing pushed:\n${r.output}`);
      files = r.files;
      release.set(await devRelease(repo, files));
      await pushNow(`${String(name)} changed`);
    });
  }, 300);
});
log("dev: watching src/");

let session: GameSession | undefined;
if (values.open !== undefined || values.lab !== undefined) {
  const game = await serveGame(resolve(values.game));
  session = await openBrowser(release, { headless: values.headless });
  const { page } = session;
  if (values.lab !== undefined) {
    const save = markLabSave(new Uint8Array(await readFile(resolve(values.lab))), `loaded by npm run dev from ${values.lab}`);
    await resumeFromSave(session, game.url, api, save);
    log(`dev: resumed lab save ${values.lab} (its captures go to lab-saves/)`);
  } else if (values.open === "new") {
    await loadGame(page, game.url);
    await exitTutorial(page);
    await connectRemoteApi(page, api.port);
    log("dev: new game open; type the start command (twice on a fresh save)");
  } else {
    const start = await loadScenarioSave(root, values.open!);
    if (!start.ok) fail(start.error);
    await resumeFromSave(session, game.url, api, (start as { bytes: Uint8Array }).bytes);
    log(`dev: resumed milestone save ${values.open}; start command typed once`);
  }
  // After a reload of the window, the game doesn't reconnect by itself (its
  // only auto-connect runs before the save's settings load).
  page.on("load", () => {
    void page
      .locator("#terminal-input")
      .waitFor({ timeout: 180_000 })
      .then(() => connectRemoteApi(page, api.port))
      .then(() => log("dev: reconnected after a reload"))
      .catch((e: unknown) => log(`dev: could not reconnect after a reload: ${String(e)}`));
  });
  page.on("close", () => {
    log("dev: the game window closed");
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  listener.stop();
  void Promise.allSettled([session?.close(), api.close()]).then(() => process.exit(0));
});
