// Run records out of the game (seam E): state files in, the watcher's log,
// exports and the live table out.
import { describe, expect, test } from "vitest";
import {
  exportName,
  exportText,
  liveTable,
  parseRun,
  rolledBack,
  watchState,
  watchedMs,
  WATCH_GAP_MS,
  type WatchLog,
} from "./runs.ts";
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

describe("the live table", () => {
  const stats = { hack: 87, money: 1_234_567, M: 1.16, homeRam: 64, sleeves: 0 };
  const one = recordMilestone(START, "bn1.1", T0 + 10 * MIN, stats);
  // A reload at minute 20 lost 5 minutes, then bn1.1:x at minute 30.
  const reloaded = { ...one, reloads: [{ atMs: T0 + 20 * MIN, gapMs: 5 * MIN }] };
  const two = recordMilestone(reloaded, "bn1.1:x", T0 + 30 * MIN, UNKNOWN);
  const table = (watch: WatchLog | null = null) => liveTable(two, T0 + 40 * MIN, watch);
  const lineOf = (lines: string[], milestone: string) => lines.find((l) => l.split(/\s+/)[0] === milestone) ?? "";

  test("heads with the run, its time so far, gross and net, and its reloads", () => {
    const [first, second] = table();
    expect(first).toBe("run open, started 2026-11-07 12:00:00 UTC on aaaaaaa");
    expect(second).toBe("0:40:00 gross, 0:35:00 net; 1 reloads losing 0:05:00; 0 installs");
  });

  test("has one line per split: gross, net, segment, build and stats", () => {
    const lines = table();
    expect(lineOf(lines, "bn1.1").split(/\s+/)).toEqual(["bn1.1", "0:10:00", "0:10:00", "+0:10:00", "aaaaaaa", "0", "87", "1.23e6", "1.16", "64", "0"]);
    expect(lineOf(lines, "bn1.1:x").split(/\s+/)).toEqual(["bn1.1:x", "0:30:00", "0:25:00", "+0:15:00", "aaaaaaa", "0", "?", "?", "?", "?", "?"]);
  });

  test("says rollbacks unobserved without the watcher", () => {
    expect(table().at(-1)).toBe("rollbacks unobserved");
  });

  test("marks what the watcher saw rolled back", () => {
    const lost = recordMilestone(two, "bn1.1:y", T0 + 35 * MIN, UNKNOWN);
    const watch = watchAll([two, lost, two], null, 37);
    const lines = table(watch);
    expect(lineOf(lines, "bn1.1:y")).toMatch(/^bn1\.1:y\s+0:35:00\s+rolled back$/);
    expect(lines.at(-1)).toBe("rollbacks: 1 (bn1.1:y), watched 0:02:00 of 0:40:00");
  });

  test("says when there is no split yet", () => {
    expect(liveTable(START, T0 + MIN, null)).toContain("no milestone yet");
  });
});

describe("exports", () => {
  const done = at(at(START, "bn1.1", 10), "bn2.1", 20);

  test("are named by the run's start date, its category and its build", () => {
    expect(exportName(done)).toBe("2026-11-07T120000Z-open-aaaaaaa.json");
    expect(exportName({ ...done, category: "strict", buildSha: "unknown" })).toBe("2026-11-07T120000Z-strict-unknown.json");
  });

  test("read back as the same run, with the watcher's log", () => {
    const watch = watchAll([done]);
    const r = parseRun(exportText(done, watch, T0 + 30 * MIN));
    expect(r).toEqual({ ok: true, run: { state: done, watch } });
  });

  test("of a run nobody watched read back with no log", () => {
    expect(parseRun(exportText(done, null, T0))).toEqual({ ok: true, run: { state: done, watch: null } });
  });

  test("a state file copied out by hand reads as an unwatched run", () => {
    expect(parseRun(JSON.stringify(done))).toEqual({ ok: true, run: { state: done, watch: null } });
  });

  test("keep only the log of the run they hold", () => {
    const other = watchAll([{ ...START, startedAt: T0 - MIN }]);
    expect(parseRun(exportText(done, other, T0))).toMatchObject({ ok: true, run: { watch: null } });
  });

  test("refuse what isn't a run", () => {
    expect(parseRun("not json")).toMatchObject({ ok: false });
    expect(parseRun(JSON.stringify({ export: 99, state: done }))).toMatchObject({ ok: false, error: expect.stringMatching(/newer/) });
    expect(parseRun(JSON.stringify({ ...done, category: "speedy" }))).toMatchObject({ ok: false });
  });
});
