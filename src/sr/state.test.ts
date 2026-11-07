import { describe, expect, test } from "vitest";
import { parseState, reachedMilestones, recordMilestone, serializeState, stateWrite, type RunState, type Written } from "./state.ts";

const BUILD = "89abcdef0123456789abcdef0123456789abcdef";
const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);

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
      },
    });
  });
});

describe("a read-write round trip", () => {
  test("keeps fields a newer build added, at the top and inside records", () => {
    const file = {
      v: 1,
      category: "open",
      startedAt: T0,
      buildSha: BUILD,
      updatedAt: T0,
      milestone: null,
      splits: [{ milestone: "bn1.1", ms: 1, futureNote: "kept" }],
      reloads: [],
      builds: [],
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
      "v", "category", "startedAt", "buildSha", "updatedAt", "milestone", "splits", "reloads", "builds", "futureField",
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
  ])("a file %s is refused", (_why, body, error) => {
    expect(parseState(body)).toEqual({ ok: false, error });
  });

  test("strict is a known category", () => {
    const r = parseState(JSON.stringify({ startedAt: T0, category: "strict" }));
    expect(r.ok && r.state.category).toBe("strict");
  });
});

describe("stateWrite: when the conductor writes", () => {
  const start: RunState = {
    v: 1, category: "open", startedAt: T0, buildSha: BUILD, updatedAt: T0,
    milestone: null, splits: [], reloads: [], builds: [],
  };

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

describe("milestones in the state file", () => {
  const start: RunState = {
    v: 1, category: "open", startedAt: T0, buildSha: BUILD, updatedAt: T0,
    milestone: null, splits: [], reloads: [], builds: [],
  };

  test("recording one sets the milestone field and adds a split at the time since the start", () => {
    const one = recordMilestone(start, "bn1.1:casino", T0 + 210_000);
    expect(one).toMatchObject({ milestone: "bn1.1:casino", splits: [{ milestone: "bn1.1:casino", ms: 210_000 }] });
    const two = recordMilestone(one, "bn1.1", T0 + 9_000_000);
    expect(two.milestone).toBe("bn1.1");
    expect(two.splits).toEqual([
      { milestone: "bn1.1:casino", ms: 210_000 },
      { milestone: "bn1.1", ms: 9_000_000 },
    ]);
  });

  test("the reached milestones are the ones recorded, read back from the file", () => {
    expect(reachedMilestones(start)).toEqual([]);
    const two = recordMilestone(recordMilestone(start, "bn1.1:casino", T0 + 1), "bn1.1", T0 + 2);
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
    expect(stateWrite(recordMilestone(start, "bn1.1", T0 + 1000), last, T0 + 1000)).not.toBeNull();
  });
});
