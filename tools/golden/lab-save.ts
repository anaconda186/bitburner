// Lab-save edits for the golden-value recorder (dev only; a lab save is never
// a milestone save or part of a run). A v3.0.1 save is the gzip of
// {"ctor":"BitburnerSaveObject","data":{PlayerSave, AllServersSave, ...}},
// where each field is itself a JSON string (src/SaveObject.ts:190-233).
import { gunzipSync, gzipSync } from "node:zlib";

export interface LabSetup {
  /** The BitNode the save is in. Its multipliers are applied on load (src/engine.tsx:249). */
  bitNodeN: number;
  /** Owned Source-Files as [n, level]. */
  sourceFiles: [number, number][];
}

/** Enough home RAM for the recorder script (about 10 GB). */
export const LAB_HOME_RAM = 64;

interface Reviver {
  ctor: string;
  data: Record<string, unknown>;
}

/**
 * Puts Formulas.exe on home and gives it LAB_HOME_RAM GB for the recorder (the formulas API checks home's program list,
 * src/NetscriptFunctions/Formulas.ts:61-65) and sets the BitNode and the
 * Source-Files. Takes and returns the decompressed save text.
 */
export function editLabSaveText(text: string, setup: LabSetup): string {
  const save = JSON.parse(text) as { ctor: string; data: Record<string, string> };
  if (save.ctor !== "BitburnerSaveObject") throw new Error(`not a save: ctor ${save.ctor}`);
  const player = JSON.parse(save.data.PlayerSave!) as Reviver;
  player.data.bitNodeN = setup.bitNodeN;
  player.data.sourceFiles = { ctor: "JSONMap", data: setup.sourceFiles };
  save.data.PlayerSave = JSON.stringify(player);
  const servers = JSON.parse(save.data.AllServersSave!) as Record<string, Reviver>;
  const home = servers.home;
  if (!home) throw new Error("the save has no home server");
  const programs = home.data.programs as string[];
  if (!programs.includes("Formulas.exe")) programs.push("Formulas.exe");
  home.data.maxRam = Math.max(Number(home.data.maxRam), LAB_HOME_RAM);
  save.data.AllServersSave = JSON.stringify(servers);
  return JSON.stringify(save);
}

/** The same edit on the save's bytes as IndexedDB holds them (gzip). */
export function editLabSave(bytes: Uint8Array, setup: LabSetup): Uint8Array {
  const text = gunzipSync(bytes).toString("utf8");
  return new Uint8Array(gzipSync(Buffer.from(editLabSaveText(text, setup), "utf8")));
}
