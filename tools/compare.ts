// npm run compare -- <a.json> <b.json>
//
// Judges one build against another from two exported runs (seam E).
import { splitTime, type Split, type Times } from "../src/sr/state.ts";
import type { RunRecord } from "./runs.ts";

/** One run's side of a row. */
export type Side = {
  /** The split, or null where this run never reached the milestone: a gap. */
  readonly split: Times | null;
  /** The time since the previous milestone both runs reached (or the start). */
  readonly segment: Times | null;
};

/** One milestone of the comparison. Deltas are B minus A: positive means B was slower. */
export type Row = {
  readonly milestone: string;
  readonly a: Side;
  readonly b: Side;
  readonly split: Times | null;
  readonly segment: Times | null;
};

export type Report = { readonly rows: readonly Row[] };

export type CompareResult = { ok: true; report: Report } | { ok: false; error: string };

const minus = (x: Times, y: Times): Times => ({ grossMs: x.grossMs - y.grossMs, netMs: x.netMs - y.netMs });
const ZERO: Times = { grossMs: 0, netMs: 0 };

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
  for (const name of splitsA.map((s) => s.milestone)) {
    const sa = splitsA.find((s) => s.milestone === name);
    const sb = splitsB.find((s) => s.milestone === name);
    const ta = sa ? splitTime(sa) : null;
    const tb = sb ? splitTime(sb) : null;
    const side = (t: Times | null, from: Times): Side => ({ split: t, segment: t ? minus(t, from) : null });
    const rowA = side(ta, prev.a);
    const rowB = side(tb, prev.b);
    rows.push({
      milestone: name,
      a: rowA,
      b: rowB,
      split: ta && tb ? minus(tb, ta) : null,
      segment: rowA.segment && rowB.segment ? minus(rowB.segment, rowA.segment) : null,
    });
    if (ta && tb) prev = { a: ta, b: tb };
  }
  return { ok: true, report: { rows } };
}
