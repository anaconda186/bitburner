// Run records out of the game (seam E): state files in, the watcher's log,
// exports and the live table out.
import { describe, expect, test } from "vitest";
import { rolledBack, watchState, watchedMs, WATCH_GAP_MS, type WatchLog } from "./runs.ts";
import { recordMilestone, type RunState } from "../src/sr/state.ts";

const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
const MIN = 60_000;
const UNKNOWN = { hack: null, money: null, M: null, homeRam: null, sleeves: null };
const START: RunState = {
  v: 1, category: "open", startedAt: T0, buildSha: "a".repeat(40), updatedAt: T0,
  milestone: null, splits: [], reloads: [], builds: [], installs: 0, resetAt: T0,
};
const at = (state: RunState, name: string, min: number) => recordMilestone(state, name, T0 + min * MIN, UNKNOWN);

/** The watcher polling each state in turn, a minute apart. */
const watchAll = (states: RunState[], log: WatchLog | null = null, fromMin = 0) =>
  states.reduce<WatchLog | null>((l, s, i) => watchState(l, s, T0 + (fromMin + i) * MIN), log) as WatchLog;

describe("the rollback watcher", () => {
  const one = at(START, "bn1.1", 10);
  const two = at(one, "bn1.1:x", 20);

  test("sees no rollback while the run only moves forward", () => {
    const log = watchAll([START, one, two]);
    expect(rolledBack(log, two)).toEqual([]);
  });

  test("marks a milestone it saw that the state later lost", () => {
    // The page reloaded to a save from before bn1.1:x.
    const log = watchAll([one, two, one]);
    expect(rolledBack(log, one)).toEqual([{ milestone: "bn1.1:x", ms: 20 * MIN }]);
  });

  test("still marks it once the run reaches it again, at a later time", () => {
    const again = at(one, "bn1.1:x", 25);
    const log = watchAll([one, two, one, again]);
    expect(rolledBack(log, again)).toEqual([{ milestone: "bn1.1:x", ms: 20 * MIN }]);
  });

  test("starts a new log for a new run", () => {
    const old = watchAll([one, two, one]);
    const fresh = { ...START, startedAt: T0 + 60 * MIN, updatedAt: T0 + 60 * MIN };
    const log = watchState(old, fresh, T0 + 61 * MIN);
    expect(log.startedAt).toBe(fresh.startedAt);
    expect(rolledBack(log, fresh)).toEqual([]);
  });

  test("counts only the time it was watching", () => {
    // Watched minutes 0-2, then away until minute 30, then minutes 30-31.
    let log = watchAll([START, one, two]);
    expect(watchedMs(log)).toBe(2 * MIN);
    log = watchAll([two, two], log, 30);
    expect(30 * MIN - 2 * MIN).toBeGreaterThan(WATCH_GAP_MS);
    expect(watchedMs(log)).toBe(3 * MIN);
  });
});
