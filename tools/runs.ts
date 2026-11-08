// Run records out of the game (seam E): what the live reader exports to
// `runs/`, and the rollback watcher's log. Pure: no files, no sockets here.
import type { RunState } from "../src/sr/state.ts";

/** What the rollback watcher saw of one run. */
export type WatchLog = { readonly startedAt: number };

/** One run as `compare` reads it: its state file, and the watcher's log if one was attached. */
export type RunRecord = { readonly state: RunState; readonly watch: WatchLog | null };
