import { describe, expect, test } from "vitest";
import type { Snapshot } from "./decide.ts";
import { SPINE } from "./milestones.ts";
import { finishSummary, formatDuration, runFinished, splitLine, splitStats } from "./splits.ts";
import { accountStart, recordMilestone, type RunState } from "./state.ts";

const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
const UNKNOWN = { hack: null, money: null, M: null, homeRam: null, sleeves: null };
const START: RunState = {
  v: 1, category: "open", startedAt: T0, buildSha: "a".repeat(40), updatedAt: T0,
  milestone: null, splits: [], reloads: [], builds: [], installs: 0, resetAt: null,
};
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("formatDuration", () => {
  test.each([
    [0, "0:00:00"],
    [59_999, "0:00:59"],
    [61 * MIN + 5000, "1:01:05"],
    [23 * HOUR + 59 * MIN, "23:59:00"],
    [3 * 24 * HOUR + 2 * HOUR + 3 * MIN + 4000, "3d 2:03:04"],
  ])("%d ms is %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("the split line", () => {
  test("names the milestone, the time since the start and the delta from the previous split", () => {
    const one = recordMilestone(START, "bn1.1:casino", T0 + 4 * MIN, UNKNOWN);
    expect(splitLine(one)).toBe("conductor: split bn1.1:casino 0:04:00 (+0:04:00)");
    const two = recordMilestone(one, "bn1.1", T0 + 3 * HOUR, UNKNOWN);
    expect(splitLine(two)).toBe("conductor: split bn1.1 3:00:00 (+2:56:00)");
  });

  test("adds the net time once the run has lost time to reloads", () => {
    const reloaded = accountStart(
      { ...START, resetAt: T0 },
      { atMs: T0 + 30 * MIN, savedUpdatedAt: T0 + 28 * MIN },
      { lastAugReset: T0, lastNodeReset: T0 },
    );
    const split = recordMilestone(reloaded, "bn1.1", T0 + HOUR, UNKNOWN);
    expect(splitLine(split)).toBe("conductor: split bn1.1 1:00:00 (+1:00:00), net 0:58:00");
  });
});

describe("the finish line", () => {
  const allSpine = (state: RunState) =>
    SPINE.reduce((s, m, i) => recordMilestone(s, m.name, T0 + (i + 1) * HOUR, UNKNOWN), state);

  test("is reached once every spine milestone is recorded", () => {
    expect(runFinished(START)).toBe(false);
    const most = SPINE.slice(0, -1).reduce((s, m) => recordMilestone(s, m.name, T0 + 1, UNKNOWN), START);
    expect(runFinished(most)).toBe(false);
    expect(runFinished(allSpine(START))).toBe(true);
  });

  test("prints a summary: gross and net, reload loss, installs, builds", () => {
    let state: RunState = { ...START, resetAt: T0, installs: 12, builds: [{ sha: "b".repeat(40), fromMs: T0 + HOUR }] };
    state = accountStart(state, { atMs: T0 + 2 * HOUR, savedUpdatedAt: T0 + 2 * HOUR - 90_000 }, { lastAugReset: T0, lastNodeReset: T0 });
    state = accountStart(state, { atMs: T0 + 3 * HOUR, savedUpdatedAt: T0 + 3 * HOUR - 30_000 }, { lastAugReset: T0, lastNodeReset: T0 });
    expect(finishSummary(allSpine(state))).toEqual([
      "conductor: finish line in 1d 21:00:00 (net 1d 20:58:00)",
      "conductor: 45 milestones, 2 reloads losing 0:02:00, 12 installs, 2 builds",
    ]);
  });
});

describe("a split's stats come from the probes", () => {
  const snap = (probes: Snapshot["probes"]): Snapshot => ({
    nowMs: T0, freeRamGb: { home: 4 }, helperRamGb: {}, probes, probesInFlight: [], callRunning: false, workers: {}, controls: {},
  });
  const route = (currentNode: number, ownedSF: Record<number, number> = {}) =>
    ({ ok: true, value: { currentNode, ownedSF, lastAugReset: T0, lastNodeReset: T0 }, atMs: T0 }) as const;
  const stats = { ok: true, value: { hack: 812, money: 3.2e9, M: 2.41, homeRam: 512 }, atMs: T0 } as const;

  test("unknown before any probe has read the game", () => {
    expect(splitStats(snap({}))).toEqual(UNKNOWN);
  });

  test("the stats probe gives hacking, money, M and home RAM; no sleeves without SF10 outside BN10", () => {
    expect(splitStats(snap({ route: route(1), stats }))).toEqual({ hack: 812, money: 3.2e9, M: 2.41, homeRam: 512, sleeves: 0 });
  });

  test("with sleeves possible, the count is the sleeves probe's, or unknown until it reads", () => {
    expect(splitStats(snap({ route: route(10), stats })).sleeves).toBeNull();
    const sleeves = { ok: true, value: { count: 3 }, atMs: T0 } as const;
    expect(splitStats(snap({ route: route(10), stats, sleeves })).sleeves).toBe(3);
    expect(splitStats(snap({ route: route(2, { 10: 1 }), stats, sleeves })).sleeves).toBe(3);
  });

  test("a failed reading counts as unknown", () => {
    const failed = { ok: false, error: "boom", atMs: T0 } as const;
    expect(splitStats(snap({ route: failed, stats: failed }))).toEqual(UNKNOWN);
  });
});
