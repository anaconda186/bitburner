// npm run scenario -- <milestone> [--until <milestone>] [--timeout 12h] [--headless] [--no-capture] [--build <dir>]
//
// A scenario test (#50): does the current build get the run from one
// milestone save to the next milestone? Local only, never in Actions.
//   1. Loads saves/<milestone>.gz, refusing a lab save, a save without its
//      sidecar or one made for another target version (saves.ts).
//   2. Compiles src/ (or takes --build) and answers the raw GitHub URLs with
//      it, as the smoke test does.
//   3. In its own headed window: seeds IndexedDB with the save, loads the
//      game, presses Connect on the Remote API and types the start command
//      once, the real after-reload path.
//   4. Once the conductor runs the build under test, checks our RAM figures
//      against the game's in the save's own BitNode and Source-Files.
//   5. Passes when the run reaches --until (default: any milestone the save
//      didn't have) on that build; fails on a terminal error, a page error,
//      a game error dialog, a new run starting, or the timeout. Milestones it
//      passes on the way are captured as milestone saves, as the dev loop
//      does (--no-capture to keep saves/ as it is).
// Exits 0 on a pass, 1 on a failure. The browser is closed either way.

import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { MILESTONES } from "../src/sr/milestones.ts";
import { currentBuild, type RunState } from "../src/sr/state.ts";
import { GAME_DIR } from "./fetch-game.ts";
import { compile, devRelease, resumeFromSave, startListener } from "./harness/devloop.ts";
import { errorDialogs, openBrowser, serveGame, START_COMMAND, terminalLines, type GameSession } from "./harness/game.ts";
import { localRelease, readBuildBytes } from "./harness/release.ts";
import { startRemoteApi } from "./harness/remote-api.ts";
import { loadScenarioSave } from "./harness/saves.ts";
import { judgeScenario, newLines, parseDuration, scenarioTarget, type ScenarioVerdict } from "./harness/scenario-verdict.ts";
import { compareRam, terminalErrors } from "./harness/verdict.ts";
import { gameRam, staticRam } from "./smoke.ts";

const POLL_MS = 5_000;

export interface ScenarioOptions {
  repo: string;
  milestone: string;
  until?: string;
  timeoutMs: number;
  headless: boolean;
  capture: boolean;
  /** A built folder to test instead of compiling src/. */
  buildDir?: string;
  appDir: string;
  log?: (line: string) => void;
}

export async function runScenario(o: ScenarioOptions): Promise<ScenarioVerdict> {
  const log = o.log ?? console.log;
  const failed = (...problems: string[]): ScenarioVerdict => ({ status: "failed", problems });

  const start = await loadScenarioSave(o.repo, o.milestone);
  if (!start.ok) return failed(start.error);
  const target = scenarioTarget(o.until, start.state, MILESTONES.map((m) => m.name));
  if (!target.ok) return failed(target.error);

  let files: Map<string, Uint8Array>;
  if (o.buildDir !== undefined) files = await readBuildBytes(o.buildDir);
  else {
    const c = await compile(o.repo);
    if (!c.ok) return failed(`the build does not compile:\n${c.output}`);
    files = c.files;
  }
  const release = o.buildDir !== undefined ? localRelease(files, "local-build") : await devRelease(o.repo, files);
  const build = release.manifest.source;
  const ours = await staticRam(files, start.context);
  log(`scenario: ${o.milestone} → ${target.until ?? "the next milestone"}, build ${build}, BitNode ${start.context.bitNodeN}`);

  const game = await serveGame(o.appDir);
  const api = await startRemoteApi();
  let session: GameSession | undefined;
  // Polled by the loop below, not on a timer; it starts from the save's own
  // state, so a milestone the run reaches is a change it sees.
  const listener = startListener(api, o.repo, { everyMs: 60 * 60_000, capture: o.capture, seen: start.state, log });
  try {
    session = await openBrowser(release, { headless: o.headless });
    const { page } = session;
    const shownLines = async () => (await terminalLines(page)).filter((l) => l.text.trim() !== "");
    await resumeFromSave(session, game.url, api, start.bytes);
    const typedAt = Date.now();
    // Judged: every terminal line after the typed start command.
    let lines = await shownLines();
    const errors: string[] = terminalErrors(lines.slice(lines.findLastIndex((l) => l.text.includes(START_COMMAND)) + 1), []);
    let ramChecked = false;

    for (;;) {
      const latest: RunState | null = await listener.poll();
      const shown = await shownLines();
      // Another page (the driver's UI) hides the terminal: nothing to read then.
      if (shown.length > 0) {
        errors.push(...terminalErrors(newLines(lines, shown), []));
        lines = shown;
      }

      if (!ramChecked && latest !== null && latest.updatedAt > typedAt && currentBuild(latest) === build) {
        ramChecked = true;
        const ram = compareRam(ours, await gameRam(api, [...ours.keys()]));
        log(`scenario: RAM cross-check ${ram.ok ? "ok" : "FAILED"} (${ours.size} scripts, BitNode ${start.context.bitNodeN})`);
        errors.push(...ram.problems);
      }

      const all = [...errors, ...session.pageErrors.map((e) => `page error: ${e}`), ...(await errorDialogs(page)).map((e) => `error dialog: ${e}`)];
      const v = judgeScenario({ start: start.state, until: target.until, build, latest, errors: all, elapsedMs: Date.now() - typedAt, timeoutMs: o.timeoutMs });
      if (v.status !== "running") {
        if (v.status === "passed" && !ramChecked) return failed(`${v.milestone} was reached before the RAM cross-check could run`);
        return v;
      }
      await page.waitForTimeout(POLL_MS);
    }
  } finally {
    listener.stop();
    await session?.close();
    await api.close();
    await game.close();
  }
}

if (import.meta.main) {
  if (process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true") {
    console.error("scenario: scenario tests never run in CI (spec #41); run them locally");
    process.exit(1);
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      until: { type: "string" },
      timeout: { type: "string", default: "12h" },
      headless: { type: "boolean", default: false },
      capture: { type: "boolean", default: true },
      build: { type: "string" },
      game: { type: "string", default: join(GAME_DIR, "app") },
    },
  });
  if (positionals.length !== 1) {
    console.error("usage: npm run scenario -- <milestone> [--until <milestone>] [--timeout 12h] [--headless] [--no-capture] [--build <dir>]");
    process.exit(2);
  }
  const v = await runScenario({
    repo: resolve("."),
    milestone: positionals[0]!,
    ...(values.until !== undefined ? { until: values.until } : {}),
    timeoutMs: parseDuration(values.timeout),
    headless: values.headless,
    capture: values.capture,
    ...(values.build !== undefined ? { buildDir: resolve(values.build) } : {}),
    appDir: resolve(values.game),
  });
  if (v.status === "passed") console.log(`scenario: passed, reached ${v.milestone}`);
  else for (const p of v.status === "failed" ? v.problems : ["stopped while running"]) console.log(`scenario: FAIL ${p}`);
  process.exitCode = v.status === "passed" ? 0 : 1;
}
