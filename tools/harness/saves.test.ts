// Milestone saves and lab saves (seam F, the pure half): names, sidecars,
// what a save says about itself, and when the listener captures one.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseState, STATE_FILE } from "../../src/sr/state.ts";
import {
  captureRecord,
  LAB_MARKER,
  LAB_SAVES_DIR,
  loadScenarioSave,
  markLabSave,
  milestoneToCapture,
  SAVES_DIR,
  saveFacts,
  saveFileBase,
  scenarioStart,
  storeCapture,
} from "./saves.ts";

/**
 * A save the way v3.0.1 writes one (SaveObject.ts): gzip of
 * {ctor: "BitburnerSaveObject", data: {...}} where each data field is itself
 * a JSON string, PlayerSave and the servers being reviver objects.
 */
function gameSave(opts: { bitNodeN?: number; sourceFiles?: [number, number][]; exploits?: string[]; homeText?: Record<string, string> } = {}): Uint8Array {
  const player = {
    ctor: "PlayerObject",
    data: {
      bitNodeN: opts.bitNodeN ?? 1,
      sourceFiles: { ctor: "JSONMap", data: opts.sourceFiles ?? [] },
      exploits: opts.exploits ?? [],
      money: 1000,
    },
  };
  const textFiles = Object.entries(opts.homeText ?? {}).map(([filename, text]) => [filename, { ctor: "TextFile", data: { filename, text } }]);
  const servers = {
    home: { ctor: "Server", data: { hostname: "home", scripts: { ctor: "JSONMap", data: [] }, textFiles: { ctor: "JSONMap", data: textFiles } } },
    n00dles: { ctor: "Server", data: { hostname: "n00dles", textFiles: { ctor: "JSONMap", data: [] } } },
  };
  const save = { ctor: "BitburnerSaveObject", data: { PlayerSave: JSON.stringify(player), AllServersSave: JSON.stringify(servers), VersionSave: "44" } };
  return new Uint8Array(gzipSync(JSON.stringify(save)));
}

describe("saveFileBase", () => {
  it("names a spine milestone's files after it", () => {
    expect(saveFileBase("bn1.1")).toBe("bn1.1");
  });

  it("spells a scoped milestone's colon as ~, which Windows allows in a file name", () => {
    expect(saveFileBase("bn1.1:casino")).toBe("bn1.1~casino");
    expect(saveFileBase("bn6.blackops-start")).toBe("bn6.blackops-start");
  });

  it("refuses a name that can't be a file name both ways", () => {
    expect(() => saveFileBase("bn1.1:a/b")).toThrow(/milestone name/);
    expect(() => saveFileBase("bn1.1~x")).toThrow(/milestone name/);
    expect(() => saveFileBase("")).toThrow(/milestone name/);
  });
});

describe("saveFacts", () => {
  it("reads the BitNode and owned Source-Files a save is in", () => {
    expect(saveFacts(gameSave({ bitNodeN: 4, sourceFiles: [[1, 1], [4, 2]] }))).toEqual({ bitNodeN: 4, sourceFiles: { 1: 1, 4: 2 }, lab: false });
  });

  it("treats a save carrying an exploit flag as a lab save", () => {
    expect(saveFacts(gameSave({ exploits: ["EditSaveFile"] })).lab).toBe(true);
  });

  it("treats a save with the lab marker on home as a lab save", () => {
    expect(saveFacts(gameSave({ homeText: { [LAB_MARKER]: "made by hand" } })).lab).toBe(true);
    expect(saveFacts(gameSave({ homeText: { "notes.txt": "x" } })).lab).toBe(false);
  });

  it("refuses bytes that are not a game save", () => {
    expect(() => saveFacts(new Uint8Array(gzipSync("{}")))).toThrow(/not a Bitburner save/);
    expect(() => saveFacts(new TextEncoder().encode("hello"))).toThrow(/not a Bitburner save/);
  });
});

describe("markLabSave", () => {
  it("puts the marker on home, so the save and every save made from it later read as lab saves", () => {
    const marked = markLabSave(gameSave({ bitNodeN: 4, sourceFiles: [[1, 1]], homeText: { "notes.txt": "x" } }), "BN4 with SF1.1");
    expect(saveFacts(marked)).toEqual({ bitNodeN: 4, sourceFiles: { 1: 1 }, lab: true });
  });

  it("keeps a marked save marked", () => {
    const twice = markLabSave(markLabSave(gameSave(), "a"), "b");
    expect(saveFacts(twice).lab).toBe(true);
  });
});

/** A state file's text as the conductor writes it, with the milestones reached so far. */
function stateText(o: { startedAt?: number; milestones?: string[]; buildSha?: string; builds?: string[] } = {}): string {
  const milestones = o.milestones ?? [];
  return JSON.stringify({
    v: 1,
    category: "open",
    startedAt: o.startedAt ?? 1_000,
    buildSha: o.buildSha ?? "aaa",
    updatedAt: 50_000,
    milestone: milestones.at(-1) ?? null,
    splits: milestones.map((milestone, i) => ({ milestone, ms: 1000 * (i + 1) })),
    reloads: [],
    builds: (o.builds ?? []).map((sha, i) => ({ sha, fromMs: 2000 + i })),
  });
}
const state = (o: Parameters<typeof stateText>[0] = {}) => {
  const r = parseState(stateText(o));
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("milestoneToCapture", () => {
  it("captures when the listener sees the milestone change to a new one", () => {
    expect(milestoneToCapture(state(), state({ milestones: ["bn1.1"] }))).toBe("bn1.1");
    expect(milestoneToCapture(state({ milestones: ["bn1.1"] }), state({ milestones: ["bn1.1", "bn4.1", "bn4.2"] }))).toBe("bn4.2");
  });

  it("captures nothing on the listener's first reading: it didn't see the change", () => {
    expect(milestoneToCapture(null, state({ milestones: ["bn1.1"] }))).toBeNull();
  });

  it("captures nothing while the milestone stays the same", () => {
    expect(milestoneToCapture(state({ milestones: ["bn1.1"] }), state({ milestones: ["bn1.1"] }))).toBeNull();
  });

  it("captures nothing when a reload rolls the run back to a milestone it already had", () => {
    expect(milestoneToCapture(state({ milestones: ["bn1.1", "bn4.1"] }), state({ milestones: ["bn1.1"] }))).toBeNull();
  });

  it("starts over without capturing when another run is loaded", () => {
    expect(milestoneToCapture(state({ startedAt: 1 }), state({ startedAt: 2, milestones: ["bn4.1"] }))).toBeNull();
  });
});

describe("captureRecord", () => {
  const at = new Date("2026-11-07T10:00:00Z");

  it("files a save under saves/ by its milestone, with a sidecar of the build that reached it and the target version", () => {
    const bytes = gameSave({ bitNodeN: 4, sourceFiles: [[1, 1]], homeText: { [STATE_FILE]: stateText({ milestones: ["bn1.1"], buildSha: "aaa", builds: ["bbb"] }) } });
    expect(captureRecord(bytes, at)).toEqual({
      dir: SAVES_DIR,
      base: "bn1.1",
      sidecar: {
        kind: "milestone",
        milestone: "bn1.1",
        build: "bbb",
        gameVersion: "3.0.1",
        capturedAt: "2026-11-07T10:00:00.000Z",
        category: "open",
        startedAt: 1_000,
        bitNodeN: 4,
        sourceFiles: { 1: 1 },
      },
    });
  });

  it("files a save from a lab game under lab-saves/, never with the milestone saves", () => {
    const bytes = gameSave({ homeText: { [LAB_MARKER]: "x", [STATE_FILE]: stateText({ milestones: ["bn1.1:casino"] }) } });
    const r = captureRecord(bytes, at);
    expect(r.dir).toBe(LAB_SAVES_DIR);
    expect(r.base).toBe("bn1.1~casino");
    expect(r.sidecar.kind).toBe("lab");
  });

  it("round-trips: a captured milestone save is a scenario start", () => {
    const bytes = gameSave({ bitNodeN: 4, sourceFiles: [[1, 1]], homeText: { [STATE_FILE]: stateText({ milestones: ["bn1.1"] }) } });
    const r = scenarioStart(JSON.stringify(captureRecord(bytes, at).sidecar), bytes);
    expect(r.ok && { milestone: r.milestone, context: r.context, startedAt: r.state.startedAt }).toEqual({
      milestone: "bn1.1",
      context: { bitNodeN: 4, sourceFiles: { 1: 1 } },
      startedAt: 1_000,
    });
  });

  it("refuses a save whose state file has no milestone or can't be read", () => {
    expect(() => captureRecord(gameSave({ homeText: { [STATE_FILE]: stateText() } }), at)).toThrow(/no milestone/);
    expect(() => captureRecord(gameSave(), at)).toThrow(/state file/);
  });
});

describe("storeCapture and loadScenarioSave", () => {
  const withSave = (milestones: string[], money = 1, homeText: Record<string, string> = {}) =>
    gameSave({ homeText: { ...homeText, [STATE_FILE]: stateText({ milestones }), "money.txt": String(money) } });
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "saves-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores a capture as <name>.gz plus <name>.json, and regenerating replaces both", async () => {
    await storeCapture(root, withSave(["bn1.1"], 1), new Date("2026-01-01T00:00:00Z"));
    const second = withSave(["bn1.1"], 2);
    const where = await storeCapture(root, second, new Date("2026-02-01T00:00:00Z"));
    expect(where).toEqual({ dir: SAVES_DIR, base: "bn1.1", milestone: "bn1.1" });
    expect(await readdir(join(root, SAVES_DIR))).toEqual(["bn1.1.gz", "bn1.1.json"]);
    const loaded = await loadScenarioSave(root, "bn1.1");
    expect(loaded.ok && Buffer.from(loaded.bytes).equals(Buffer.from(second))).toBe(true);
    expect(JSON.parse(await readFile(join(root, SAVES_DIR, "bn1.1.json"), "utf8")).capturedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("keeps lab captures out of saves/, so a scenario can't start from one", async () => {
    const where = await storeCapture(root, withSave(["bn4.1"], 1, { [LAB_MARKER]: "x" }), new Date());
    expect(where.dir).toBe(LAB_SAVES_DIR);
    expect(await readdir(join(root, LAB_SAVES_DIR))).toEqual(["bn4.1.gz", "bn4.1.json"]);
    const loaded = await loadScenarioSave(root, "bn4.1");
    expect(loaded.ok ? "accepted" : loaded.error).toMatch(/no sidecar/);
  });
});

describe("scenarioStart", () => {
  const at = new Date("2026-11-07T10:00:00Z");
  const real = gameSave({ homeText: { [STATE_FILE]: stateText({ milestones: ["bn1.1"] }) } });
  const sidecar = (change: Record<string, unknown> = {}) => JSON.stringify({ ...captureRecord(real, at).sidecar, ...change });
  const refusal = (r: ReturnType<typeof scenarioStart>) => (r.ok ? "accepted" : r.error);

  it("refuses a lab save, whatever its sidecar says", () => {
    const lab = markLabSave(real, "edited");
    expect(refusal(scenarioStart(JSON.stringify(captureRecord(lab, at).sidecar), lab))).toMatch(/lab save/);
    expect(refusal(scenarioStart(sidecar(), lab))).toMatch(/lab save/);
    expect(refusal(scenarioStart(sidecar({ kind: "lab" }), real))).toMatch(/lab save/);
  });

  it("refuses a save with no sidecar or no save file", () => {
    expect(refusal(scenarioStart(null, real))).toMatch(/no sidecar/);
    expect(refusal(scenarioStart(sidecar(), null))).toMatch(/no save file/);
    expect(refusal(scenarioStart("{oops", real))).toMatch(/sidecar/);
  });

  it("refuses a save made for another target version", () => {
    expect(refusal(scenarioStart(sidecar({ gameVersion: "2.8.1" }), real))).toMatch(/2\.8\.1.*3\.0\.1/);
  });

  it("refuses a sidecar that doesn't belong to the save", () => {
    expect(refusal(scenarioStart(sidecar({ milestone: "bn4.1" }), real))).toMatch(/bn4\.1.*bn1\.1/);
  });
});
