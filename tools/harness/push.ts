// The push watcher's rules: which built files go into the open game over the
// Remote API's pushFile, and what a dev build is called in the state file.
//
// pushFile writes the file on home at once; a script started later runs the
// new code (helpers are launched fresh every time), and a running one keeps
// its old code until it restarts. manifest.json goes too, so the conductor's
// next start (buildOnHome) records the pushed build.

import { createHash } from "node:crypto";
import type { Manifest } from "../publish.ts";
import { MANIFEST_FILE } from "../../src/sr/state.ts";

/** What has been pushed into one game: home path → sha256 of the bytes. */
export type Pushed = ReadonlyMap<string, string>;

export interface PushPlan {
  /** In order: changed scripts first, the manifest last. */
  files: { filename: string; content: string }[];
  /** What the game holds once every file is pushed. */
  pushed: Pushed;
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * The files to push for build `files` (home path → bytes) with `manifest`,
 * into a game that already holds `pushed` (null: nothing known, so push it
 * all). Files the build no longer has are left alone: nothing runs them.
 */
export function pushPlan(pushed: Pushed | null, files: ReadonlyMap<string, Uint8Array>, manifest: Manifest): PushPlan {
  const out: PushPlan["files"] = [];
  const now = new Map(pushed ?? []);
  const decoder = new TextDecoder();
  const all: [string, Uint8Array][] = [...[...files].sort(([a], [b]) => a.localeCompare(b)), [MANIFEST_FILE, new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n")]];
  for (const [filename, bytes] of all) {
    const hash = sha256(bytes);
    if (now.get(filename) === hash) continue;
    out.push({ filename, content: decoder.decode(bytes) });
    now.set(filename, hash);
  }
  return { files: out, pushed: now };
}

/**
 * The `source` a local build carries (the state file's build): the commit,
 * as for a release, when the tree is clean; otherwise the commit plus the
 * build's own hash, so every edited build is told apart.
 */
export function devSource(head: string, dirty: boolean, buildSha: string): string {
  return dirty ? `${head}-dirty-${buildSha.slice(0, 8)}` : head;
}
