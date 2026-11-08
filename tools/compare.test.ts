// `compare` over two exported runs (seam E): two run records in, a report out.
import { describe, expect, test } from "vitest";
import { compare } from "./compare.ts";
import type { RunRecord } from "./runs.ts";
import type { RunState } from "../src/sr/state.ts";

const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
const MIN = 60_000;
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const UNKNOWN = { hack: null, money: null, M: null, homeRam: null, sleeves: null };

type SplitSpec = { name: string; min: number; lostMin?: number };

/** A finished run's record: its splits at whole minutes since the start, on one build unless `builds` says otherwise. */
function run(opts: {
  category?: string;
  build?: string;
  splits: SplitSpec[];
  builds?: { sha: string; atMin: number }[];
  watch?: RunRecord["watch"];
}): RunRecord {
  const build = opts.build ?? SHA_A;
  const builds = (opts.builds ?? []).map((b) => ({ sha: b.sha, fromMs: T0 + b.atMin * MIN }));
  const buildAt = (ms: number) => builds.filter((b) => b.fromMs <= T0 + ms).at(-1)?.sha ?? build;
  const splits = opts.splits.map((s) => ({
    milestone: s.name,
    ms: s.min * MIN,
    build: buildAt(s.min * MIN),
    lostMs: (s.lostMin ?? 0) * MIN,
    installs: 0,
    stats: UNKNOWN,
  }));
  const last = opts.splits.at(-1);
  const state: RunState = {
    v: 1,
    category: opts.category ?? "open",
    startedAt: T0,
    buildSha: build,
    updatedAt: T0 + (last?.min ?? 0) * MIN,
    milestone: last?.name ?? null,
    splits,
    reloads: [],
    builds,
    installs: 0,
    resetAt: T0,
  };
  return { state, watch: opts.watch ?? null };
}

describe("compare", () => {
  test("refuses two runs of different categories", () => {
    const a = run({ category: "open", splits: [{ name: "bn1.1", min: 60 }] });
    const b = run({ category: "strict", splits: [{ name: "bn1.1", min: 50 }] });
    const r = compare(a, b);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/open.*strict/);
  });
});

/** The report's rows, failing the test if compare refused. */
function rowsOf(a: RunRecord, b: RunRecord) {
  const r = compare(a, b);
  if (!r.ok) throw new Error(r.error);
  return r.report.rows;
}

describe("split and segment deltas", () => {
  // A lost 10 min to a reload before bn1.1; B lost 30 min between bn1.1 and bn2.1.
  const a = run({ splits: [{ name: "bn1.1", min: 60, lostMin: 10 }, { name: "bn2.1", min: 120, lostMin: 10 }] });
  const b = run({ splits: [{ name: "bn1.1", min: 50 }, { name: "bn2.1", min: 130, lostMin: 30 }] });

  test("each milestone's split and segment, gross and net, B minus A", () => {
    expect(rowsOf(a, b).map((r) => [r.milestone, r.split, r.segment])).toEqual([
      ["bn1.1", { grossMs: -10 * MIN, netMs: 0 }, { grossMs: -10 * MIN, netMs: 0 }],
      ["bn2.1", { grossMs: 10 * MIN, netMs: -10 * MIN }, { grossMs: 20 * MIN, netMs: -10 * MIN }],
    ]);
  });

  test("each side keeps its own split and segment times", () => {
    const [, second] = rowsOf(a, b);
    expect(second?.a.split).toEqual({ grossMs: 120 * MIN, netMs: 110 * MIN });
    expect(second?.a.segment).toEqual({ grossMs: 60 * MIN, netMs: 60 * MIN });
    expect(second?.b.segment).toEqual({ grossMs: 80 * MIN, netMs: 50 * MIN });
  });
});
