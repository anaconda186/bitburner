// npm run smoke [-- --build build] [--game .game/app] [--headed] [--channel chromium] [--once]
//
// The smoke test, the last gate before a build becomes the release. In the
// real v3.0.1 game in Chromium, with the raw URLs answered from the build:
//   1. New game, exit the tutorial, point the Remote API at our server.
//   2. Type the start command twice. Pass if the conductor refreshes
//      sr/state.json within about 10 minutes, it is still running, and the
//      terminal's only error is the expected first-submission line.
//   3. Check our static RAM figure for every script in the build against the
//      game's `calculateRam` (BN1.1, no Source-Files: a new game).
//   4. Save, reload the page, type the start command once. Pass if the same
//      run (same startedAt) is written again after the retype, the conductor
//      runs and the terminal shows no error.
// A failed attempt is retried once in a fresh browser; a second failure exits
// non-zero, so CI never reaches the publish step and the previous release
// stays live. Each attempt prints its timer-throttling probe, and a failed one
// leaves a screenshot and the terminal text in .smoke/.

import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { GAME_DIR } from "./fetch-game.ts";
import { RAM_CONTEXTS } from "./ram-budget.ts";
import { loadRamCalculator, type RamResult } from "./ram-calc.ts";
import {
  connectRemoteApi,
  errorDialogs,
  exitTutorial,
  isRunningOnHome,
  loadGame,
  openBrowser,
  probeTimers,
  saveGame,
  serveGame,
  START_COMMAND,
  terminalLines,
  typeLine,
  type BrowserOptions,
  type GameSession,
  type TimerProbe,
} from "./harness/game.ts";
import { localRelease, readBuildBytes, type LocalRelease } from "./harness/release.ts";
import { startRemoteApi, type RemoteApi } from "./harness/remote-api.ts";
import {
  compareRam,
  FIRST_SUBMISSION_LINE,
  judgeResume,
  judgeStart,
  retryOnce,
  terminalErrors,
  type GameRam,
  type StartObservation,
  type StateRead,
  type Verdict,
} from "./harness/verdict.ts";
import { STATE_FILE, parseState } from "../src/sr/state.ts";
import { CONDUCTOR } from "../src/boot.ts";

/** "Within about 10 minutes" (spec #41, user story 125), for each phase. */
const PHASE_DEADLINE_MS = 10 * 60_000;
const POLL_MS = 2_000;

export interface SmokeOptions extends BrowserOptions {
  buildDir: string;
  appDir: string;
  source: string;
  /** Where a failed attempt leaves its screenshot and terminal text. */
  outDir: string;
  log?: (line: string) => void;
}

interface Findings {
  loadMs?: number;
  connectMs?: number;
  startMs?: number;
  reloadMs?: number;
  resumeMs?: number;
  timers?: TimerProbe;
  maxStateAgeMs?: number;
  /** Error-styled terminal lines in the start phase, the allowed one included. */
  startErrorLines?: string[];
}

/** One smoke attempt in a fresh browser. */
export async function smokeAttempt(opts: SmokeOptions, release: LocalRelease, ours: ReadonlyMap<string, RamResult>, n: number): Promise<Verdict> {
  const log = opts.log ?? console.log;
  const game = await serveGame(opts.appDir);
  const api = await startRemoteApi();
  let session: GameSession | undefined;
  const findings: Findings = {};
  let result: Verdict = { ok: false, problems: ["attempt did not finish"] };
  try {
    session = await openBrowser(release, opts);
    const { page } = session;

    // 1. New game, exit the tutorial, Remote API.
    let t = Date.now();
    await loadGame(page, game.url);
    findings.loadMs = Date.now() - t;
    await exitTutorial(page);
    t = Date.now();
    await connectRemoteApi(page, api.port);
    if (!(await api.waitForGame(15_000))) return (result = { ok: false, problems: ["the game never connected to the Remote API"] });
    findings.connectMs = Date.now() - t;
    findings.timers = await probeTimers(page);

    // 2. The start command, twice: the first submission only downloads.
    t = Date.now();
    // Wait for the wget's answer, success or failure, before the second.
    const echoed = (await terminalLines(page)).length;
    await typeLine(page, START_COMMAND);
    await waitForLine(page, echoed, (text) => text.startsWith("wget "), 60_000);
    await typeLine(page, START_COMMAND);
    const start = await observe(session, api, echoed, [FIRST_SUBMISSION_LINE], (s) => s.updatedAt > s.startedAt);
    findings.startMs = Date.now() - t;
    const started = judgeStart(start);
    findings.startErrorLines = start.terminal.filter((l) => l.error).map((l) => l.text);
    log(`smoke ${n}: start ${started.ok ? "ok" : "FAILED"} after ${seconds(findings.startMs)}`);

    // 3. Our RAM figures against the game's, for every script in the build.
    const ram = compareRam(ours, await gameRam(api, [...ours.keys()]));
    log(`smoke ${n}: RAM cross-check ${ram.ok ? "ok" : "FAILED"} (${ours.size} scripts)`);
    if (!started.ok) return (result = merge(started, ram));

    // 4. Save, reload, retype once.
    const startedAt = lastState(start.states)!.startedAt;
    await saveGame(page);
    const connectionsBefore = api.connections();
    t = Date.now();
    await page.reload({ waitUntil: "load" });
    await page.locator("#terminal-input").waitFor({ timeout: 180_000 });
    findings.reloadMs = Date.now() - t;
    await connectRemoteApi(page, api.port);
    if (!(await api.waitForGame(15_000, connectionsBefore))) return (result = merge(started, ram, { ok: false, problems: ["the game did not reconnect to the Remote API after the reload"] }));
    const reloadedLines = (await terminalLines(page)).length;
    const retypedAt = Date.now();
    await typeLine(page, START_COMMAND);
    const resume = await observe(session, api, reloadedLines, [], (s) => s.startedAt === startedAt && s.updatedAt > retypedAt);
    findings.resumeMs = Date.now() - retypedAt;
    const resumed = judgeResume(resume, startedAt, retypedAt);
    log(`smoke ${n}: resume ${resumed.ok ? "ok" : "FAILED"} after ${seconds(findings.resumeMs)}`);
    findings.maxStateAgeMs = maxStateAge([...start.states, ...resume.states]);
    return (result = merge(started, ram, resumed));
  } finally {
    log(`smoke ${n}: findings ${JSON.stringify(findings)}`);
    if (!result.ok && session) await leaveEvidence(session, opts.outDir, n).catch((e) => log(`smoke ${n}: no evidence saved: ${String(e)}`));
    await session?.close();
    await api.close();
    await game.close();
  }
}

/**
 * Reads the state file every POLL_MS until `done` holds for a read, an
 * unexpected error shows, or the phase deadline passes; then checks the
 * conductor with `ps`.
 */
async function observe(
  session: GameSession,
  api: RemoteApi,
  /** Terminal lines before this phase's first command, which it doesn't judge. */
  from: number,
  allowed: readonly string[],
  done: (s: NonNullable<ReturnType<typeof lastState>>) => boolean,
): Promise<StartObservation> {
  const { page } = session;
  const states: StateRead[] = [];
  const end = Date.now() + PHASE_DEADLINE_MS;
  const errorsNow = async () => [...session.pageErrors, ...(await errorDialogs(page))];
  for (;;) {
    states.push({ atMs: Date.now(), text: await api.getFile(STATE_FILE).catch(() => "") });
    const last = lastState(states);
    if (last && done(last)) break;
    if (terminalErrors((await terminalLines(page)).slice(from), allowed).length > 0 || (await errorsNow()).length > 0) break;
    if (Date.now() > end) break;
    await page.waitForTimeout(POLL_MS);
  }
  const conductorRunning = await isRunningOnHome(page, CONDUCTOR);
  return {
    terminal: (await terminalLines(page)).slice(from),
    pageErrors: await errorsNow(),
    states,
    conductorRunning,
  };
}

function lastState(states: readonly StateRead[]) {
  const last = states.at(-1);
  if (!last) return undefined;
  const r = parseState(last.text);
  return r.ok ? r.state : undefined;
}

/** The oldest updatedAt seen at any read: how stale the heartbeat got. */
function maxStateAge(states: readonly StateRead[]): number | undefined {
  let max: number | undefined;
  for (const s of states) {
    const r = parseState(s.text);
    if (r.ok) max = Math.max(max ?? 0, s.atMs - r.state.updatedAt);
  }
  return max;
}

async function gameRam(api: RemoteApi, scripts: readonly string[]): Promise<Map<string, GameRam>> {
  const out = new Map<string, GameRam>();
  for (const s of scripts) {
    out.set(
      s,
      await api.calculateRam(s).then(
        (cost): GameRam => ({ ok: true, cost }),
        (e: unknown): GameRam => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      ),
    );
  }
  return out;
}

/** Waits until a terminal line after the first `from` lines satisfies `pred`. */
async function waitForLine(page: GameSession["page"], from: number, pred: (text: string) => boolean, timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await terminalLines(page)).slice(from).some((l) => pred(l.text))) return;
    await page.waitForTimeout(250);
  }
}

function merge(...vs: Verdict[]): Verdict {
  const problems = vs.flatMap((v) => v.problems);
  return { ok: problems.length === 0, problems };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

async function leaveEvidence(session: GameSession, outDir: string, n: number): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await session.page.screenshot({ path: join(outDir, `attempt-${n}.png`) });
  const lines = await terminalLines(session.page);
  const text = lines.map((l) => (l.error ? "E| " : "  ") + l.text).join("\n");
  await writeFile(join(outDir, `attempt-${n}-terminal.txt`), `${text}\n\nraw requests:\n${session.rawRequests.join("\n")}\n`);
}

/** Our static price of every script in the build, in a new game's context (BN1.1, no Source-Files). */
export async function staticRam(files: ReadonlyMap<string, Uint8Array>): Promise<Map<string, RamResult>> {
  const calc = await loadRamCalculator();
  const text = new Map([...files].filter(([f]) => f.endsWith(".js")).map(([f, b]) => [f, new TextDecoder().decode(b)]));
  return new Map([...text.keys()].sort().map((f) => [f, calc(text, f, RAM_CONTEXTS["BN1.1"])]));
}

export async function runSmoke(opts: SmokeOptions, once = false): Promise<boolean> {
  const log = opts.log ?? console.log;
  const files = await readBuildBytes(opts.buildDir);
  const release = localRelease(files, opts.source);
  const ours = await staticRam(files);
  const attempt = (n: number) => smokeAttempt(opts, release, ours, n);
  const r = once ? await attempt(1).then((v) => ({ ok: v.ok, attempts: [v] })) : await retryOnce(attempt);
  r.attempts.forEach((v, i) => {
    for (const p of v.problems) log(`smoke ${i + 1}: FAIL ${p}`);
  });
  log(r.ok ? `smoke: passed (attempt ${r.attempts.length})` : `smoke: FAILED ${r.attempts.length === 1 ? "once" : "twice"}`);
  return r.ok;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      build: { type: "string", default: "build" },
      game: { type: "string", default: join(GAME_DIR, "app") },
      source: { type: "string" },
      out: { type: "string", default: ".smoke" },
      headed: { type: "boolean", default: false },
      channel: { type: "string" },
      once: { type: "boolean", default: false },
    },
  });
  const source = values.source ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const ok = await runSmoke(
    {
      buildDir: resolve(values.build),
      appDir: resolve(values.game),
      source,
      outDir: resolve(values.out),
      headless: !values.headed,
      ...(values.channel ? { channel: values.channel } : {}),
    },
    values.once,
  );
  if (!ok) process.exitCode = 1;
}
