import { describe, expect, test } from "vitest";
import { filesToFetch, parseManifest, pinnedUrl, retryDelayMs, sha256Hex } from "./boot.ts";

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
