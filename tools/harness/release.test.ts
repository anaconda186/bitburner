import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../src/boot.ts";
import { localRelease, RAW_REPO } from "./release.ts";

const bytes = (s: string) => new TextEncoder().encode(s);
const BOOT = bytes("export async function main(ns) { ns.tprint('boot'); }\n");
const CONDUCTOR = bytes("export async function main(ns) { ns.tprint('conductor: up'); }\n");
const SOURCE = "0123456789abcdef0123456789abcdef01234567";

function build(): Map<string, Uint8Array> {
  return new Map([
    ["boot.js", BOOT],
    ["sr/conductor.js", CONDUCTOR],
  ]);
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("localRelease", () => {
  it("answers the start command's URL with the build's exact boot.js bytes", () => {
    const a = localRelease(build(), SOURCE).answer(`${RAW_REPO}release/boot.js`);
    expect(a?.status).toBe(200);
    expect(a?.body).toEqual(BOOT);
    expect(a?.headers["access-control-allow-origin"]).toBe("*");
  });

  it("serves a manifest boot.js accepts, hashing each file's bytes, from the release branch", () => {
    const r = localRelease(build(), SOURCE);
    const a = r.answer(`${RAW_REPO}release/manifest.json`);
    expect(a?.status).toBe(200);
    const parsed = parseManifest(text(a!.body));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.source).toBe(SOURCE);
    expect(parsed.manifest.sha).toBe(r.manifest.sha);
    expect(parsed.manifest.files).toEqual({
      "boot.js": createHash("sha256").update(BOOT).digest("hex"),
      "sr/conductor.js": createHash("sha256").update(CONDUCTOR).digest("hex"),
    });
  });

  it("serves every file from the URL pinned to the manifest's sha", () => {
    const r = localRelease(build(), SOURCE);
    const a = r.answer(`${RAW_REPO}${r.manifest.sha}/sr/conductor.js`);
    expect(a?.status).toBe(200);
    expect(a?.body).toEqual(CONDUCTOR);
  });

  it("answers 404 for an unknown file, another sha, or the manifest at the pinned sha", () => {
    const r = localRelease(build(), SOURCE);
    const other = "f".repeat(40);
    for (const url of [
      `${RAW_REPO}release/sr/nope.js`,
      `${RAW_REPO}${other}/sr/conductor.js`,
      `${RAW_REPO}${r.manifest.sha}/manifest.json`,
      `${RAW_REPO}main/boot.js`,
    ]) {
      const a = r.answer(url);
      expect(a?.status, url).toBe(404);
      expect(a?.headers["access-control-allow-origin"], url).toBe("*");
    }
  });

  it("leaves URLs outside the repo alone", () => {
    expect(localRelease(build(), SOURCE).answer("https://raw.githubusercontent.com/someone/else/release/boot.js")).toBeNull();
  });

  it("gives a different build a different sha, so boot.js refetches what changed", () => {
    const changed = build();
    changed.set("sr/conductor.js", bytes("export async function main(ns) {}\n"));
    expect(localRelease(changed, SOURCE).manifest.sha).not.toBe(localRelease(build(), SOURCE).manifest.sha);
    expect(localRelease(build(), SOURCE).manifest.sha).toBe(localRelease(build(), SOURCE).manifest.sha);
  });

  it("refuses a build outside the home layout, like publish", () => {
    const bad = build();
    bad.set("lib/x.js", bytes(""));
    expect(() => localRelease(bad, SOURCE)).toThrow(/outside the layout/);
  });
});
