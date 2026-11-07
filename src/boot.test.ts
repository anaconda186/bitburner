import { describe, expect, test } from "vitest";
import {
  filesToFetch,
  parseBootArgs,
  parseManifest,
  pinnedUrl,
  retryDelayMs,
  runIsLive,
  sha256Hex,
  STATE_FILE as BOOT_STATE_FILE,
  stateOnBoot,
} from "./boot.ts";
import { CATEGORIES, parseState, STATE_FILE } from "./sr/state.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const SOURCE = "89abcdef0123456789abcdef0123456789abcdef";
// sha256 of "abc", "" and "x": FIPS 180-2 test vector and `printf '' | sha256sum`, `printf x | sha256sum`.
const H_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const H_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const H_X = "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881";

function manifestText(files: Record<string, string>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ sha: SHA, source: SOURCE, files, ...extra });
}

describe("parseManifest", () => {
  test("reads a published manifest", () => {
    const files = { "boot.js": H_ABC, "sr/conductor.js": H_X };
    expect(parseManifest(manifestText(files))).toEqual({
      ok: true,
      manifest: { sha: SHA, source: SOURCE, files },
    });
  });

  test("accepts fields a newer build added", () => {
    const r = parseManifest(manifestText({ "sr/conductor.js": H_X }, { entry: "sr/x.js", v: 2 }));
    expect(r.ok).toBe(true);
  });

  test.each([
    ["not JSON", "<!DOCTYPE html>"],
    ["empty", ""],
    ["no sha", JSON.stringify({ source: SOURCE, files: { "sr/conductor.js": H_X } })],
    ["a branch name for sha", JSON.stringify({ sha: "release", source: SOURCE, files: { "sr/conductor.js": H_X } })],
    ["no files", JSON.stringify({ sha: SHA, source: SOURCE })],
    ["a file hash that is not sha256", manifestText({ "sr/conductor.js": "abc" })],
    ["a path outside the home layout", manifestText({ "sr/conductor.js": H_X, "evil.js": H_X })],
    ["a path climbing out of sr/", manifestText({ "sr/conductor.js": H_X, "sr/../x.js": H_X })],
    ["no conductor to hand over to", manifestText({ "boot.js": H_ABC })],
  ])("refuses a manifest with %s", (_why, text) => {
    const r = parseManifest(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toBe("");
  });
});

describe("filesToFetch", () => {
  const files = { "boot.js": H_ABC, "sr/conductor.js": H_X, "sr/decide.js": H_EMPTY };
  const manifest = { sha: SHA, source: SOURCE, files };

  test("fetches every file on a fresh home", () => {
    expect(filesToFetch(manifest, {})).toEqual(["boot.js", "sr/conductor.js", "sr/decide.js"]);
  });

  test("fetches nothing when every file on home already has the manifest's hash", () => {
    expect(filesToFetch(manifest, { ...files })).toEqual([]);
  });

  test("fetches only the files whose hash changed or that are missing", () => {
    expect(filesToFetch(manifest, { "boot.js": H_ABC, "sr/conductor.js": H_ABC })).toEqual([
      "sr/conductor.js",
      "sr/decide.js",
    ]);
  });
});

describe("pinnedUrl", () => {
  test("points at the manifest's release commit, never at a branch", () => {
    expect(pinnedUrl(SHA, "sr/conductor.js")).toBe(
      `https://raw.githubusercontent.com/anaconda186/bitburner/${SHA}/sr/conductor.js`,
    );
  });
});

describe("retryDelayMs", () => {
  test("waits a second after the first failure and doubles after each further one", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  test("never waits more than 30 s, however many failures in a row", () => {
    expect(retryDelayMs(6)).toBe(30_000);
    expect(retryDelayMs(1000)).toBe(30_000);
  });
});

describe("sha256Hex", () => {
  test("hashes the UTF-8 bytes of a file's text, as publish does", async () => {
    expect(await sha256Hex("abc")).toBe(H_ABC);
    expect(await sha256Hex("")).toBe(H_EMPTY);
    // "é" is two UTF-8 bytes: `printf 'caf\xc3\xa9' | sha256sum`
    expect(await sha256Hex("café")).toBe("850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e");
  });
});

describe("runIsLive: what a boot sees on home", () => {
  const me = 7;
  const proc = (filename: string, pid: number) => ({ filename, pid });

  test("a boot alone on home starts the run", () => {
    expect(runIsLive([proc("boot.js", me)], me)).toBe(false);
  });

  test("a running conductor means the run is live", () => {
    expect(runIsLive([proc("sr/conductor.js", 3), proc("boot.js", me)], me)).toBe(true);
  });

  test("an earlier boot still at work means the run is live", () => {
    expect(runIsLive([proc("boot.js", 5), proc("boot.js", me)], me)).toBe(true);
  });

  test("of two boots started together, only the later one stands down", () => {
    // The earlier one sees a later boot and carries on, so exactly one boot runs.
    expect(runIsLive([proc("boot.js", 5), proc("boot.js", me)], 5)).toBe(false);
  });

  test("other scripts on home do not count", () => {
    expect(runIsLive([proc("sr/casino.js", 2), proc("sr/x.js", 1), proc("boot.js", me)], me)).toBe(false);
  });
});

describe("parseBootArgs: the category argument", () => {
  test("no argument leaves the category to the run (open for a new one)", () => {
    expect(parseBootArgs([])).toEqual({ ok: true, category: undefined });
  });

  test.each([
    [["--category", "strict"], "strict"],
    [["--category=strict"], "strict"],
    [["--category", "open"], "open"],
  ])("%j asks for %s", (args, category) => {
    expect(parseBootArgs(args)).toEqual({ ok: true, category });
  });

  test("accepts every category the state file knows", () => {
    for (const c of CATEGORIES) expect(parseBootArgs(["--category", c])).toEqual({ ok: true, category: c });
  });

  test.each([
    [["--category", "any%"], "boot: unknown category any% (open, strict)"],
    [["--category"], "boot: --category needs a value (open, strict)"],
    [["strict"], "boot: unknown argument strict; usage: run boot.js [--category open|strict]"],
    [[3], "boot: unknown argument 3; usage: run boot.js [--category open|strict]"],
  ])("%j is refused", (args, error) => {
    expect(parseBootArgs(args)).toEqual({ ok: false, error });
  });
});

describe("stateOnBoot: the state file at boot", () => {
  const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
  const existing = (category: string) =>
    JSON.stringify({ v: 1, category, startedAt: T0 - 3_600_000, buildSha: SOURCE, updatedAt: T0 - 50_000 });

  test("a fresh run creates a file the conductor reads, started now, open by default", () => {
    const r = stateOnBoot("", undefined, SOURCE, T0);
    expect(r.warning).toBeNull();
    expect(parseState(r.create ?? "")).toEqual({
      ok: true,
      state: {
        v: 1, category: "open", startedAt: T0, buildSha: SOURCE, updatedAt: T0,
        milestone: null, splits: [], reloads: [], builds: [],
      },
    });
  });

  test("boot creates the file where the conductor reads it", () => {
    expect(BOOT_STATE_FILE).toBe(STATE_FILE);
  });

  test("a fresh run records the category asked for", () => {
    const r = parseState(stateOnBoot("", "strict", SOURCE, T0).create ?? "");
    expect(r.ok && r.state.category).toBe("strict");
  });

  test("a category given against an existing run is ignored with a warning", () => {
    expect(stateOnBoot(existing("open"), "strict", SOURCE, T0)).toEqual({
      create: null,
      warning: "WARN boot: this run is category open; --category strict ignored",
    });
  });

  test.each([undefined, "open"])("resuming an open run with %s writes nothing and warns of nothing", (asked) => {
    expect(stateOnBoot(existing("open"), asked, SOURCE, T0)).toEqual({ create: null, warning: null });
  });

  test("a file boot cannot read is left alone, for the conductor to report", () => {
    expect(stateOnBoot("{", "strict", SOURCE, T0)).toEqual({ create: null, warning: null });
  });
});
