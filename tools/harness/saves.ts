// Milestone saves and lab saves on disk.
//
// - A milestone save is captured by the dev loop's listener when the state
//   file's `milestone` changes: the game's own save (getSaveFile, gzip) at
//   saves/<name>.gz, plus a sidecar saves/<name>.json recording the milestone,
//   the build that reached it and the target version. Capturing again
//   replaces both.
// - A lab save (GLOSSARY) is made to measure the game and may be edited. It
//   lives apart, under lab-saves/, and is never a scenario start.

import { gunzipSync, gzipSync } from "node:zlib";
import { currentBuild, parseState, reachedMilestones, STATE_FILE, type RunState } from "../../src/sr/state.ts";
import { GAME_VERSION } from "../game-pin.ts";

/** Milestone saves, relative to the repo root. Committed. */
export const SAVES_DIR = "saves";
/** Lab saves, relative to the repo root: never mixed with the milestone saves. */
export const LAB_SAVES_DIR = "lab-saves";

/** A milestone name as a file name: `:` becomes `~`; anything else outside [A-Za-z0-9._-] is refused. */
export function saveFileBase(milestone: string): string {
  if (!/^[A-Za-z0-9._-]+(:[A-Za-z0-9._-]+)*$/.test(milestone)) throw new Error(`not a milestone name for a save file: ${JSON.stringify(milestone)}`);
  return milestone.replaceAll(":", "~");
}

/**
 * A text file on home that marks a lab save. Home keeps text files through
 * installs and BitNode entries (v3.0.1 prestigeHomeComputer resets only
 * programs and messages), so every save made later in a game that started
 * from a lab save carries it too, and the listener never takes one of those
 * for a milestone save.
 */
export const LAB_MARKER = "lab-save.txt";

/** What a save says about itself. */
export interface SaveFacts {
  /** The BitNode it is in. */
  bitNodeN: number;
  /** Owned Source-File levels by number (what the RAM calculator reads). */
  sourceFiles: Record<number, number>;
  /** It carries the lab marker or a game exploit flag. */
  lab: boolean;
}

type Json = Record<string, unknown>;

interface SaveJson {
  save: { ctor: string; data: Record<string, string> };
  player: Json;
  servers: Record<string, { ctor: string; data: Json }>;
}

function notASave(why: string): never {
  throw new Error(`not a Bitburner save: ${why}`);
}

function decode(bytes: Uint8Array): SaveJson {
  let save: SaveJson["save"] | undefined;
  try {
    save = JSON.parse(gunzipSync(bytes).toString("utf8")) as SaveJson["save"];
  } catch {
    notASave("not the gzip of a JSON document");
  }
  if (save?.ctor !== "BitburnerSaveObject" || typeof save.data?.PlayerSave !== "string" || typeof save.data.AllServersSave !== "string")
    notASave("no BitburnerSaveObject with PlayerSave and AllServersSave");
  const player = (JSON.parse(save.data.PlayerSave) as { data?: Json }).data;
  if (typeof player?.bitNodeN !== "number") notASave("PlayerSave has no bitNodeN");
  return { save, player, servers: JSON.parse(save.data.AllServersSave) as SaveJson["servers"] };
}

function encode(s: SaveJson): Uint8Array {
  const player = JSON.parse(s.save.data.PlayerSave!) as { data: Json };
  player.data = s.player;
  const data = { ...s.save.data, PlayerSave: JSON.stringify(player), AllServersSave: JSON.stringify(s.servers) };
  return new Uint8Array(gzipSync(JSON.stringify({ ...s.save, data })));
}

/** The [key, value] pairs of a saved JSONMap; [] for anything else. */
function mapEntries(m: unknown): [string, unknown][] {
  const data = (m as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(data) ? (data as [string, unknown][]) : [];
}

function homeTextFiles(s: SaveJson): [string, unknown][] {
  return mapEntries(s.servers.home?.data.textFiles);
}

/** The game's save bytes (gzip, as getSaveFile and IndexedDB hold them) → what it says about itself. */
export function saveFacts(bytes: Uint8Array): SaveFacts {
  const s = decode(bytes);
  const sourceFiles: Record<number, number> = {};
  for (const [n, level] of mapEntries(s.player.sourceFiles)) sourceFiles[Number(n)] = Number(level);
  const exploits = Array.isArray(s.player.exploits) ? s.player.exploits : [];
  const marked = homeTextFiles(s).some(([name]) => name === LAB_MARKER);
  return { bitNodeN: s.player.bitNodeN as number, sourceFiles, lab: marked || exploits.length > 0 };
}

/** The run's state file as the save holds it on home. Throws if it is missing or unreadable. */
export function savedState(bytes: Uint8Array): RunState {
  const file = homeTextFiles(decode(bytes)).find(([name]) => name === STATE_FILE)?.[1] as { data?: { text?: unknown } } | undefined;
  const text = file?.data?.text;
  const r = parseState(typeof text === "string" ? text : "");
  if (!r.ok) throw new Error(`the save's ${r.error}`);
  return r.state;
}

/**
 * The listener's rule: the milestone to capture now that the state file reads
 * `now`, having read `seen` last (null: this is its first reading). Only a
 * change it saw to a milestone the run hadn't reached counts: not its first
 * reading, not a reload rolling back to an earlier milestone, and not another
 * run being loaded (a different `startedAt`). When one loop records several
 * milestones, the save is the same for all of them, filed under the last.
 */
export function milestoneToCapture(seen: RunState | null, now: RunState): string | null {
  if (seen === null || now.milestone === null || seen.startedAt !== now.startedAt) return null;
  return reachedMilestones(seen).includes(now.milestone) ? null : now.milestone;
}

/** The record beside every milestone or lab save, `<base>.json`. */
export interface Sidecar {
  kind: "milestone" | "lab";
  milestone: string;
  /** The build that reached it: the state file's current build. */
  build: string;
  /** The target version the save was made with. */
  gameVersion: string;
  /** ISO time of the capture. */
  capturedAt: string;
  category: string;
  /** The run's `startedAt`. */
  startedAt: number;
  bitNodeN: number;
  sourceFiles: Record<number, number>;
}

export interface CaptureRecord {
  /** SAVES_DIR, or LAB_SAVES_DIR for a lab game's save. */
  dir: string;
  /** File name without extension: `<base>.gz` and `<base>.json`. */
  base: string;
  sidecar: Sidecar;
}

/**
 * Where a captured save goes and what its sidecar says, all read from the
 * save itself: the milestone and build from the state file inside it, the
 * BitNode, Source-Files and lab mark from the player and home.
 */
export function captureRecord(bytes: Uint8Array, at: Date): CaptureRecord {
  const facts = saveFacts(bytes);
  const state = savedState(bytes);
  if (state.milestone === null) throw new Error("the save's state file has no milestone yet");
  return {
    dir: facts.lab ? LAB_SAVES_DIR : SAVES_DIR,
    base: saveFileBase(state.milestone),
    sidecar: {
      kind: facts.lab ? "lab" : "milestone",
      milestone: state.milestone,
      build: currentBuild(state),
      gameVersion: GAME_VERSION,
      capturedAt: at.toISOString(),
      category: state.category,
      startedAt: state.startedAt,
      bitNodeN: facts.bitNodeN,
      sourceFiles: facts.sourceFiles,
    },
  };
}

/** The save with the lab marker on home (dev only: this is a save edit). `note` is the marker's text. */
export function markLabSave(bytes: Uint8Array, note: string): Uint8Array {
  const s = decode(bytes);
  const home = s.servers.home ?? notASave("no home server");
  const files = homeTextFiles(s).filter(([name]) => name !== LAB_MARKER);
  files.push([LAB_MARKER, { ctor: "TextFile", data: { filename: LAB_MARKER, text: `lab save: ${note}\n` } }]);
  home.data.textFiles = { ctor: "JSONMap", data: files };
  return encode(s);
}
