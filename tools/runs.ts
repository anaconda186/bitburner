// Run records out of the game (seam E): what the live reader exports to
// `runs/`, and the rollback watcher's log. Pure: no files, no sockets here.
import { formatDuration } from "../src/sr/splits.ts";
import { lostMs, parseState, runTime, splitTime, type RunState, type Split } from "../src/sr/state.ts";

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

/** The gitignored folder finished runs are exported to, at the repo root. */
export const RUNS_DIR = "runs";

/** The newest export format this build writes and reads. */
export const EXPORT_FORMAT = 1;

/**
 * `<date>-<category>-<build>.json`: the run's start as a UTC date and time
 * (`2026-11-07T153012Z`, so two runs of one build on one day don't collide and
 * the names sort by start), its category and the first 7 characters of the
 * build that started it.
 */
export function exportName(state: RunState): string {
  const date = new Date(state.startedAt).toISOString().replace(/\.\d+Z$/, "Z").replaceAll(":", "");
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${date}-${safe(state.category)}-${safe(state.buildSha.slice(0, 7))}.json`;
}

/** An export's text: the state file as read, and the watcher's log (null when none was attached). */
export function exportText(state: RunState, watch: WatchLog | null, nowMs: number): string {
  return JSON.stringify({ export: EXPORT_FORMAT, exportedAt: nowMs, state, watch }, null, 2) + "\n";
}

export type RunResult = { ok: true; run: RunRecord } | { ok: false; error: string };

const isLog = (x: unknown): x is WatchLog => {
  const l = x as Partial<WatchLog> | null;
  return typeof l?.startedAt === "number" && Array.isArray(l.windows) && Array.isArray(l.seen);
};

/**
 * Reads an export, or a state file copied out of the game by hand (which is
 * an unwatched run). A log from another run than the state's is dropped.
 */
export function parseRun(text: string): RunResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "run file is not JSON" };
  }
  const wrapper = raw as { export?: unknown; state?: unknown; watch?: unknown } | null;
  const wrapped = typeof wrapper === "object" && wrapper !== null && "export" in wrapper;
  if (wrapped && (typeof wrapper.export !== "number" || wrapper.export > EXPORT_FORMAT)) {
    return { ok: false, error: `run file is export format ${String(wrapper.export)}, newer than this build's ${EXPORT_FORMAT}` };
  }
  const parsed = parseState(JSON.stringify(wrapped ? wrapper.state : raw));
  if (!parsed.ok) return { ok: false, error: `run file: ${parsed.error}` };
  const watch = wrapped && wrapper.watch != null ? wrapper.watch : null;
  if (watch !== null && !isLog(watch)) return { ok: false, error: "run file has a watcher log it can't read" };
  const log = watch !== null && watch.startedAt === parsed.state.startedAt ? watch : null;
  return { ok: true, run: { state: parsed.state, watch: log } };
}

/** How long the watcher was reading the state file. */
export function watchedMs(log: WatchLog): number {
  return log.windows.reduce((sum, w) => sum + (w.toMs - w.fromMs), 0);
}

/** What the rollback watcher saw of a run, or null when none was attached. */
export type Rollbacks = { readonly seen: readonly Seen[]; readonly watchedMs: number; readonly runMs: number } | null;

/** The words for what the watcher saw of a run. Never "none" unless it was attached. */
export function rollbackText(r: Rollbacks): string {
  if (r === null) return "rollbacks unobserved";
  const watched = `watched ${formatDuration(r.watchedMs)} of ${formatDuration(r.runMs)}`;
  if (r.seen.length === 0) return `rollbacks: none seen, ${watched}`;
  return `rollbacks: ${r.seen.length} (${r.seen.map((s) => s.milestone).join(", ")}), ${watched}`;
}

const short = (sha: string) => sha.slice(0, 7);
const known = (x: number | null, f: (n: number) => string = String) => (x === null ? "?" : f(x));
const money = (n: number) => (Math.abs(n) >= 1e6 ? n.toExponential(2).replace("e+", "e") : String(Math.floor(n)));

/**
 * The live reader's table for the state file as read at `nowMs`: the run so
 * far, one line per split (gross, net, the net segment since the previous
 * split, the build, installs and stats), the splits the watcher saw rolled
 * back, and what it saw of rollbacks.
 */
export function liveTable(state: RunState, nowMs: number, watch: WatchLog | null): string[] {
  const time = runTime(state, nowMs);
  const started = new Date(state.startedAt).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  const head = [
    `run ${state.category}, started ${started} on ${[state.buildSha, ...buildChanges(state)].map(short).join(" > ")}`,
    `${formatDuration(time.grossMs)} gross, ${formatDuration(time.netMs)} net; ` +
      `${state.reloads.length} reloads losing ${formatDuration(lostMs(state))}; ${state.installs} installs`,
  ];
  const lost = watch ? rolledBack(watch, state) : [];
  const entries = [...splitsOf(state).map((s) => ({ s, lost: false })), ...lost.map((s) => ({ s, lost: true }))];
  entries.sort((x, y) => x.s.ms - y.s.ms);
  const rows: string[][] = [["milestone", "gross", "net", "segment", "build", "installs", "hack", "money", "M", "home", "sleeves"]];
  let prevNet = 0;
  for (const { s, lost: gone } of entries) {
    if (gone) {
      rows.push([s.milestone, formatDuration(s.ms), "rolled back"]);
      continue;
    }
    const split = s as Split;
    const { grossMs, netMs } = splitTime(split);
    const st = split.stats;
    rows.push([
      split.milestone,
      formatDuration(grossMs),
      formatDuration(netMs),
      "+" + formatDuration(netMs - prevNet),
      short(split.build),
      String(split.installs),
      known(st.hack),
      known(st.money, money),
      known(st.M, (m) => m.toFixed(2)),
      known(st.homeRam),
      known(st.sleeves),
    ]);
    prevNet = netMs;
  }
  const body = entries.length === 0 ? ["no milestone yet"] : layOut(rows);
  const rollbacks: Rollbacks = watch ? { seen: lost, watchedMs: watchedMs(watch), runMs: time.grossMs } : null;
  return [...head, "", ...body, "", rollbackText(rollbacks)];
}

const buildChanges = (state: RunState) =>
  (state.builds as readonly { sha?: unknown }[]).flatMap((b) => (typeof b?.sha === "string" ? [b.sha] : []));

/** Lays rows of cells out in columns, two spaces apart. */
export function layOut(rows: readonly (readonly string[])[]): string[] {
  const widths: number[] = [];
  for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, c.length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd());
}
