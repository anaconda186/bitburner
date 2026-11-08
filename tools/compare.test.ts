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

describe("a milestone one run skipped", () => {
  const a = run({ splits: [{ name: "x", min: 10 }, { name: "y", min: 20 }, { name: "z", min: 30 }] });
  const b = run({ splits: [{ name: "x", min: 12 }, { name: "v", min: 18 }, { name: "z", min: 25 }, { name: "w", min: 40 }] });
  const byName = () => new Map(rowsOf(a, b).map((r) => [r.milestone, r]));

  test("is a row with a gap on that side and no delta, not a zero", () => {
    const y = byName().get("y");
    expect(y?.a.split).toEqual({ grossMs: 20 * MIN, netMs: 20 * MIN });
    expect(y?.b).toMatchObject({ split: null, segment: null });
    expect(y?.split).toBeNull();
    expect(y?.segment).toBeNull();
    expect(byName().get("v")?.a).toMatchObject({ split: null, segment: null });
    expect(byName().get("w")?.a).toMatchObject({ split: null, segment: null });
  });

  test("keeps each run's order, with milestones only one run has in place", () => {
    const names = rowsOf(a, b).map((r) => r.milestone);
    expect(names[0]).toBe("x");
    expect(names.slice(1, 3).sort()).toEqual(["v", "y"]);
    expect(names.slice(3)).toEqual(["z", "w"]);
  });

  test("leaves the next segment running from the last milestone both reached", () => {
    const z = byName().get("z");
    expect(z?.a.segment?.netMs).toBe(20 * MIN);
    expect(z?.b.segment?.netMs).toBe(13 * MIN);
    expect(z?.segment?.netMs).toBe(-7 * MIN);
  });
});

describe("builds", () => {
  const three = [{ name: "x", min: 20 }, { name: "y", min: 40 }, { name: "z", min: 60 }];
  const a = run({ splits: three });
  // B switched from A's build to its own at minute 30, inside the segment to y.
  const b = run({ splits: three, builds: [{ sha: SHA_B, atMin: 30 }] });

  test("flags the segments where the two runs ran different builds", () => {
    expect(rowsOf(a, b).map((r) => [r.milestone, r.buildsDiffer])).toEqual([
      ["x", false],
      ["y", true],
      ["z", true],
    ]);
  });

  test("names every build that ran in a segment", () => {
    const [x, y, z] = rowsOf(a, b);
    expect(x?.b.builds).toEqual([SHA_A]);
    expect(y?.b.builds).toEqual([SHA_A, SHA_B]);
    expect(z?.b.builds).toEqual([SHA_B]);
    expect(z?.a.builds).toEqual([SHA_A]);
  });

  test("never flags two runs of one build", () => {
    expect(rowsOf(a, a).some((r) => r.buildsDiffer)).toBe(false);
  });
});
