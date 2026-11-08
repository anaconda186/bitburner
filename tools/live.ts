// npm run live [-- --port 12525] [--host 127.0.0.1] [--every 5] [--out runs] [--once | --export]
//
// The live split reader (#51): watches a run from outside the game. It is our
// end of the game's Remote API, so point the game's Options → Remote API at
// the host and port it prints and press Connect. It then reads sr/state.json
// every few seconds and prints the split table (tools/runs.ts) whenever the
// file changes.
//
// It is also the rollback watcher: every split it reads goes into a log in
// runs/watch/<startedAt>.json, kept across restarts of the reader, so a split
// that a page reload later takes away is marked as rolled back. When the run
// reaches the finish line, it is exported to runs/<date>-<category>-<build>.json
// with that log. `--export` exports the run as it stands now and exits;
// `--once` prints the table once and exits.
//
// `watchRun` is the reader without the CLI, for anything else that already
// runs a Remote API server (the game connects to one server at a time).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { runFinished } from "../src/sr/splits.ts";
import { parseState, STATE_FILE, type RunState } from "../src/sr/state.ts";
import { RemoteApiError, startRemoteApi, type RemoteApi } from "./harness/remote-api.ts";
import { exportName, exportText, liveTable, RUNS_DIR, watchState, type WatchLog } from "./runs.ts";

/** The port the game's Remote API page suggests. */
export const DEFAULT_PORT = 12525;

export interface LiveOptions {
  /** Where exports and watcher logs go (default runs/ at the repo root). */
  outDir: string;
  everyMs: number;
  /** Prints the table (a fresh screen on a terminal). */
  show(lines: string[]): void;
  log(line: string): void;
}

export interface LiveRun {
  /** Reads the state file once: the run as read, or null if it can't be read now. */
  poll(): Promise<{ state: RunState; watch: WatchLog } | null>;
  /** Writes the export of the last run read; its path, or null when nothing was read yet. */
  exportNow(): Promise<string | null>;
  stop(): void;
}

const watchPath = (outDir: string, startedAt: number) => join(outDir, "watch", `${startedAt}.json`);

async function loadLog(outDir: string, startedAt: number): Promise<WatchLog | null> {
  try {
    return JSON.parse(await readFile(watchPath(outDir, startedAt), "utf8")) as WatchLog;
  } catch {
    return null;
  }
}

/** Polls the run over `api` every `everyMs` (none when 0), keeping the watcher's log on disk. */
export function watchRun(api: RemoteApi, opts: LiveOptions): LiveRun {
  let log: WatchLog | null = null;
  let last: { state: RunState; watch: WatchLog } | null = null;
  let shown = "";
  let complaint = "";
  const exported = new Set<number>();
  const complain = (why: string) => {
    if (why !== complaint) opts.log(`live: ${why}`);
    complaint = why;
  };

  async function exportNow(): Promise<string | null> {
    if (last === null) return null;
    await mkdir(opts.outDir, { recursive: true });
    const path = join(opts.outDir, exportName(last.state));
    await writeFile(path, exportText(last.state, last.watch, Date.now()));
    return path;
  }

  async function poll() {
    if (!api.isConnected()) {
      complain("waiting for the game to connect");
      return null;
    }
    let text: string;
    try {
      text = await api.getFile(STATE_FILE);
    } catch (e) {
      complain(e instanceof RemoteApiError ? `no ${STATE_FILE} on home yet` : String((e as Error).message));
      return null;
    }
    const parsed = parseState(text);
    if (!parsed.ok) {
      complain(parsed.error);
      return null;
    }
    complaint = "";
    const state = parsed.state;
    if (log === null || log.startedAt !== state.startedAt) log = await loadLog(opts.outDir, state.startedAt);
    log = watchState(log, state, Date.now());
    await mkdir(join(opts.outDir, "watch"), { recursive: true });
    await writeFile(watchPath(opts.outDir, state.startedAt), JSON.stringify(log) + "\n");
    last = { state, watch: log };

    const table = liveTable(state, Date.now(), log);
    const key = JSON.stringify([text, log.seen]);
    if (key !== shown) opts.show(table);
    shown = key;
    if (runFinished(state) && !exported.has(state.startedAt)) {
      exported.add(state.startedAt);
      opts.log(`live: finish line; exported to ${await exportNow()}`);
    }
    return last;
  }

  let busy = false;
  const timer =
    opts.everyMs > 0
      ? setInterval(() => {
          if (busy) return;
          busy = true;
          poll()
            .catch((e: unknown) => complain(String((e as Error).message)))
            .finally(() => (busy = false));
        }, opts.everyMs)
      : null;
  return { poll, exportNow, stop: () => timer !== null && clearInterval(timer) };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: String(DEFAULT_PORT) },
      every: { type: "string", default: "5" },
      out: { type: "string", default: resolve(import.meta.dirname, "..", RUNS_DIR) },
      once: { type: "boolean", default: false },
      export: { type: "boolean", default: false },
    },
  });
  const api = await startRemoteApi(values.host, Number(values.port));
  console.log(`live: in the game, set Options → Remote API to ${values.host} port ${api.port}, then press Connect`);
  const tty = process.stdout.isTTY;
  const opts: LiveOptions = {
    outDir: resolve(values.out),
    everyMs: values.once || values.export ? 0 : Number(values.every) * 1000,
    show: (lines) => console.log((tty ? "\x1b[2J\x1b[H" : "\n") + lines.join("\n")),
    log: (line) => console.log(line),
  };
  const live = watchRun(api, opts);
  if (values.once || values.export) {
    let run = null;
    while (run === null) {
      await api.waitForGame(24 * 3600_000, 0);
      run = await live.poll();
      if (run === null) await new Promise((ok) => setTimeout(ok, 2000));
    }
    if (values.export) console.log(`live: exported to ${await live.exportNow()}`);
    await api.close();
  } else {
    process.on("SIGINT", () => {
      live.stop();
      void api.close().then(() => process.exit(0));
    });
  }
}
