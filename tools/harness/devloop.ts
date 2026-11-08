// The dev loop's shell (#50): compiling a local build, a release that follows
// it, pushing it into the open game, the milestone-save listener, and
// loading a save the real after-reload way. The rules these follow are pure
// and tested (push.ts, saves.ts, scenario-verdict.ts); this file only wires
// them to the game and the disk, and is checked in the game itself.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseState, STATE_FILE, type RunState } from "../../src/sr/state.ts";
import { connectRemoteApi, loadGame, seedSave, START_COMMAND, typeLine, type GameSession } from "./game.ts";
import { devSource, pushPlan, type Pushed } from "./push.ts";
import { localRelease, readBuildBytes, type LocalRelease } from "./release.ts";
import type { RemoteApi } from "./remote-api.ts";
import { milestoneToCapture, storeCapture } from "./saves.ts";

const run = promisify(execFile);

/** gitignored scratch for the dev loop's compiles. */
export const DEV_DIR = ".dev";

export type Compiled = { ok: true; files: Map<string, Uint8Array> } | { ok: false; output: string };

/**
 * Compiles src/ the way `npm run build` does, but into a fresh folder under
 * `<repo>/.dev/`, so a failed compile (noEmitOnError) or a deleted source
 * never leaves stale files behind, and build/ (the smoke test's) is untouched.
 */
export async function compile(repo: string): Promise<Compiled> {
  await mkdir(join(repo, DEV_DIR), { recursive: true });
  const out = await mkdtemp(join(repo, DEV_DIR, "build-"));
  try {
    await run(process.execPath, [join(repo, "node_modules", "typescript", "bin", "tsc"), "-p", join(repo, "tsconfig.json"), "--outDir", out], { cwd: repo });
    return { ok: true, files: await readBuildBytes(out) };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || err.message };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/** The release for a local build, its `source` named by devSource from the repo's git state. */
export async function devRelease(repo: string, files: ReadonlyMap<string, Uint8Array>): Promise<LocalRelease> {
  const git = async (...args: string[]) => (await run("git", args, { cwd: repo })).stdout.trim();
  const head = await git("rev-parse", "HEAD");
  const dirty = (await git("status", "--porcelain", "--", "src", "tsconfig.json", "tsconfig.base.json")) !== "";
  return localRelease(files, devSource(head, dirty, localRelease(files, head).manifest.sha));
}

/** A LocalRelease that always answers from the latest build set into it, for a browser opened once. */
export function followingRelease(first: LocalRelease): LocalRelease & { set(next: LocalRelease): void } {
  let current = first;
  return {
    get manifest() {
      return current.manifest;
    },
    answer: (url) => current.answer(url),
    set(next) {
      current = next;
    },
  };
}

/**
 * Pushes `files` of `release` into the game on its current connection, only
 * what that connection doesn't already hold. Returns what it holds after.
 */
export async function push(api: RemoteApi, pushed: Pushed | null, files: ReadonlyMap<string, Uint8Array>, release: LocalRelease): Promise<{ pushed: Pushed; count: number }> {
  const plan = pushPlan(pushed, files, release.manifest);
  for (const f of plan.files) await api.pushFile(f.filename, f.content);
  return { pushed: plan.pushed, count: plan.files.length };
}

export interface Listener {
  /** Reads the state file once and captures a save if its milestone just changed. Never throws. */
  poll(): Promise<RunState | null>;
  stop(): void;
}

/**
 * The milestone-save listener: reads the state file over the Remote API every
 * `everyMs`, and when the milestone changes to a new one (milestoneToCapture)
 * takes the game's save with getSaveFile and stores it under `root`
 * (storeCapture: saves/, or lab-saves/ for a lab game). With `capture` false
 * it only reads, for callers that want the state.
 */
export function startListener(
  api: RemoteApi,
  root: string,
  opts: { everyMs?: number; capture?: boolean; log?: (line: string) => void; /** The state it knows before its first reading (a loaded save's). */ seen?: RunState } = {},
): Listener {
  const log = opts.log ?? console.log;
  let seen: RunState | null = opts.seen ?? null;
  let busy: Promise<RunState | null> | null = null;
  const once = async (): Promise<RunState | null> => {
    if (!api.isConnected()) return seen;
    let text: string;
    try {
      text = await api.getFile(STATE_FILE);
    } catch {
      return seen; // no run on this game yet
    }
    const r = parseState(text);
    if (!r.ok) return seen;
    const milestone = milestoneToCapture(seen, r.state);
    seen = r.state;
    if (milestone !== null && opts.capture !== false) {
      try {
        const where = await storeCapture(root, await api.getSaveFile(), new Date());
        log(`listener: captured ${where.milestone} → ${where.dir}/${where.base}.gz`);
      } catch (e) {
        log(`listener: could not capture ${milestone}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return seen;
  };
  const poll = () => (busy ??= once().finally(() => (busy = null)));
  const timer = setInterval(() => void poll(), opts.everyMs ?? 2_000);
  return { poll, stop: () => clearInterval(timer) };
}

/**
 * Loads `save` into a fresh session the way a player resumes: seed
 * IndexedDB, load the game, press Connect on the Remote API, and type the
 * start command once. Resolves when the command is typed.
 */
export async function resumeFromSave(session: GameSession, gameUrl: string, api: RemoteApi, save: Uint8Array): Promise<void> {
  await seedSave(session.page, gameUrl, save);
  await loadGame(session.page, gameUrl);
  const before = api.connections();
  await connectRemoteApi(session.page, api.port);
  if (!(await api.waitForGame(30_000, before))) throw new Error("the game did not connect to the Remote API after loading the save");
  await typeLine(session.page, START_COMMAND);
}
