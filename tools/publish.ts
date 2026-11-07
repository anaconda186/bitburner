// npm run publish-release -- [--build build] [--remote origin] [--source <sha>]
//
// Publishes a build folder to the orphan `release` branch of `remote` as two
// commits pushed together:
//   1. the built files, exactly as built;
//   2. the same tree plus manifest.json, recording commit 1's SHA (`sha`, the
//      ref for SHA-pinned raw URLs), the source commit (`source`) and each
//      file's sha256.
// Each publish's parent is the previous release tip, so every older pinned SHA
// stays reachable. The push is a plain fast-forward: if release moved since we
// read it, the push fails and nothing changes. Works through git plumbing and a
// throwaway index, so the caller's checkout, index and branches are untouched.
//
// Layout rule (the home layout): boot.js at the root, every other file under
// sr/. manifest.json is generated here, never built.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

export const RELEASE_BRANCH = "release";
export const RUN_FOLDER = "sr";

export type Manifest = {
  /** Release commit holding exactly these files: use it in SHA-pinned URLs. */
  sha: string;
  /** Source commit on main that the files were built from. */
  source: string;
  /** Every published file except manifest.json, path → sha256 of its bytes. */
  files: Record<string, string>;
};

export type PublishOptions = {
  buildDir: string;
  /** Any git repo to run plumbing in; only its object store is written to. */
  repoDir: string;
  /** Remote name or URL/path to push to. */
  remote: string;
  sourceSha: string;
  branch?: string;
};

const IDENTITY = {
  GIT_AUTHOR_NAME: "github-actions[bot]",
  GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
  GIT_COMMITTER_NAME: "github-actions[bot]",
  GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
};

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"))
    .sort();
}

/** Throws unless `files` follows the home layout. */
export function checkLayout(files: string[]): void {
  const bad = files.filter((f) => f !== "boot.js" && !f.startsWith(`${RUN_FOLDER}/`));
  if (bad.length) throw new Error(`publish: outside the layout (boot.js or ${RUN_FOLDER}/): ${bad.join(", ")}`);
  if (!files.includes("boot.js")) throw new Error("publish: the build has no boot.js");
}

export async function publishRelease(opts: PublishOptions): Promise<Manifest> {
  const branch = opts.branch ?? RELEASE_BRANCH;
  const files = await listFiles(opts.buildDir);
  checkLayout(files);

  const scratch = await mkdtemp(join(tmpdir(), "publish-index-"));
  const env = { ...process.env, ...IDENTITY, GIT_INDEX_FILE: join(scratch, "index") };
  const git = (args: string[], input?: string) =>
    execFileSync("git", args, { cwd: opts.repoDir, env, encoding: "utf8", input }).trim();

  try {
    const remoteHead = git(["ls-remote", "--heads", opts.remote, `refs/heads/${branch}`]);
    let parent: string | undefined;
    if (remoteHead) {
      git(["fetch", "-q", "--no-tags", opts.remote, `refs/heads/${branch}`]);
      parent = git(["rev-parse", "FETCH_HEAD"]);
    }

    const hashes: Record<string, string> = {};
    for (const f of files) {
      const bytes = await readFile(join(opts.buildDir, f));
      hashes[f] = createHash("sha256").update(bytes).digest("hex");
      // --no-filters: store the exact bytes, no line-ending conversion.
      const blob = git(["hash-object", "-w", "--no-filters", join(opts.buildDir, f)]);
      git(["update-index", "--add", "--cacheinfo", `100644,${blob},${f}`]);
    }
    const parentArgs = parent ? ["-p", parent] : [];
    const filesCommit = git(["commit-tree", git(["write-tree"]), ...parentArgs, "-m", `Build ${opts.sourceSha}`]);

    const manifest: Manifest = { sha: filesCommit, source: opts.sourceSha, files: hashes };
    const manifestBlob = git(["hash-object", "-w", "--stdin"], JSON.stringify(manifest, null, 2) + "\n");
    git(["update-index", "--add", "--cacheinfo", `100644,${manifestBlob},manifest.json`]);
    const releaseCommit = git(["commit-tree", git(["write-tree"]), "-p", filesCommit, "-m", `Manifest for ${opts.sourceSha}`]);

    git(["push", "-q", opts.remote, `${releaseCommit}:refs/heads/${branch}`]);
    return manifest;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      build: { type: "string", default: "build" },
      remote: { type: "string", default: "origin" },
      source: { type: "string" },
      branch: { type: "string", default: RELEASE_BRANCH },
    },
  });
  const sourceSha = values.source ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const m = await publishRelease({
    buildDir: values.build,
    repoDir: process.cwd(),
    remote: values.remote,
    sourceSha,
    branch: values.branch,
  });
  console.log(`publish: ${values.branch} now serves ${Object.keys(m.files).length} files from ${m.sha} (source ${m.source})`);
}
