// npm run compare -- <a.json> <b.json>
//
// Judges one build against another from two exported runs (seam E).
import { splitTime, type BuildRecord, type RunState, type Split, type Times } from "../src/sr/state.ts";
import type { RunRecord } from "./runs.ts";

/** One run's side of a row. */
export type Side = {
  /** The split, or null where this run never reached the milestone: a gap. */
  readonly split: Times | null;
  /** The time since the previous milestone both runs reached (or the start). */
  readonly segment: Times | null;
  /** Every build that ran in the segment, in order (none for a gap). */
  readonly builds: readonly string[];
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

export type Report = { readonly rows: readonly Row[] };

export type CompareResult = { ok: true; report: Report } | { ok: false; error: string };

const minus = (x: Times, y: Times): Times => ({ grossMs: x.grossMs - y.grossMs, netMs: x.netMs - y.netMs });
const ZERO: Times = { grossMs: 0, netMs: 0 };

/**
 * Both runs' milestones in one order: A's, with each milestone only B reached
 * placed right after the one B reached before it.
 */
function mergeOrder(a: readonly string[], b: readonly string[]): string[] {
  const order = [...new Set(a)];
  let after = -1;
  for (const name of b) {
    const at = order.indexOf(name);
    if (at >= 0) after = at;
    else order.splice(++after, 0, name);
  }
  return order;
}

export function compare(a: RunRecord, b: RunRecord): CompareResult {
  if (a.state.category !== b.state.category) {
    return {
      ok: false,
      error: `compare: A is category ${a.state.category} and B is ${b.state.category}; runs compare only within one category`,
    };
  }
  const splitsA = a.state.splits as readonly Split[];
  const splitsB = b.state.splits as readonly Split[];
  const rows: Row[] = [];
  let prev = { a: ZERO, b: ZERO };
  for (const name of mergeOrder(splitsA.map((s) => s.milestone), splitsB.map((s) => s.milestone))) {
    const sideA = side(a, name, prev.a);
    const sideB = side(b, name, prev.b);
    const both = sideA.split !== null && sideB.split !== null;
    rows.push({
      milestone: name,
      a: sideA,
      b: sideB,
      split: sideA.split && sideB.split ? minus(sideB.split, sideA.split) : null,
      segment: sideA.segment && sideB.segment ? minus(sideB.segment, sideA.segment) : null,
      buildsDiffer: both && sideA.builds.join() !== sideB.builds.join(),
    });
    if (sideA.split && sideB.split) prev = { a: sideA.split, b: sideB.split };
  }
  return { ok: true, report: { rows } };
}

/** One run's side of the row for milestone `name`, its segment running from `from`. */
function side(run: RunRecord, name: string, from: Times): Side {
  const split = (run.state.splits as readonly Split[]).find((s) => s.milestone === name);
  if (split === undefined) return { split: null, segment: null, builds: [] };
  const t = splitTime(split);
  return { split: t, segment: minus(t, from), builds: buildsBetween(run.state, from.grossMs, t.grossMs) };
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
