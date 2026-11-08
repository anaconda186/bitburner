// A local stand-in for the `release` branch on raw.githubusercontent.com, so
// the smoke test runs the exact bytes `npm run build` produced, start command
// included, before anything is published. It answers what raw would for the
// release `publish` is about to push: the branch URL serves every file plus
// manifest.json, the manifest's `sha` URL serves the files (commit 1 of a
// publish has no manifest), and anything else is a 404. Every answer carries
// `access-control-allow-origin: *`, as raw does, since the game fetches
// cross-origin.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { checkLayout, RELEASE_BRANCH, type Manifest } from "../publish.ts";

export const RAW_REPO = "https://raw.githubusercontent.com/anaconda186/bitburner/";

export interface RawAnswer {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface LocalRelease {
  /** What `release/manifest.json` serves. */
  manifest: Manifest;
  /** The answer to a GET of `url`, or null when the URL is not under RAW_REPO. */
  answer(url: string): RawAnswer | null;
}

/**
 * `files` maps each built file's home path to its bytes. `source` is the main
 * commit the build came from. The release `sha` is made up from the file
 * hashes: stable for one build, different for any change, the way a new
 * publish gets a new commit.
 */
export function localRelease(files: ReadonlyMap<string, Uint8Array>, source: string): LocalRelease {
  checkLayout([...files.keys()]);
  const hashes = Object.fromEntries(
    [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, b]) => [path, createHash("sha256").update(b).digest("hex")]),
  );
  const sha = createHash("sha1").update(JSON.stringify(hashes)).digest("hex");
  const manifest: Manifest = { sha, source, files: hashes };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");

  const headers = (type: string) => ({ "access-control-allow-origin": "*", "content-type": type });
  const notFound: RawAnswer = { status: 404, headers: headers("text/plain; charset=utf-8"), body: new TextEncoder().encode("404: Not Found") };

  return {
    manifest,
    answer(url) {
      if (!url.startsWith(RAW_REPO)) return null;
      const [ref, ...rest] = url.slice(RAW_REPO.length).split(/[?#]/)[0]!.split("/");
      const path = rest.join("/");
      const ok = (body: Uint8Array): RawAnswer => ({ status: 200, headers: headers("text/plain; charset=utf-8"), body });
      if (ref === RELEASE_BRANCH && path === "manifest.json") return ok(manifestBytes);
      if (ref === RELEASE_BRANCH || ref === sha) {
        const body = files.get(path);
        if (body !== undefined) return ok(body);
      }
      return notFound;
    },
  };
}

/** Every file under `dir` as bytes, keyed by its path relative to it with `/` separators. */
export async function readBuildBytes(dir: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files.set(relative(dir, full).split(sep).join("/"), new Uint8Array(await readFile(full)));
  }
  return files;
}
