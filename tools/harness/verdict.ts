// The smoke test's judgements (seam F, the pure half): what the harness saw in
// the game goes in, a verdict comes out. No browser and no game here, so each
// rule is tested on its own (verdict.test.ts) and the browser side only
// collects observations.

import { parseState, type RunState } from "../../src/sr/state.ts";
import type { RamResult } from "../ram-calc.ts";

/**
 * The terminal's answer to the first submission of the start command on a
 * fresh save: `run boot.js` runs before the non-waiting `wget` has written the
 * file. Expected by design (spec #41, user story 2), so the start phase allows it.
 */
export const FIRST_SUBMISSION_LINE = "Script boot.js does not exist on home.";

/** One line of the game's terminal, and whether the game styled it as an error. */
export interface TerminalLine {
  text: string;
  error: boolean;
}

/** `sr/state.json` as read through the Remote API at one moment (`""` when missing). */
export interface StateRead {
  atMs: number;
  text: string;
}

export interface StartObservation {
  terminal: readonly TerminalLine[];
  /** Uncaught exceptions in the page, and the game's script-error dialogs. */
  pageErrors: readonly string[];
  /** Every read of the state file, oldest first. */
  states: readonly StateRead[];
  /** Whether `ps` on home listed the conductor at the end. */
  conductorRunning: boolean;
}

export interface Verdict {
  ok: boolean;
  /** One line per failed rule. */
  problems: string[];
}

/**
 * The start passes if the only terminal error is the expected first-submission
 * line, the page threw nothing, the conductor refreshed the state file after
 * boot created it (`updatedAt` past `startedAt`; only the conductor writes it
 * after creation) and the conductor is still running.
 */
export function judgeStart(o: StartObservation): Verdict {
  const problems = [...terminalErrors(o.terminal, [FIRST_SUBMISSION_LINE]), ...o.pageErrors.map((e) => `page error: ${e}`)];
  const why = notUpdated(o.states, (s) => (s.updatedAt > s.startedAt ? null : "updatedAt still the boot's"));
  if (why !== null) problems.push(`state file never updated (last read: ${why})`);
  if (!o.conductorRunning) problems.push("the conductor is not running on home");
  return verdict(problems);
}

/**
 * After a page reload and one retype of the start command, the run resumes if
 * no terminal error at all shows, the page threw nothing, the state file keeps
 * the run's `startedAt` (the same run, not a new one) and the conductor wrote
 * it after the retype, and the conductor is still running.
 */
export function judgeResume(o: StartObservation, startedAt: number, retypedAtMs: number): Verdict {
  const problems = [...terminalErrors(o.terminal, []), ...o.pageErrors.map((e) => `page error: ${e}`)];
  const why = notUpdated(o.states, (s) =>
    s.startedAt !== startedAt
      ? "startedAt changed, so a new run started"
      : s.updatedAt <= retypedAtMs
        ? "updatedAt from before the retype"
        : null,
  );
  if (why !== null) problems.push(`state file never updated after the retype (last read: ${why})`);
  if (!o.conductorRunning) problems.push("the conductor is not running on home");
  return verdict(problems);
}

/**
 * The gate's flake rule (spec #41, user story 128): run `attempt` (1, then 2);
 * one retry after a failure, and a second failure is final. An attempt that
 * throws is a failure.
 */
export async function retryOnce(attempt: (n: number) => Promise<Verdict>): Promise<{ ok: boolean; attempts: Verdict[] }> {
  const attempts: Verdict[] = [];
  for (let n = 1; n <= 2; n++) {
    let v: Verdict;
    try {
      v = await attempt(n);
    } catch (e) {
      v = verdict([`attempt threw: ${String(e)}`]);
    }
    attempts.push(v);
    if (v.ok) return { ok: true, attempts };
  }
  return { ok: false, attempts };
}

/** The Remote API's `calculateRam` answer for one script. */
export type GameRam = { ok: true; cost: number } | { ok: false; error: string };

/** Both sides round to hundredths of a GB; anything past that is float noise. */
const RAM_TOLERANCE_GB = 0.005;

/**
 * The static RAM check must agree with the game: every script our calculator
 * priced (`ours`, keyed by home path) must be priced the same by the game's
 * `calculateRam` in the same context (`game`). An empty comparison fails.
 */
export function compareRam(ours: ReadonlyMap<string, RamResult>, game: ReadonlyMap<string, GameRam>): Verdict {
  if (ours.size === 0) return verdict(["no scripts to compare"]);
  const problems: string[] = [];
  for (const [script, mine] of [...ours].sort(([a], [b]) => a.localeCompare(b))) {
    const theirs = game.get(script);
    if (!mine.ok) problems.push(`our calculator cannot price ${script}: ${mine.error}`);
    else if (theirs === undefined) problems.push(`the game was not asked about ${script}`);
    else if (!theirs.ok) problems.push(`the game cannot price ${script}: ${theirs.error}`);
    else if (Math.abs(mine.cost - theirs.cost) > RAM_TOLERANCE_GB)
      problems.push(`RAM differs for ${script}: ours ${gb(mine.cost)} GB, the game's ${gb(theirs.cost)} GB`);
  }
  return verdict(problems);
}

const gb = (x: number): string => x.toFixed(2);

/** null if some read parses and `stale` finds nothing wrong with it; otherwise why the last read failed. */
function notUpdated(states: readonly StateRead[], stale: (s: RunState) => string | null): string | null {
  let why = "never read";
  for (const read of states) {
    const r = parseState(read.text);
    if (!r.ok) {
      why = r.error;
      continue;
    }
    const wrong = stale(r.state);
    if (wrong === null) return null;
    why = wrong;
  }
  return why;
}

function verdict(problems: string[]): Verdict {
  return { ok: problems.length === 0, problems };
}

/** Every error-styled line, except each `allowed` text once. */
export function terminalErrors(lines: readonly TerminalLine[], allowed: readonly string[]): string[] {
  const left = [...allowed];
  const problems: string[] = [];
  for (const line of lines) {
    if (!line.error) continue;
    const i = left.indexOf(line.text.trim());
    if (i >= 0) left.splice(i, 1);
    else problems.push(`terminal error: ${line.text.trim()}`);
  }
  return problems;
}
