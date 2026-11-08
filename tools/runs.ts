// Run records out of the game (seam E): what the live reader exports to
// `runs/`, and the rollback watcher's log. Pure: no files, no sockets here.
import type { RunState, Split } from "../src/sr/state.ts";

/** A split the watcher saw in the state file. `ms` (gross) tells two reaches of one milestone apart. */
export type Seen = { readonly milestone: string; readonly ms: number };

/** A stretch of wall-clock time the watcher was reading the state file. */
export type Window = { readonly fromMs: number; readonly toMs: number };

/**
 * What the rollback watcher saw of one run (the run is its `startedAt`): every
 * split it ever read, and when it was watching. A page reload rolls the state
 * file back to the last save, so a split it saw can later be gone.
 */
export type WatchLog = {
  readonly startedAt: number;
  readonly windows: readonly Window[];
  readonly seen: readonly Seen[];
};

/** One run as `compare` reads it: its state file, and the watcher's log if one was attached. */
export type RunRecord = { readonly state: RunState; readonly watch: WatchLog | null };

/**
 * Two reads further apart than this are two watching windows: whatever
 * happened between them went unwatched. The reader polls every few seconds; a
 * page reload's reconnect takes well under this.
 */
export const WATCH_GAP_MS = 60_000;

const splitsOf = (state: RunState) => state.splits as readonly Split[];

/**
 * The log once the watcher has read `state` at `nowMs`. A state from another
 * run (a different `startedAt`) starts a new log.
 */
export function watchState(log: WatchLog | null, state: RunState, nowMs: number): WatchLog {
  const current = log !== null && log.startedAt === state.startedAt ? log : null;
  const windows = [...(current?.windows ?? [])];
  const last = windows.at(-1);
  if (last !== undefined && nowMs - last.toMs <= WATCH_GAP_MS) windows[windows.length - 1] = { fromMs: last.fromMs, toMs: nowMs };
  else windows.push({ fromMs: nowMs, toMs: nowMs });
  const seen = [...(current?.seen ?? [])];
  for (const s of splitsOf(state)) {
    if (!seen.some((x) => x.milestone === s.milestone && x.ms === s.ms)) seen.push({ milestone: s.milestone, ms: s.ms });
  }
  return { startedAt: state.startedAt, windows, seen };
}

/**
 * The splits the watcher saw that `state` no longer has: each was rolled back
 * by a page reload, whether or not the run reached that milestone again later.
 */
export function rolledBack(log: WatchLog, state: RunState): Seen[] {
  if (log.startedAt !== state.startedAt) return [];
  const kept = splitsOf(state);
  return log.seen.filter((x) => !kept.some((s) => s.milestone === x.milestone && s.ms === x.ms));
}

/** How long the watcher was reading the state file. */
export function watchedMs(log: WatchLog): number {
  return log.windows.reduce((sum, w) => sum + (w.toMs - w.fromMs), 0);
}
