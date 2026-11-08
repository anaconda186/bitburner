import { describe, expect, test } from "vitest";
import { MANIFEST_FILE as BOOT_MANIFEST_FILE } from "../boot.ts";
import {
  accountStart, buildOnHome, currentBuild, lostMs, MANIFEST_FILE, noteBuild, parseState, reachedMilestones, recordMilestone,
  runTime, serializeState, splitTime, stateWrite, type RunState, type Split, type Written,
} from "./state.ts";

const BUILD = "89abcdef0123456789abcdef0123456789abcdef";
const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
/** A split's stats when no probe has read them yet. */
const UNKNOWN = { hack: null, money: null, M: null, homeRam: null, sleeves: null };

/** A run boot.js has just created. */
const START: RunState = {
  v: 1, category: "open", startedAt: T0, buildSha: BUILD, updatedAt: T0,
  milestone: null, splits: [], reloads: [], builds: [], installs: 0, resetAt: null,
};

describe("parseState", () => {
  test("reads a v1 file as written", () => {
    const file = {
      v: 1,
      category: "open",
      startedAt: T0,
      buildSha: BUILD,
      updatedAt: T0 + 5000,
      milestone: "bn1.1:casino",
      splits: [{ milestone: "bn1.1:casino", ms: 210_000 }],
      reloads: [{ atMs: T0 + 100_000, gapMs: 40_000 }],
      builds: [{ sha: BUILD, fromMs: T0 }],
      installs: 2,
      resetAt: T0 + 80_000,
    };
    expect(parseState(JSON.stringify(file))).toEqual({ ok: true, state: file });
  });

  test("gives every missing field its default", () => {
    // The smallest file a run can have: only the start time.
    expect(parseState(JSON.stringify({ startedAt: T0 }))).toEqual({
      ok: true,
      state: {
        v: 1,
        category: "open",
        startedAt: T0,
        buildSha: "unknown",
        updatedAt: T0,
        milestone: null,
        splits: [],
        reloads: [],
        builds: [],
        installs: 0,
        resetAt: null,
      },
    });
  });
});

describe("a read-write round trip", () => {
  test("keeps fields a newer build added, at the top and inside records", () => {
    const file = {
      ...START,
      splits: [{ milestone: "bn1.1", ms: 1, futureNote: "kept" }],
      futureField: { nested: [1, 2] },
    };
    const read = parseState(JSON.stringify(file));
    if (!read.ok) throw new Error(read.error);
    expect(JSON.parse(serializeState(read.state))).toEqual(file);
  });

  test("writes the schema's fields in the spec's order, then any newer ones", () => {
    const read = parseState(JSON.stringify({ futureField: 1, builds: [], startedAt: T0 }));
    if (!read.ok) throw new Error(read.error);
    expect(Object.keys(JSON.parse(serializeState(read.state)))).toEqual([
      "v", "category", "startedAt", "buildSha", "updatedAt", "milestone", "splits", "reloads", "builds",
      "installs", "resetAt", "futureField",
    ]);
  });
});

describe("refusals", () => {
  test("a newer version than this build knows is refused, saying why", () => {
    expect(parseState(JSON.stringify({ v: 2, startedAt: T0 }))).toEqual({
      ok: false,
      error: "state file is version 2, newer than this build's version 1; refusing to run rather than damage it",
    });
  });

  test.each([
    ["that is missing (empty)", "", "state file is missing"],
    ["that is not JSON", "{", "state file is not JSON"],
    ["that is not an object", "[1]", "state file is not an object"],
    ["with no start time", JSON.stringify({ v: 1 }), "state file has no startedAt"],
    ["with a version that is not a whole number", JSON.stringify({ v: "1", startedAt: T0 }), "state file has a bad version"],
    ["with a category this build does not know", JSON.stringify({ startedAt: T0, category: "any%" }),
      "state file has category any%, which this build does not know"],
    ["with a known field of the wrong type", JSON.stringify({ startedAt: T0, splits: {} }), "state file field splits is not a list"],
    ["with a text field of the wrong type", JSON.stringify({ startedAt: T0, buildSha: 7 }), "state file field buildSha is not text"],
    ["with an install count that is not a whole number", JSON.stringify({ startedAt: T0, installs: 1.5 }),
      "state file field installs is not a count"],
    ["with a reset time that is not a number", JSON.stringify({ startedAt: T0, resetAt: "x" }),
      "state file field resetAt is not a number"],
  ])("a file %s is refused", (_why, body, error) => {
    expect(parseState(body)).toEqual({ ok: false, error });
  });

  test("strict is a known category", () => {
    const r = parseState(JSON.stringify({ startedAt: T0, category: "strict" }));
    expect(r.ok && r.state.category).toBe("strict");
  });
});

describe("stateWrite: when the conductor writes", () => {
  const start = START;

  /** Runs the conductor's loop for `forMs`, one tick per `tickMs`; returns each write's time. */
  function loop(tickMs: number, forMs: number, change?: (now: number, s: RunState) => RunState): number[] {
    let state = start;
    let last: Written | null = null;
    const writes: number[] = [];
    for (let now = T0; now <= T0 + forMs; now += tickMs) {
      if (change) state = change(now, state);
      const w = stateWrite(state, last, now);
      if (w) {
        state = w.state;
        last = { text: w.text, atMs: now };
        writes.push(now);
      }
    }
    return writes;
  }

  test("writes at once when nothing has been written yet", () => {
    const w = stateWrite(start, null, T0 + 2000);
    expect(w && JSON.parse(w.text)).toEqual({ ...start, updatedAt: T0 + 2000 });
  });

  test("refreshes updatedAt at least every 30 s, but not on every tick", () => {
    const writes = loop(1050, 300_000);
    const gaps = writes.slice(1).map((t, i) => t - writes[i]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(30_000);
    expect(writes.length).toBeLessThan(300 / 1.05 / 2);
  });

  test("writes on the tick the state changes", () => {
    const at = T0 + 4200;
    const writes = loop(1050, 8000, (now, s) => (now === at ? { ...s, milestone: "bn1.1:casino" } : s));
    expect(writes).toContain(at);
  });

  test("never changes startedAt and keeps unknown fields", () => {
    const w = stateWrite({ ...start, futureField: 1 }, { text: serializeState(start), atMs: T0 }, T0 + 3_600_000);
    expect(w && JSON.parse(w.text)).toMatchObject({ startedAt: T0, updatedAt: T0 + 3_600_000, futureField: 1 });
  });
});

describe("conductor starts: reloads and installs", () => {
  /** The game as the route probe reads it: no install yet in this BitNode. */
  const FRESH = { lastAugReset: T0 - 1000, lastNodeReset: T0 - 1000 };
  /** The run once its first conductor has run for a while. */
  const RUNNING: RunState = { ...START, updatedAt: T0 + 600_000, resetAt: FRESH.lastAugReset };

  test("the run's first start records no reload, only the game's reset time", () => {
    const next = accountStart(START, { atMs: T0 + 3000, savedUpdatedAt: T0 }, FRESH);
    expect(next).toEqual({ ...START, resetAt: FRESH.lastAugReset });
  });

  test("a start with no reset since the saved heartbeat is a reload: one record, gap since the saved updatedAt", () => {
    const next = accountStart(RUNNING, { atMs: T0 + 700_000, savedUpdatedAt: RUNNING.updatedAt }, FRESH);
    expect(next.reloads).toEqual([{ atMs: T0 + 700_000, gapMs: 100_000 }]);
    expect(next.installs).toBe(0);
    expect(lostMs(next)).toBe(100_000);
  });

  test("a start after an install counts the install and records no reload", () => {
    const installed = { lastAugReset: T0 + 650_000, lastNodeReset: FRESH.lastNodeReset };
    const next = accountStart(RUNNING, { atMs: T0 + 660_000, savedUpdatedAt: RUNNING.updatedAt }, installed);
    expect(next).toEqual({ ...RUNNING, installs: 1, resetAt: installed.lastAugReset });
  });

  test("a start in a new BitNode is neither a reload nor an install", () => {
    const entered = { lastAugReset: T0 + 650_000, lastNodeReset: T0 + 650_000 };
    const next = accountStart(RUNNING, { atMs: T0 + 660_000, savedUpdatedAt: RUNNING.updatedAt }, entered);
    expect(next).toEqual({ ...RUNNING, resetAt: entered.lastAugReset });
  });

  test("a reload after an install is one reload, and the install is not counted twice", () => {
    const installed = { lastAugReset: T0 + 650_000, lastNodeReset: FRESH.lastNodeReset };
    const afterInstall = { ...accountStart(RUNNING, { atMs: T0 + 660_000, savedUpdatedAt: RUNNING.updatedAt }, installed), updatedAt: T0 + 700_000 };
    const next = accountStart(afterInstall, { atMs: T0 + 790_000, savedUpdatedAt: T0 + 700_000 }, installed);
    expect(next.installs).toBe(1);
    expect(next.reloads).toEqual([{ atMs: T0 + 790_000, gapMs: 90_000 }]);
  });

  test("reload loss adds up over reloads, and gross minus it is net", () => {
    let state: RunState = RUNNING;
    state = accountStart(state, { atMs: T0 + 700_000, savedUpdatedAt: T0 + 600_000 }, FRESH);
    state = accountStart({ ...state, updatedAt: T0 + 900_000 }, { atMs: T0 + 960_000, savedUpdatedAt: T0 + 900_000 }, FRESH);
    expect(lostMs(state)).toBe(160_000);
    expect(runTime(state, T0 + 1_000_000)).toEqual({ grossMs: 1_000_000, netMs: 840_000 });
    const split = recordMilestone(state, "bn1.1", T0 + 1_000_000, UNKNOWN).splits[0] as Split;
    expect(splitTime(split)).toEqual({ grossMs: 1_000_000, netMs: 840_000 });
  });
});

describe("builds", () => {
  const NEW = "fedcba9876543210fedcba9876543210fedcba98";

  test("the conductor reads the running build from the manifest boot.js left on home", () => {
    expect(MANIFEST_FILE).toBe(BOOT_MANIFEST_FILE);
    const manifest = JSON.stringify({ sha: "1".repeat(40), source: NEW, files: { "boot.js": "ab" } });
    expect(buildOnHome(manifest)).toBe(NEW);
    expect(buildOnHome("")).toBeNull();
    expect(buildOnHome("{")).toBeNull();
    expect(buildOnHome(JSON.stringify({ sha: "1".repeat(40) }))).toBeNull();
  });

  test("the build that started the run is not recorded again", () => {
    expect(noteBuild(START, BUILD, T0 + 5000)).toBe(START);
  });

  test("a new build at the next boot appends a build record, once", () => {
    const one = noteBuild(START, NEW, T0 + 5000);
    expect(one.builds).toEqual([{ sha: NEW, fromMs: T0 + 5000 }]);
    expect(currentBuild(one)).toBe(NEW);
    expect(noteBuild(one, NEW, T0 + 9000)).toBe(one);
    const back = noteBuild(one, BUILD, T0 + 9000);
    expect(back.builds).toEqual([{ sha: NEW, fromMs: T0 + 5000 }, { sha: BUILD, fromMs: T0 + 9000 }]);
  });

  test("an unknown build changes nothing", () => {
    expect(noteBuild(START, null, T0 + 5000)).toBe(START);
  });
});

describe("milestones in the state file", () => {
  const start = START;

  test("recording one sets the milestone field and adds a split at the time since the start", () => {
    const one = recordMilestone(start, "bn1.1:casino", T0 + 210_000, UNKNOWN);
    expect(one).toMatchObject({ milestone: "bn1.1:casino", splits: [{ milestone: "bn1.1:casino", ms: 210_000 }] });
    const two = recordMilestone(one, "bn1.1", T0 + 9_000_000, UNKNOWN);
    expect(two.milestone).toBe("bn1.1");
    expect(two.splits).toMatchObject([
      { milestone: "bn1.1:casino", ms: 210_000 },
      { milestone: "bn1.1", ms: 9_000_000 },
    ]);
  });

  test("a split records the build, the reload loss so far, the installs so far and the stats", () => {
    const stats = { hack: 812, money: 3.2e9, M: 2.41, homeRam: 512, sleeves: 0 };
    const state: RunState = {
      ...start,
      reloads: [{ atMs: T0 + 50_000, gapMs: 40_000 }, { atMs: T0 + 90_000, gapMs: 5_000 }],
      builds: [{ sha: "c0ffee", fromMs: T0 + 60_000 }],
      installs: 3,
    };
    expect(recordMilestone(state, "bn1.1", T0 + 9_000_000, stats).splits).toEqual([
      { milestone: "bn1.1", ms: 9_000_000, build: "c0ffee", lostMs: 45_000, installs: 3, stats },
    ]);
  });

  test("before any build change the split's build is the one that started the run", () => {
    const [split] = recordMilestone(start, "bn1.1", T0 + 1, UNKNOWN).splits;
    expect(split).toMatchObject({ build: BUILD, lostMs: 0, installs: 0, stats: UNKNOWN });
  });

  test("the reached milestones are the ones recorded, read back from the file", () => {
    expect(reachedMilestones(start)).toEqual([]);
    const two = recordMilestone(recordMilestone(start, "bn1.1:casino", T0 + 1, UNKNOWN), "bn1.1", T0 + 2, UNKNOWN);
    const read = parseState(serializeState(two));
    if (!read.ok) throw new Error(read.error);
    expect(reachedMilestones(read.state)).toEqual(["bn1.1:casino", "bn1.1"]);
  });

  test("a milestone in the field but missing from the splits still counts as reached", () => {
    expect(reachedMilestones({ ...start, milestone: "bn4.1", splits: [{ milestone: "bn1.1", ms: 5 }, { junk: true }] })).toEqual([
      "bn1.1",
      "bn4.1",
    ]);
  });

  test("a recorded milestone is written on the tick it is reached", () => {
    const last = { text: serializeState(start), atMs: T0 };
    expect(stateWrite(recordMilestone(start, "bn1.1", T0 + 1000, UNKNOWN), last, T0 + 1000)).not.toBeNull();
  });
});
