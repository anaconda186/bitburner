// The run's state file (seam E): `sr/state.json` on home, holding only what
// the game forgets. boot.js creates it once; after that only the conductor
// writes it. These are the pure rules over its text; no `ns` here.
//
// The schema only grows: fields are never renamed or removed, a missing field
// gets its default, an unknown field is kept as it is, and `v` goes up only for
// a true break. A build that sees a newer `v` than STATE_VERSION refuses to run.

export const STATE_FILE = "sr/state.json";
/** The newest schema this build understands. */
export const STATE_VERSION = 1;

/** The run's state as stored, plus any fields a newer build added. */
export type RunState = {
  /** Schema version. */
  readonly v: number;
  /** The category the run is timed under, fixed at the first boot. */
  readonly category: string;
  /** Wall-clock ms the run started: written once, never changed. */
  readonly startedAt: number;
  /** Main commit of the build that started the run. */
  readonly buildSha: string;
  /** Wall-clock ms of the conductor's last write: the heartbeat. */
  readonly updatedAt: number;
  /** The last milestone reached, if any. */
  readonly milestone: string | null;
  /** One per milestone reached (a `Split` when this build wrote it). */
  readonly splits: readonly unknown[];
  /** One per page reload the run lived through (`Reload`). */
  readonly reloads: readonly unknown[];
  /** One per build change after the first (`BuildRecord`). */
  readonly builds: readonly unknown[];
  /** Augmentation installs since the run started (#49). */
  readonly installs: number;
  /**
   * The game's `lastAugReset` as of the conductor's last start (#49), or null
   * before the first. A different one at the next start means a reset came in
   * between; the same one means a page reload (or a kill) did. The game can't
   * tell those apart by itself, and only reloads are reload loss.
   */
  readonly resetAt: number | null;
  readonly [newer: string]: unknown;
};

/** A split's stats (#49); null where no probe has read them yet. */
export type SplitStats = {
  /** Hacking level. */
  readonly hack: number | null;
  readonly money: number | null;
  /**
   * The player's hacking multiplier (augmentations, Source-Files, NeuroFlux):
   * `getPlayer().mults.hacking`. It leaves out the BitNode's own
   * HackingLevelMultiplier, which needs SF5 to read.
   */
  readonly M: number | null;
  /** Home's max RAM, GB. */
  readonly homeRam: number | null;
  /** Sleeves owned: 0 without SF10 and outside BN10. */
  readonly sleeves: number | null;
};

/** A milestone reached. `ms` is gross, since `startedAt`; net is `ms - lostMs`. */
export type Split = {
  readonly milestone: string;
  readonly ms: number;
  /** The build that was running (a main commit). */
  readonly build: string;
  /** Reload loss so far: the sum of every reload's gap. */
  readonly lostMs: number;
  /** Installs so far. */
  readonly installs: number;
  readonly stats: SplitStats;
};

/** A page reload: when the conductor came back (wall clock), and how long since the saved heartbeat. */
export type Reload = { readonly atMs: number; readonly gapMs: number };

/** A build change: the build running from `fromMs` (wall clock) on. */
export type BuildRecord = { readonly sha: string; readonly fromMs: number };

export type StateResult = { ok: true; state: RunState } | { ok: false; error: string };

/** The categories this build can time a run under (GLOSSARY.md, "Category"). */
export const CATEGORIES: readonly string[] = ["open", "strict"];
export const DEFAULT_CATEGORY = "open";

const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Reads the file's text (`""` when it is missing). Every missing field gets
 * its default, except `startedAt`: a file without a start time is no run.
 * Unknown fields are kept. A wrong-typed field, an unknown category or a newer
 * `v` is refused rather than overwritten, since a later write would destroy it.
 */
export function parseState(body: string): StateResult {
  const refuse = (error: string): StateResult => ({ ok: false, error: "state file " + error });
  if (body === "") return refuse("is missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return refuse("is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return refuse("is not an object");
  const raw = parsed as Record<string, unknown>;

  const v = raw.v ?? 1;
  if (!Number.isInteger(v) || (v as number) < 1) return refuse("has a bad version");
  if ((v as number) > STATE_VERSION) {
    return refuse(`is version ${v}, newer than this build's version ${STATE_VERSION}; refusing to run rather than damage it`);
  }
  if (!isNumber(raw.startedAt)) return refuse("has no startedAt");

  // Defaults first, in the schema's order, so the file reads the same way
  // whatever wrote it; the file's own values (and newer fields) then win.
  const state = {
    v,
    category: DEFAULT_CATEGORY,
    startedAt: raw.startedAt,
    buildSha: "unknown",
    updatedAt: raw.startedAt,
    milestone: null,
    splits: [],
    reloads: [],
    builds: [],
    installs: 0,
    resetAt: null,
    ...raw,
  } as unknown as RunState;

  for (const field of ["category", "buildSha"] as const) {
    if (typeof state[field] !== "string") return refuse(`field ${field} is not text`);
  }
  if (!CATEGORIES.includes(state.category)) {
    return refuse(`has category ${state.category}, which this build does not know`);
  }
  if (!isNumber(state.updatedAt)) return refuse("field updatedAt is not a number");
  if (state.milestone !== null && typeof state.milestone !== "string") return refuse("field milestone is not text");
  for (const field of ["splits", "reloads", "builds"] as const) {
    if (!Array.isArray(state[field])) return refuse(`field ${field} is not a list`);
  }
  if (!Number.isInteger(state.installs) || state.installs < 0) return refuse("field installs is not a count");
  if (state.resetAt !== null && !isNumber(state.resetAt)) return refuse("field resetAt is not a number");
  return { ok: true, state };
}

/**
 * The state once milestone `name` is reached at `nowMs`: it becomes the
 * `milestone` field, and a split is added with the time since the run started
 * (gross), the build running, the reload loss and installs so far, and `stats`.
 */
export function recordMilestone(state: RunState, name: string, nowMs: number, stats: SplitStats): RunState {
  const split: Split = {
    milestone: name,
    ms: nowMs - state.startedAt,
    build: currentBuild(state),
    lostMs: lostMs(state),
    installs: state.installs,
    stats,
  };
  return { ...state, milestone: name, splits: [...state.splits, split] };
}

/** The build running now: the last build change, or the one that started the run. */
export function currentBuild(state: RunState): string {
  const last = state.builds.at(-1) as { sha?: unknown } | null | undefined;
  return typeof last?.sha === "string" ? last.sha : state.buildSha;
}

/** A conductor start: when, and the heartbeat (`updatedAt`) the file held then. */
export type ConductorStart = { readonly atMs: number; readonly savedUpdatedAt: number };

/** The game's reset times (`getResetInfo`, read by the route probe). */
export type ResetTimes = { readonly lastAugReset: number; readonly lastNodeReset: number };

/**
 * The state once a conductor start is accounted for, given the game's reset
 * times (#49). Every boot with no live conductor starts one, so:
 *   - the run's first start (no `resetAt` yet) only notes the reset time;
 *   - a start after a reset the run hasn't seen (a new `lastAugReset`) counts
 *     an install when the BitNode didn't change with it, and is no loss;
 *   - any other start is a page reload (or a kill): it appends one reload
 *     record, the gap being the time since the saved heartbeat, which the
 *     reload rolled back to.
 */
export function accountStart(state: RunState, start: ConductorStart, reset: ResetTimes): RunState {
  if (state.resetAt === null) return { ...state, resetAt: reset.lastAugReset };
  if (reset.lastAugReset !== state.resetAt) {
    const installed = reset.lastAugReset > reset.lastNodeReset ? 1 : 0;
    return { ...state, installs: state.installs + installed, resetAt: reset.lastAugReset };
  }
  const reload: Reload = { atMs: start.atMs, gapMs: Math.max(0, start.atMs - start.savedUpdatedAt) };
  return { ...state, reloads: [...state.reloads, reload] };
}

/** Gross time (real time since the start) and net time (gross less reload loss). */
export type Times = { readonly grossMs: number; readonly netMs: number };

/** The run's time at `nowMs`. */
export function runTime(state: RunState, nowMs: number): Times {
  const grossMs = nowMs - state.startedAt;
  return { grossMs, netMs: grossMs - lostMs(state) };
}

/** A split's time. */
export function splitTime(split: Split): Times {
  return { grossMs: split.ms, netMs: split.ms - split.lostMs };
}

/**
 * The manifest boot.js fetched to home (boot.ts keeps the same name). Its
 * `source` is the main commit the files on home were built from.
 */
export const MANIFEST_FILE = "manifest.json";

/** The build on home, from the manifest's text; null when it can't be read. */
export function buildOnHome(manifestText: string): string | null {
  try {
    const source = (JSON.parse(manifestText) as { source?: unknown } | null)?.source;
    return typeof source === "string" ? source : null;
  } catch {
    return null;
  }
}

/**
 * The state once the conductor starts on build `sha` at `atMs`: a build
 * change appends `{ sha, fromMs }`. The same build, or an unknown one (null),
 * changes nothing.
 */
export function noteBuild(state: RunState, sha: string | null, atMs: number): RunState {
  if (sha === null || sha === currentBuild(state)) return state;
  const change: BuildRecord = { sha, fromMs: atMs };
  return { ...state, builds: [...state.builds, change] };
}

/** Reload loss so far: the sum of every reload's gap. A record it can't read counts as 0. */
export function lostMs(state: RunState): number {
  let sum = 0;
  for (const r of state.reloads) {
    const gap = (r as { gapMs?: unknown } | null)?.gapMs;
    if (isNumber(gap)) sum += gap;
  }
  return sum;
}

/**
 * Every milestone the run has recorded, in order: each split's milestone,
 * plus the `milestone` field. This is what makes a milestone count only once,
 * across reloads too, since the file rolls back with the save.
 */
export function reachedMilestones(state: RunState): string[] {
  const names: string[] = [];
  for (const split of state.splits) {
    const name = (split as { milestone?: unknown } | null)?.milestone;
    if (typeof name === "string" && !names.includes(name)) names.push(name);
  }
  if (state.milestone !== null && !names.includes(state.milestone)) names.push(state.milestone);
  return names;
}

/** The file's text for a state, unknown fields included. */
export function serializeState(state: RunState): string {
  return JSON.stringify(state);
}

/**
 * How often the conductor refreshes `updatedAt` when nothing else changed. The
 * spec asks for at least every 30 s; the conductor checks once a second or so,
 * and a tighter heartbeat measures a reload's gap more closely.
 */
export const REFRESH_MS = 10_000;

/** What the conductor last wrote, and when. */
export type Written = { readonly text: string; readonly atMs: number };

/**
 * Whether the conductor writes this iteration: on any change since `last`, and
 * at least every REFRESH_MS. Gives the state with `updatedAt` set to `nowMs`
 * and its text, or null when no write is due.
 */
export function stateWrite(
  state: RunState,
  last: Written | null,
  nowMs: number,
): { state: RunState; text: string } | null {
  if (last !== null && serializeState(state) === last.text && nowMs - last.atMs < REFRESH_MS) return null;
  const next = { ...state, updatedAt: nowMs };
  return { state: next, text: serializeState(next) };
}
