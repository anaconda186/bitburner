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
  readonly splits: readonly unknown[];
  readonly reloads: readonly unknown[];
  readonly builds: readonly unknown[];
  readonly [newer: string]: unknown;
};

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
  return { ok: true, state };
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
