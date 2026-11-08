import { describe, expect, it } from "vitest";
import type { RamResult } from "../ram-calc.ts";
import { compareRam, FIRST_SUBMISSION_LINE, judgeResume, judgeStart, retryOnce, type StartObservation } from "./verdict.ts";

const T0 = 1_800_000_000_000;

function state(startedAt: number, updatedAt: number): string {
  return JSON.stringify({ v: 1, category: "open", startedAt, buildSha: "abc", updatedAt, milestone: null, splits: [], reloads: [], builds: [] });
}

/** A start the way the real game shows it: the expected miss, then a run that keeps writing. */
function goodStart(): StartObservation {
  return {
    terminal: [
      { text: "[home /]> wget https://raw.githubusercontent.com/anaconda186/bitburner/release/boot.js boot.js; run boot.js", error: false },
      { text: FIRST_SUBMISSION_LINE, error: true },
      { text: "wget successfully retrieved content to new file boot.js", error: false },
      { text: "boot.js: boot: build abc on home (3 fetched, 0 kept)", error: false },
      { text: "sr/conductor.js: conductor: up", error: false },
    ],
    pageErrors: [],
    states: [
      { atMs: T0 + 5_000, text: "" },
      { atMs: T0 + 10_000, text: state(T0 + 6_000, T0 + 6_000) },
      { atMs: T0 + 22_000, text: state(T0 + 6_000, T0 + 17_000) },
    ],
    conductorRunning: true,
  };
}

describe("judgeStart", () => {
  it("passes a start whose only error is the expected first-submission line", () => {
    expect(judgeStart(goodStart())).toEqual({ ok: true, problems: [] });
  });

  it("fails on any other error line in the terminal", () => {
    const o = goodStart();
    const terminal = [...o.terminal, { text: "sr/conductor.js: ERROR conductor: iteration failed (1 in a row)", error: true }];
    const v = judgeStart({ ...o, terminal });
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual(["terminal error: sr/conductor.js: ERROR conductor: iteration failed (1 in a row)"]);
  });

  it("allows the first-submission line only once", () => {
    const o = goodStart();
    const terminal = [...o.terminal, { text: FIRST_SUBMISSION_LINE, error: true }];
    expect(judgeStart({ ...o, terminal }).problems).toEqual([`terminal error: ${FIRST_SUBMISSION_LINE}`]);
  });

  it("fails when the state file never appears", () => {
    const states = [{ atMs: T0, text: "" }, { atMs: T0 + 600_000, text: "" }];
    expect(judgeStart({ ...goodStart(), states }).problems).toEqual(["state file never updated (last read: state file is missing)"]);
  });

  it("fails when the state file is created but never refreshed (no conductor writing it)", () => {
    const states = [
      { atMs: T0 + 10_000, text: state(T0 + 6_000, T0 + 6_000) },
      { atMs: T0 + 600_000, text: state(T0 + 6_000, T0 + 6_000) },
    ];
    expect(judgeStart({ ...goodStart(), states }).problems).toEqual([
      "state file never updated (last read: updatedAt still the boot's)",
    ]);
  });

  it("fails when the conductor is not running at the end", () => {
    expect(judgeStart({ ...goodStart(), conductorRunning: false }).problems).toEqual([
      "the conductor is not running on home",
    ]);
  });

  it("fails on an uncaught page error", () => {
    expect(judgeStart({ ...goodStart(), pageErrors: ["TypeError: x is undefined"] }).problems).toEqual([
      "page error: TypeError: x is undefined",
    ]);
  });
});

describe("compareRam", () => {
  const ours = new Map([
    ["boot.js", { ok: true as const, cost: 3.8, entries: [] }],
    ["sr/conductor.js", { ok: true as const, cost: 1.6, entries: [] }],
    ["sr/h/network.js", { ok: true as const, cost: 1.85, entries: [] }],
  ]);

  it("passes when the game prices every script as we do", () => {
    const game = new Map([
      ["boot.js", { ok: true as const, cost: 3.8 }],
      ["sr/conductor.js", { ok: true as const, cost: 1.6 }],
      ["sr/h/network.js", { ok: true as const, cost: 1.85 }],
    ]);
    expect(compareRam(ours, game)).toEqual({ ok: true, problems: [] });
  });

  it("fails on any script the game prices differently", () => {
    const game = new Map([
      ["boot.js", { ok: true as const, cost: 3.8 }],
      ["sr/conductor.js", { ok: true as const, cost: 1.6 }],
      ["sr/h/network.js", { ok: true as const, cost: 2.05 }],
    ]);
    expect(compareRam(ours, game).problems).toEqual(["RAM differs for sr/h/network.js: ours 1.85 GB, the game's 2.05 GB"]);
  });

  it("fails on a script the game could not price or was not asked about", () => {
    const game = new Map([
      ["boot.js", { ok: true as const, cost: 3.8 }],
      ["sr/conductor.js", { ok: false as const, error: "File does not exist. Filename: sr/conductor.js" }],
    ]);
    expect(compareRam(ours, game).problems).toEqual([
      "the game cannot price sr/conductor.js: File does not exist. Filename: sr/conductor.js",
      "the game was not asked about sr/h/network.js",
    ]);
  });

  it("fails on a script our calculator cannot price", () => {
    const broken = new Map<string, RamResult>([...ours, ["sr/x.js", { ok: false, error: "ImportError" }]]);
    const game = new Map([...ours].map(([k, v]) => [k, { ok: true as const, cost: v.cost }]));
    game.set("sr/x.js", { ok: true as const, cost: 1.6 });
    expect(compareRam(broken, game).problems).toEqual(["our calculator cannot price sr/x.js: ImportError"]);
  });

  it("fails when there is nothing to compare, so it can never pass vacuously", () => {
    expect(compareRam(new Map(), new Map()).problems).toEqual(["no scripts to compare"]);
  });
});

describe("retryOnce", () => {
  const pass = { ok: true, problems: [] };
  const fail = (p: string) => ({ ok: false, problems: [p] });

  it("stops after a first pass", async () => {
    let calls = 0;
    const r = await retryOnce(async () => (calls++, pass));
    expect(r).toEqual({ ok: true, attempts: [pass] });
    expect(calls).toBe(1);
  });

  it("passes when the one retry passes, so a single flake doesn't block a release", async () => {
    const results = [fail("flake"), pass];
    expect(await retryOnce(async () => results.shift()!)).toEqual({ ok: true, attempts: [fail("flake"), pass] });
  });

  it("fails after two failures and never tries a third time", async () => {
    let calls = 0;
    const r = await retryOnce(async () => fail(`try ${++calls}`));
    expect(r).toEqual({ ok: false, attempts: [fail("try 1"), fail("try 2")] });
  });

  it("counts an attempt that throws as a failure", async () => {
    const r = await retryOnce(async () => {
      throw new Error("browser crashed");
    });
    expect(r).toEqual({ ok: false, attempts: [fail("attempt threw: Error: browser crashed"), fail("attempt threw: Error: browser crashed")] });
  });
});

describe("judgeResume", () => {
  const STARTED = T0 + 6_000;
  const RETYPED = T0 + 100_000;
  /** After a reload and one retype: boot keeps every file and the same run carries on. */
  function goodResume(): StartObservation {
    return {
      terminal: [
        { text: "boot.js: boot: build abc on home (0 fetched, 3 kept)", error: false },
        { text: "sr/conductor.js: conductor: up", error: false },
      ],
      pageErrors: [],
      states: [
        { atMs: RETYPED - 1_000, text: state(STARTED, T0 + 80_000) },
        { atMs: RETYPED + 15_000, text: state(STARTED, RETYPED + 11_000) },
      ],
      conductorRunning: true,
    };
  }

  it("passes when the same run's state file is refreshed after the retype", () => {
    expect(judgeResume(goodResume(), STARTED, RETYPED)).toEqual({ ok: true, problems: [] });
  });

  it("allows no error line at all, not even the first-submission one", () => {
    const o = goodResume();
    const terminal = [{ text: FIRST_SUBMISSION_LINE, error: true }, ...o.terminal];
    expect(judgeResume({ ...o, terminal }, STARTED, RETYPED).problems).toEqual([`terminal error: ${FIRST_SUBMISSION_LINE}`]);
  });

  it("fails when the state file is only the one from before the reload", () => {
    const states = [{ atMs: RETYPED + 600_000, text: state(STARTED, T0 + 80_000) }];
    expect(judgeResume({ ...goodResume(), states }, STARTED, RETYPED).problems).toEqual([
      "state file never updated after the retype (last read: updatedAt from before the retype)",
    ]);
  });

  it("fails when a new run was started instead of resuming the old one", () => {
    const states = [{ atMs: RETYPED + 15_000, text: state(RETYPED + 1_000, RETYPED + 11_000) }];
    expect(judgeResume({ ...goodResume(), states }, STARTED, RETYPED).problems).toEqual([
      "state file never updated after the retype (last read: startedAt changed, so a new run started)",
    ]);
  });

  it("fails when the conductor is not running at the end", () => {
    expect(judgeResume({ ...goodResume(), conductorRunning: false }, STARTED, RETYPED).problems).toEqual([
      "the conductor is not running on home",
    ]);
  });
});
