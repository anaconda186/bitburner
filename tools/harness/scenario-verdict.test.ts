// The scenario test's judgements (seam F, the pure half): what the CLI saw
// in the game goes in, a verdict comes out.
import { describe, expect, it } from "vitest";
import { parseState, type RunState } from "../../src/sr/state.ts";
import { judgeScenario, newLines, parseDuration, scenarioTarget, type ScenarioObservation } from "./scenario-verdict.ts";
import type { TerminalLine } from "./verdict.ts";

function state(o: { startedAt?: number; milestones?: string[]; builds?: string[] } = {}): RunState {
  const milestones = o.milestones ?? [];
  const r = parseState(
    JSON.stringify({
      v: 1,
      startedAt: o.startedAt ?? 1_000,
      buildSha: "old",
      milestone: milestones.at(-1) ?? null,
      splits: milestones.map((milestone) => ({ milestone })),
      builds: (o.builds ?? []).map((sha) => ({ sha, fromMs: 5 })),
    }),
  );
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const base: ScenarioObservation = {
  start: state({ milestones: ["bn1.1"] }),
  until: null,
  build: "new",
  latest: state({ milestones: ["bn1.1"], builds: ["new"] }),
  errors: [],
  elapsedMs: 60_000,
  timeoutMs: 3_600_000,
};

describe("judgeScenario", () => {
  it("keeps waiting while no new milestone is reached", () => {
    expect(judgeScenario(base)).toEqual({ status: "running" });
    expect(judgeScenario({ ...base, latest: null })).toEqual({ status: "running" });
  });

  it("passes when the run reaches a milestone the save didn't have, on the build under test", () => {
    expect(judgeScenario({ ...base, latest: state({ milestones: ["bn1.1", "bn4.1"], builds: ["new"] }) })).toEqual({ status: "passed", milestone: "bn4.1" });
  });

  it("with a named target, passes only once that one is reached", () => {
    const until = "bn4.2";
    expect(judgeScenario({ ...base, until, latest: state({ milestones: ["bn1.1", "bn4.1"], builds: ["new"] }) })).toEqual({ status: "running" });
    expect(judgeScenario({ ...base, until, latest: state({ milestones: ["bn1.1", "bn4.1", "bn4.2"], builds: ["new"] }) })).toEqual({
      status: "passed",
      milestone: "bn4.2",
    });
  });

  it("fails when the milestone was reached by another build than the one under test", () => {
    const v = judgeScenario({ ...base, latest: state({ milestones: ["bn1.1", "bn4.1"] }) });
    expect(v).toEqual({ status: "failed", problems: ["bn4.1 was reached on build old, not the build under test new"] });
  });

  it("fails on any terminal error, page error or error dialog", () => {
    expect(judgeScenario({ ...base, errors: ["terminal error: ERROR conductor: boom"] })).toEqual({
      status: "failed",
      problems: ["terminal error: ERROR conductor: boom"],
    });
  });

  it("fails on timeout, naming what it waited for", () => {
    expect(judgeScenario({ ...base, until: "bn4.2", elapsedMs: 3_600_000 })).toEqual({
      status: "failed",
      problems: ["timed out after 1:00:00 waiting for bn4.2 (last milestone bn1.1)"],
    });
    expect(judgeScenario({ ...base, elapsedMs: 3_600_001 })).toMatchObject({ status: "failed", problems: [expect.stringMatching(/waiting for the next milestone/)] });
  });

  it("fails when a new run starts instead of the save's run resuming", () => {
    expect(judgeScenario({ ...base, latest: state({ startedAt: 2, builds: ["new"] }) })).toEqual({
      status: "failed",
      problems: ["a new run started (startedAt 2, the save's run 1000)"],
    });
  });
});

describe("scenarioTarget", () => {
  const known = ["bn1.1", "bn4.1", "bn4.2", "bn1.1:casino"];

  it("accepts a known milestone the save hasn't reached, or none (the next one)", () => {
    expect(scenarioTarget("bn4.2", state({ milestones: ["bn1.1"] }), known)).toEqual({ ok: true, until: "bn4.2" });
    expect(scenarioTarget(undefined, state({ milestones: ["bn1.1"] }), known)).toEqual({ ok: true, until: null });
  });

  it("refuses an unknown milestone or one the save already has", () => {
    expect(scenarioTarget("bn99.1", state(), known)).toEqual({ ok: false, error: "bn99.1 is not a milestone of this build" });
    expect(scenarioTarget("bn1.1", state({ milestones: ["bn1.1"] }), known)).toEqual({ ok: false, error: "the save has already reached bn1.1" });
  });
});

describe("newLines", () => {
  const L = (...texts: string[]): TerminalLine[] => texts.map((text) => ({ text, error: text.startsWith("E") }));

  it("gives the lines added since the last read", () => {
    expect(newLines(L("a", "b"), L("a", "b", "c", "E1"))).toEqual(L("c", "E1"));
    expect(newLines(L("a", "b"), L("a", "b"))).toEqual([]);
  });

  it("follows a full terminal dropping its oldest lines", () => {
    expect(newLines(L("a", "E1", "b"), L("E1", "b", "c"))).toEqual(L("c"));
    expect(newLines(L("a", "E1"), L("E1", "E1"))).toEqual(L("E1"));
  });

  it("takes every line as new after the terminal was cleared", () => {
    expect(newLines(L("a", "b"), L("E2"))).toEqual(L("E2"));
  });
});

describe("parseDuration", () => {
  it("reads s, m and h", () => {
    expect(parseDuration("90s")).toBe(90_000);
    expect(parseDuration("45m")).toBe(2_700_000);
    expect(parseDuration("6h")).toBe(21_600_000);
    expect(parseDuration("1.5h")).toBe(5_400_000);
  });

  it("refuses anything else", () => {
    expect(() => parseDuration("10")).toThrow(/duration/);
    expect(() => parseDuration("-1h")).toThrow(/duration/);
  });
});
