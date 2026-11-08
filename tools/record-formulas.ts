// npm run record-formulas [-- --out test/golden/formulas.json] [--headed]
//
// Dev only. Records the formula model's golden values (seam D) in the real
// v3.0.1 game: a new game is saved, edited into lab saves that own
// Formulas.exe (tools/golden/lab-save.ts), and in each one
// tools/golden/formulas-recorder.ts runs ns.formulas.* over the save's
// servers. The results go into one JSON fixture that src/sr/formulas.test.ts
// checks the model against. Nothing here is part of a release, and no run
// script calls ns.formulas (test/no-formulas.test.ts).
//
// Lab saves:
// - BN1 with SF5.1: every BitNode multiplier is 1, and SF5 makes
//   ns.getBitNodeMultipliers readable so the fixture records them.
// - BN12 with SF12.29 (so BN12 level 30) and SF5.1: most hacking multipliers
//   are 1.02^±30, which covers multipliers other than 1 from the game itself.

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { transform } from "esbuild";
import { GAME_DIR } from "./fetch-game.ts";
import {
  connectRemoteApi,
  exitTutorial,
  loadGame,
  openBrowser,
  readSave,
  saveGame,
  seedSave,
  serveGame,
  terminalLines,
  typeLine,
} from "./harness/game.ts";
import { localRelease } from "./harness/release.ts";
import { RemoteApiError, startRemoteApi } from "./harness/remote-api.ts";
import { OUT_FILE } from "./golden/formulas-recorder.ts";
import { editLabSave, type LabSetup } from "./golden/lab-save.ts";

const ROOT = resolve(import.meta.dirname, "..");
const RECORDER_SOURCE = join(ROOT, "tools", "golden", "formulas-recorder.ts");
const RECORDER_ON_HOME = "golden-recorder.js";
const OUT_ON_HOME = OUT_FILE;

const LABS: { name: string; setup: LabSetup }[] = [
  { name: "BN1 (multipliers 1)", setup: { bitNodeN: 1, sourceFiles: [[5, 1]] } },
  { name: "BN12 level 30", setup: { bitNodeN: 12, sourceFiles: [[5, 1], [12, 29]] } },
];

const { values: args } = parseArgs({
  options: {
    out: { type: "string", default: join(ROOT, "test", "golden", "formulas.json") },
    game: { type: "string", default: join(GAME_DIR, "app") },
    headed: { type: "boolean", default: false },
  },
});

const recorderJs = (await transform(await readFile(RECORDER_SOURCE, "utf8"), { loader: "ts", format: "esm", tsconfigRaw: {} })).code;

const game = await serveGame(args.game);
const api = await startRemoteApi();
// Nothing is downloaded; openBrowser just needs a release to route raw URLs to.
const release = localRelease(new Map([["boot.js", new Uint8Array()]]), "0".repeat(40));
const contexts: unknown[] = [];
try {
  // A new game, saved once, is the base of every lab save.
  let base: Uint8Array | null;
  {
    const s = await openBrowser(release, { headless: !args.headed });
    try {
      await loadGame(s.page, game.url);
      await exitTutorial(s.page);
      await connectRemoteApi(s.page, api.port);
      if (!(await api.waitForGame(15_000))) throw new Error("the game never connected to the Remote API");
      await saveGame(s.page);
      base = await readSave(s.page);
    } finally {
      await s.close();
    }
  }
  if (!base) throw new Error("no save in IndexedDB after saving");

  for (const lab of LABS) {
    const s = await openBrowser(release, { headless: !args.headed });
    try {
      await seedSave(s.page, game.url, editLabSave(base, lab.setup));
      const since = api.connections();
      await loadGame(s.page, game.url);
      await connectRemoteApi(s.page, api.port);
      if (!(await api.waitForGame(15_000, since))) throw new Error(`${lab.name}: the game never reconnected`);
      await api.call("pushFile", { filename: RECORDER_ON_HOME, content: recorderJs, server: "home" });
      await typeLine(s.page, `run ${RECORDER_ON_HOME}`);
      const text = await waitForFile(OUT_ON_HOME, 60_000);
      if (text === null) {
        const lines = (await terminalLines(s.page)).map((l) => l.text).slice(-15);
        throw new Error(`${lab.name}: no ${OUT_ON_HOME} within 60 s. Terminal:\n${lines.join("\n")}`);
      }
      if (s.pageErrors.length > 0) throw new Error(`${lab.name}: page errors: ${s.pageErrors.join("; ")}`);
      const recorded = JSON.parse(text) as { bitNodeN: number; hacking: unknown[] };
      if (recorded.bitNodeN !== lab.setup.bitNodeN) throw new Error(`${lab.name}: recorded in BN${recorded.bitNodeN}`);
      console.log(`record-formulas: ${lab.name}: ${recorded.hacking.length} hacking cases`);
      contexts.push({ name: lab.name, ...recorded });
    } finally {
      await s.close();
    }
  }
} finally {
  await api.close();
  await game.close();
}

const fixture = {
  about: "Golden values for src/sr/formulas.ts, from ns.formulas.* in Bitburner v3.0.1 on lab saves. Written by `npm run record-formulas`; do not edit by hand.",
  game: "3.0.1",
  contexts,
};
await writeFile(args.out, layout(fixture));
console.log(`record-formulas: wrote ${args.out}`);

async function waitForFile(filename: string, timeoutMs: number): Promise<string | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      return await api.getFile(filename);
    } catch (e) {
      if (!(e instanceof RemoteApiError)) throw e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/** JSON with one record per line, so a re-recording diffs line by line. */
function layout(value: unknown, indent = ""): string {
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== "object" || v === null)) return JSON.stringify(value);
    const inner = indent + "  ";
    // A record holds no list of objects; anything that does is laid out further.
    const holdsRecords = (v: unknown) =>
      typeof v === "object" && v !== null && Object.values(v).some((x) => Array.isArray(x) && x.some((y) => typeof y === "object"));
    const item = (v: unknown) => inner + (holdsRecords(v) ? layout(v, inner) : JSON.stringify(v));
    return `[\n${value.map(item).join(",\n")}\n${indent}]`;
  }
  if (typeof value === "object" && value !== null) {
    const inner = indent + "  ";
    const fields = Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${layout(v, inner)}`);
    return `{\n${fields.join(",\n")}\n${indent}}` + (indent === "" ? "\n" : "");
  }
  return JSON.stringify(value);
}
