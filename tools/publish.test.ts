import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { publishRelease } from "./publish.ts";

// Contents and their sha256, computed independently with `printf '...' | sha256sum`.
const BOOT = "export async function main(ns) { ns.tprint('hi'); }\n";
const BOOT_SHA = "80b9ee04c3514129ced4966e715ffaa99adccf00374718014e21908616221add";
const A1 = "export const a = 1;\n";
const A1_SHA = "037ecd1db38c230c248787e60fd7bfc0cb0101b187b59535b6e7483be762d350";
const A2 = "export const a = 2;\n";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function buildDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "build-"));
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), body);
  }
  return dir;
}

type Manifest = { sha: string; source: string; files: Record<string, string> };

let remote: string;
let work: string;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "publish-"));
  remote = join(root, "remote.git");
  work = join(root, "work");
  git(root, "init", "-q", "--bare", remote);
  git(root, "init", "-q", work);
});

const releaseFiles = () => git(remote, "ls-tree", "-r", "--name-only", "release").split("\n");
const releaseManifest = (): Manifest => JSON.parse(git(remote, "show", "release:manifest.json"));

describe("publishRelease", () => {
  test("puts only the built files on the release branch, with boot.js and manifest.json at the root", async () => {
    const build = await buildDir({ "boot.js": BOOT, "sr/a.js": A1 });
    await publishRelease({ buildDir: build, repoDir: work, remote, sourceSha: "c0ffee" });
    expect(releaseFiles()).toEqual(["boot.js", "manifest.json", "sr/a.js"]);
  });

  test("the manifest records the source commit and each file's sha256", async () => {
    const build = await buildDir({ "boot.js": BOOT, "sr/a.js": A1 });
    await publishRelease({ buildDir: build, repoDir: work, remote, sourceSha: "c0ffee" });
    const m = releaseManifest();
    expect(m.source).toBe("c0ffee");
    expect(m.files).toEqual({ "boot.js": BOOT_SHA, "sr/a.js": A1_SHA });
  });

  test("the manifest's sha is a release commit holding exactly those bytes, so SHA-pinned URLs work", async () => {
    const build = await buildDir({ "boot.js": BOOT, "sr/a.js": A1 });
    await publishRelease({ buildDir: build, repoDir: work, remote, sourceSha: "c0ffee" });
    const { sha } = releaseManifest();
    expect(git(remote, "show", `${sha}:sr/a.js`) + "\n").toBe(A1);
    expect(git(remote, "show", `${sha}:boot.js`) + "\n").toBe(BOOT);
    expect(git(remote, "merge-base", "--is-ancestor", sha, "release")).toBe("");
  });

  test("a later publish moves release forward and keeps earlier pinned commits reachable", async () => {
    await publishRelease({ buildDir: await buildDir({ "boot.js": BOOT, "sr/a.js": A1 }), repoDir: work, remote, sourceSha: "one" });
    const first = releaseManifest().sha;
    await publishRelease({ buildDir: await buildDir({ "boot.js": BOOT, "sr/a.js": A2 }), repoDir: work, remote, sourceSha: "two" });
    const second = releaseManifest();
    expect(second.source).toBe("two");
    expect(git(remote, "show", "release:sr/a.js") + "\n").toBe(A2);
    expect(git(remote, "show", `${first}:sr/a.js`) + "\n").toBe(A1);
    expect(git(remote, "merge-base", "--is-ancestor", first, "release")).toBe("");
  });

  test.each([
    ["a file outside sr/ at the root", { "boot.js": BOOT, "extra.js": A1 }],
    ["no boot.js", { "sr/a.js": A1 }],
    ["a manifest.json of its own", { "boot.js": BOOT, "manifest.json": "{}" }],
    ["a second top-level folder", { "boot.js": BOOT, "lib/a.js": A1 }],
  ])("refuses a build with %s and leaves the previous release in place", async (_why, files) => {
    await publishRelease({ buildDir: await buildDir({ "boot.js": BOOT, "sr/a.js": A1 }), repoDir: work, remote, sourceSha: "good" });
    const before = git(remote, "rev-parse", "release");
    await expect(
      publishRelease({ buildDir: await buildDir(files), repoDir: work, remote, sourceSha: "bad" }),
    ).rejects.toThrow();
    expect(git(remote, "rev-parse", "release")).toBe(before);
  });

  test("leaves the working repo's branches, index and files untouched", async () => {
    await writeFile(join(work, "README.md"), "source\n");
    git(work, "add", "README.md");
    git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "source");
    const head = git(work, "rev-parse", "HEAD");
    await publishRelease({ buildDir: await buildDir({ "boot.js": BOOT }), repoDir: work, remote, sourceSha: head });
    expect(git(work, "rev-parse", "HEAD")).toBe(head);
    expect(git(work, "status", "--porcelain")).toBe("");
    // release is an orphan: none of the source history is in it
    expect(git(remote, "rev-list", "release").split("\n")).not.toContain(head);
  });
});
