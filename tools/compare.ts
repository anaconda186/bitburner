// npm run compare -- <a.json> <b.json> [--gross | --both]
//
// Judges one build against another from two exported runs (seam E). It
// refuses runs of different categories. For each milestone it shows both
// splits, the delta B − A, and the same for the segment (the time since the
// previous milestone both runs reached), in net times unless asked for gross.
// A milestone one run didn't reach is a gap, never a zero. Segments where the
// two runs ran different builds are flagged. A run exported with the rollback
// watcher attached marks the milestones it saw rolled back; one without says
// "rollbacks unobserved".
import { formatDuration } from "../src/sr/splits.ts";
import { splitTime, type BuildRecord, type RunState, type Split, type Times } from "../src/sr/state.ts";
import { rolledBack, watchedMs, type RunRecord, type Seen } from "./runs.ts";

/** One run's side of a row. */
export type Side = {
  /** The split, or null where this run never reached the milestone (or lost it): a gap. */
  readonly split: Times | null;
  /** The time since the previous milestone both runs reached (or the start). */
  readonly segment: Times | null;
  /** Every build that ran in the segment, in order (none for a gap). */
  readonly builds: readonly string[];
  /** How many times the watcher saw this milestone reached and then rolled back. */
  readonly rolledBack: number;
};

/** One milestone of the comparison. Deltas are B minus A: positive means B was slower. */
export type Row = {
  readonly milestone: string;
  readonly a: Side;
  readonly b: Side;
  readonly split: Times | null;
  readonly segment: Times | null;
  /** Both runs reached it, and the builds that ran its segment differ. */
  readonly buildsDiffer: boolean;
};

/** What the rollback watcher saw of a run, or null when none was attached. */
export type Rollbacks = { readonly seen: readonly Seen[]; readonly watchedMs: number; readonly runMs: number } | null;

/** One run as a whole. */
export type RunSummary = {
  readonly category: string;
  /** The build that started the run, then every build change. */
  readonly builds: readonly string[];
  readonly rollbacks: Rollbacks;
};

export type Report = { readonly a: RunSummary; readonly b: RunSummary; readonly rows: readonly Row[] };

export type CompareResult = { ok: true; report: Report } | { ok: false; error: string };

const minus = (x: Times, y: Times): Times => ({ grossMs: x.grossMs - y.grossMs, netMs: x.netMs - y.netMs });
const ZERO: Times = { grossMs: 0, netMs: 0 };
const splitsOf = (state: RunState) => state.splits as readonly Split[];

export function compare(a: RunRecord, b: RunRecord): CompareResult {
  if (a.state.category !== b.state.category) {
    return {
      ok: false,
      error: `compare: A is category ${a.state.category} and B is ${b.state.category}; runs compare only within one category`,
    };
  }
  const rows: Row[] = [];
  let prev = { a: ZERO, b: ZERO };
  for (const name of mergeOrder(milestoneOrder(a), milestoneOrder(b))) {
    const sideA = side(a, name, prev.a);
    const sideB = side(b, name, prev.b);
    rows.push({
      milestone: name,
      a: sideA,
      b: sideB,
      split: sideA.split && sideB.split ? minus(sideB.split, sideA.split) : null,
      segment: sideA.segment && sideB.segment ? minus(sideB.segment, sideA.segment) : null,
      buildsDiffer: sideA.split !== null && sideB.split !== null && sideA.builds.join() !== sideB.builds.join(),
    });
    if (sideA.split && sideB.split) prev = { a: sideA.split, b: sideB.split };
  }
  return { ok: true, report: { a: summary(a), b: summary(b), rows } };
}

/** A run's milestones in the order it reached them, those the watcher saw rolled back included. */
function milestoneOrder(run: RunRecord): string[] {
  const lost = run.watch ? rolledBack(run.watch, run.state) : [];
  const all = [...splitsOf(run.state), ...lost].sort((x, y) => x.ms - y.ms);
  return [...new Set(all.map((s) => s.milestone))];
}

/**
 * Both runs' milestones in one order: A's, with each milestone only B reached
 * placed right after the one B reached before it.
 */
function mergeOrder(a: readonly string[], b: readonly string[]): string[] {
  const order = [...a];
  let after = -1;
  for (const name of b) {
    const at = order.indexOf(name);
    if (at >= 0) after = at;
    else order.splice(++after, 0, name);
  }
  return order;
}

/** One run's side of the row for milestone `name`, its segment running from `from`. */
function side(run: RunRecord, name: string, from: Times): Side {
  const rolled = run.watch ? rolledBack(run.watch, run.state).filter((s) => s.milestone === name).length : 0;
  const split = splitsOf(run.state).find((s) => s.milestone === name);
  if (split === undefined) return { split: null, segment: null, builds: [], rolledBack: rolled };
  const t = splitTime(split);
  return {
    split: t,
    segment: minus(t, from),
    builds: buildsBetween(run.state, from.grossMs, t.grossMs),
    rolledBack: rolled,
  };
}

/** Every build that ran between two gross times of a run, in the order they ran. */
function buildsBetween(state: RunState, fromMs: number, toMs: number): string[] {
  const changes = state.builds as readonly BuildRecord[];
  const start = state.startedAt + fromMs;
  const end = state.startedAt + toMs;
  const running = changes.filter((c) => c.fromMs <= start).at(-1)?.sha ?? state.buildSha;
  const later = changes.filter((c) => c.fromMs > start && c.fromMs <= end).map((c) => c.sha);
  return [...new Set([running, ...later])];
}

function summary(run: RunRecord): RunSummary {
  const { state, watch } = run;
  const builds = [state.buildSha, ...(state.builds as readonly BuildRecord[]).map((c) => c.sha)];
  const rollbacks: Rollbacks = watch
    ? { seen: rolledBack(watch, state), watchedMs: watchedMs(watch), runMs: state.updatedAt - state.startedAt }
    : null;
  return { category: state.category, builds, rollbacks };
}

/** Which times the report shows. */
export type Columns = "net" | "gross" | "both";

export type RenderOptions = {
  readonly columns?: Columns;
  /** How to name the two runs in the header, such as their file names. */
  readonly labels?: { readonly a: string; readonly b: string };
};

const short = (sha: string) => sha.slice(0, 7);
const signed = (ms: number) => (ms < 0 ? "-" : "+") + formatDuration(Math.abs(ms));

/** The words for what the watcher saw of a run. Never "none" unless it was attached. */
export function rollbackText(r: Rollbacks): string {
  if (r === null) return "rollbacks unobserved";
  const watched = `watched ${formatDuration(r.watchedMs)} of ${formatDuration(r.runMs)}`;
  if (r.seen.length === 0) return `rollbacks: none seen, ${watched}`;
  return `rollbacks: ${r.seen.length} (${r.seen.map((s) => s.milestone).join(", ")}), ${watched}`;
}

/** The report as lines of text: a header, then one table line per milestone. */
export function renderCompare(report: Report, opts: RenderOptions = {}): string[] {
  const columns = opts.columns ?? "net";
  const kinds: ("netMs" | "grossMs")[] = columns === "both" ? ["netMs", "grossMs"] : [columns === "net" ? "netMs" : "grossMs"];
  const label = opts.labels ?? { a: "A", b: "B" };
  const header = [
    `compare (${report.a.category}): A = ${label.a} on ${report.a.builds.map(short).join(" > ")}; ` +
      `B = ${label.b} on ${report.b.builds.map(short).join(" > ")}`,
    `${columns === "both" ? "net, then gross" : columns} times; delta = B - A, + means B was slower`,
    `A ${rollbackText(report.a.rollbacks)}`,
    `B ${rollbackText(report.b.rollbacks)}`,
  ];
  const cell = (s: Side, t: Times | null, k: "netMs" | "grossMs") =>
    t !== null ? formatDuration(t[k]) : s.split === null && s.rolledBack > 0 ? "rolled back" : "gap";
  const delta = (t: Times | null, k: "netMs" | "grossMs") => (t === null ? "-" : signed(t[k]));
  const titles = ["milestone"];
  for (const k of kinds) {
    const w = columns === "both" ? (k === "netMs" ? " net" : " gross") : "";
    titles.push(`A${w}`, `B${w}`, `delta${w}`, `A seg${w}`, `B seg${w}`, `seg delta${w}`);
  }
  titles.push("notes");
  const table = report.rows.map((r) => {
    const line = [r.milestone];
    for (const k of kinds) {
      line.push(cell(r.a, r.a.split, k), cell(r.b, r.b.split, k), delta(r.split, k));
      line.push(cell(r.a, r.a.segment, k), cell(r.b, r.b.segment, k), delta(r.segment, k));
    }
    const notes: string[] = [];
    if (r.buildsDiffer) notes.push("builds differ");
    if (r.a.rolledBack > 0) notes.push("rolled back in A");
    if (r.b.rolledBack > 0) notes.push("rolled back in B");
    line.push(notes.join(", "));
    return line;
  });
  const flagged = report.rows.filter((r) => r.buildsDiffer).length;
  const footer = [`builds differ in ${flagged} of ${report.rows.length} segments`];
  return [...header, "", ...pad([titles, ...table]), "", ...footer];
}

/** Lays rows of cells out in columns, two spaces apart. */
function pad(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const r of rows) r.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, c.length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd());
}
