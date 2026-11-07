// boot.js: brings home up to the current release, then hands over to the
// conductor. Every way into a run goes through here (the start command,
// autoexec, reset callbacks, the driver's atExit timer).
//
//   1. Fetch manifest.json from the `release` branch (the one mutable URL).
//   2. Hash every listed file already on home; fetch only those whose sha256
//      differs from the manifest's, from URLs pinned to the manifest's release
//      commit, so one boot always gets one consistent build.
//   3. Retry the manifest and any failed file forever, printing each failure,
//      with backoff capped at about 30 s: no human may help mid-run.
//   4. Once every file is present, spawn the conductor (temporary, spawnDelay
//      0, so this script's RAM is freed before the conductor starts). boot.js
//      itself is the one script started non-temporary, by the terminal.
//
// Rules for this file (see docs/agents/project-layout.md):
// - It imports nothing at runtime: the game charges RAM for imported files.
// - The game's static RAM check charges any identifier whose name matches an
//   NS function, wherever it appears (`attempt` would cost 10 GB, as
//   codingcontract.attempt). Name things with care; the RAM budget gate checks.
// - Older copies of this file live on in players' saves and read new
//   manifests, so `sr/conductor.js` is a fixed entry point and the manifest
//   shape only ever grows.
import type { NS } from "@ns";

const RAW = "https://raw.githubusercontent.com/anaconda186/bitburner/";
export const MANIFEST_URL = RAW + "release/manifest.json";
export const MANIFEST_FILE = "manifest.json";
export const CONDUCTOR = "sr/conductor.js";

export type Manifest = {
  /** Release commit holding exactly these files: the ref for pinned URLs. */
  readonly sha: string;
  /** Main commit the build came from. */
  readonly source: string;
  /** Every published file except manifest.json, path → sha256 of its bytes. */
  readonly files: Readonly<Record<string, string>>;
};

export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; error: string };

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// The home layout: boot.js at the root, everything else under sr/.
const HOME_PATH = /^(boot\.js|sr\/(?:[\w.-]+\/)*[\w.-]+\.(?:js|json|txt))$/;

/** Checks a downloaded manifest; unknown fields are allowed and ignored. */
export function parseManifest(body: string): ManifestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, error: "manifest is not JSON" };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "manifest is not an object" };
  const { sha, source, files } = raw as Record<string, unknown>;
  if (typeof sha !== "string" || !COMMIT.test(sha)) return { ok: false, error: "manifest has no commit sha" };
  if (typeof source !== "string") return { ok: false, error: "manifest has no source commit" };
  if (typeof files !== "object" || files === null) return { ok: false, error: "manifest has no file list" };
  const checked: Record<string, string> = {};
  for (const [name, hash] of Object.entries(files)) {
    if (!HOME_PATH.test(name) || name.split("/").includes("..")) {
      return { ok: false, error: `manifest lists ${name}, outside the home layout` };
    }
    if (typeof hash !== "string" || !SHA256.test(hash)) {
      return { ok: false, error: `manifest has no sha256 for ${name}` };
    }
    checked[name] = hash;
  }
  if (!(CONDUCTOR in checked)) return { ok: false, error: `manifest does not list ${CONDUCTOR}` };
  return { ok: true, manifest: { sha, source, files: checked } };
}

/**
 * The manifest's files that home lacks or holds with a different hash, in
 * manifest order. `onHome` maps a path to the sha256 of the copy on home.
 */
export function filesToFetch(manifest: Manifest, onHome: Readonly<Record<string, string | undefined>>): string[] {
  return Object.keys(manifest.files).filter((name) => onHome[name] !== manifest.files[name]);
}

/** A file's URL at one release commit: immutable, unlike the branch URL. */
export function pinnedUrl(commit: string, name: string): string {
  return RAW + commit + "/" + name;
}

/**
 * How long to wait after `failures` consecutive failures (1 or more). A copy
 * of sr/backoff.ts's backoffMs, since this file may import nothing.
 */
export function retryDelayMs(failures: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, failures - 1));
}

/** sha256 of a string's UTF-8 bytes, as lowercase hex. */
export async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchManifest(ns: NS): Promise<Manifest> {
  for (let failures = 1; ; failures++) {
    let error = "download failed";
    if (await ns.wget(MANIFEST_URL, MANIFEST_FILE)) {
      const parsed = parseManifest(ns.read(MANIFEST_FILE));
      if (parsed.ok) return parsed.manifest;
      error = parsed.error;
    }
    const pause = retryDelayMs(failures);
    ns.tprint(`WARN boot: ${MANIFEST_URL}: ${error}; retry ${failures} in ${pause / 1000} s`);
    await ns.sleep(pause);
  }
}

/** sha256 of each listed file on home; a missing (or empty) file has none. */
async function hashesOnHome(ns: NS, manifest: Manifest): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const name of Object.keys(manifest.files)) {
    const body = ns.read(name);
    if (body !== "") hashes[name] = await sha256Hex(body);
  }
  return hashes;
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const manifest = await fetchManifest(ns);
  let fetched = 0;
  for (let failures = 1; ; failures++) {
    const wanted = filesToFetch(manifest, await hashesOnHome(ns, manifest));
    if (wanted.length === 0) break;
    const got = await Promise.all(wanted.map((name) => ns.wget(pinnedUrl(manifest.sha, name), name)));
    fetched += got.filter(Boolean).length;
    const missed = wanted.filter((_, i) => !got[i]);
    if (missed.length === 0) break;
    const pause = retryDelayMs(failures);
    for (const name of missed) {
      ns.tprint(`WARN boot: ${pinnedUrl(manifest.sha, name)}: download failed; retry ${failures} in ${pause / 1000} s`);
    }
    await ns.sleep(pause);
  }
  const total = Object.keys(manifest.files).length;
  ns.tprint(`boot: build ${manifest.source.slice(0, 7)} on home (${fetched} fetched, ${total - Math.min(fetched, total)} kept)`);
  // preventDuplicates: never a second conductor (#44 adds the full live-run guard).
  ns.spawn(CONDUCTOR, { spawnDelay: 0, temporary: true, preventDuplicates: true });
}
