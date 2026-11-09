// The scenario test's judgements (seam F, the pure half). The CLI
// (tools/scenario.ts) loads a milestone save, types the start command once
// and polls the game; what it sees goes in here and a verdict comes out.

import { formatDuration } from "../../src/sr/splits.ts";
import { currentBuild, reachedMilestones, type RunState } from "../../src/sr/state.ts";
import type { TerminalLine } from "./verdict.ts";

export interface ScenarioObservation {
  /** The run's state as the milestone save holds it. */
  start: RunState;
  /** The milestone to reach, or null for whichever comes next. */
  until: string | null;
  /** The build under test: the local release's `source`. */
  build: string;
  /** The latest readable state file since the retype, or null before one. */
  latest: RunState | null;
  /** Terminal error lines since the retype, page errors and game error dialogs. */
  errors: readonly string[];
  /** Since the start command was typed. */
  elapsedMs: number;
  timeoutMs: number;
}

export type ScenarioVerdict = { status: "running" } | { status: "passed"; milestone: string } | { status: "failed"; problems: string[] };

/**
 * A scenario passes when the save's run (same `startedAt`) reaches the target
 * on the build under test: the named milestone, or else any milestone the
 * save hadn't reached. It fails at once on any error, and at the timeout.
 */
export function judgeScenario(o: ScenarioObservation): ScenarioVerdict {
  const failed = (...problems: string[]): ScenarioVerdict => ({ status: "failed", problems });
  if (o.errors.length > 0) return failed(...o.errors);
  const latest = o.latest;
  if (latest !== null && latest.startedAt !== o.start.startedAt)
    return failed(`a new run started (startedAt ${latest.startedAt}, the save's run ${o.start.startedAt})`);
  if (latest !== null) {
    const had = reachedMilestones(o.start);
    const reached = reachedMilestones(latest);
    const hit = o.until !== null ? (reached.includes(o.until) ? o.until : undefined) : reached.find((m) => !had.includes(m));
    if (hit !== undefined) {
      const build = currentBuild(latest);
      if (build !== o.build) return failed(`${hit} was reached on build ${build}, not the build under test ${o.build}`);
      return { status: "passed", milestone: hit };
    }
  }
  if (o.elapsedMs >= o.timeoutMs) {
    const last = (latest ?? o.start).milestone ?? "none";
    return failed(`timed out after ${formatDuration(o.elapsedMs)} waiting for ${o.until ?? "the next milestone"} (last milestone ${last})`);
  }
  return { status: "running" };
}

/** The `--until` target: a milestone of this build (`known`) the save hasn't reached, or none for the next one. */
export function scenarioTarget(
  until: string | undefined,
  start: RunState,
  known: readonly string[],
): { ok: true; until: string | null } | { ok: false; error: string } {
  if (until === undefined) return { ok: true, until: null };
  if (!known.includes(until)) return { ok: false, error: `${until} is not a milestone of this build` };
  if (reachedMilestones(start).includes(until)) return { ok: false, error: `the save has already reached ${until}` };
  return { ok: true, until };
}

/**
 * The terminal lines in `next` that weren't in `prev`, the previous read. The
 * terminal keeps its last few hundred lines (MaxTerminalCapacity), so once it
 * is full each new line pushes the oldest out: find the shortest drop `d`
 * from the front of `prev` that makes the rest a prefix of `next`. With no
 * overlap at all (the terminal was cleared), every line is new.
 */
export function newLines(prev: readonly TerminalLine[], next: readonly TerminalLine[]): TerminalLine[] {
  const same = (a: TerminalLine, b: TerminalLine) => a.text === b.text && a.error === b.error;
  for (let d = 0; d < prev.length; d++) {
    const kept = prev.length - d;
    if (kept > next.length) continue;
    let ok = true;
    for (let i = 0; i < kept && ok; i++) ok = same(prev[d + i]!, next[i]!);
    if (ok) return next.slice(kept);
  }
  return [...next];
}

/** "90s", "45m", "6h", "1.5h" → ms. */
export function parseDuration(text: string): number {
  const m = /^(\d+(?:\.\d+)?)(s|m|h)$/.exec(text.trim());
  if (!m) throw new Error(`not a duration (like 90s, 45m or 6h): ${JSON.stringify(text)}`);
  return Math.round(Number(m[1]) * { s: 1_000, m: 60_000, h: 3_600_000 }[m[2] as "s" | "m" | "h"]);
}
