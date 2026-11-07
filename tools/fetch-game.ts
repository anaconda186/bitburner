// npm run fetch-game [-- --force]
//
// Fills the gitignored `.game/` folder from the pins in game-pin.ts:
//   .game/app/                 the zip's resources/app/ (static v3.0.1 web build)
//   .game/source/<path>        each GAME_SOURCES file, at GAME_COMMIT
//   .game/pin.json             the pins it was filled from; a matching file means
//                              there is nothing to do (this is what CI caches)
// Every download is sha256-checked before it is used.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { GAME_COMMIT, GAME_SOURCES, GAME_VERSION, GAME_ZIP } from "./game-pin.ts";

export const GAME_DIR = resolve(import.meta.dirname, "..", ".game");

/**
 * Downloads `url` to `dest` only if its bytes hash to `sha256`. On any failure
 * (non-200, network error, hash mismatch) it throws and leaves nothing at `dest`.
 */
export async function downloadVerified(url: string, sha256: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (res.status !== 200 || !res.body) throw new Error(`GET ${url}: HTTP ${res.status}`);
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  const hash = createHash("sha256");
  const tap = new Transform({
    transform(chunk: Buffer, _enc, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), tap, createWriteStream(tmp));
    const got = hash.digest("hex");
    if (got !== sha256) throw new Error(`${url}: sha256 is ${got}, pinned ${sha256}`);
    await rename(tmp, dest);
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Extracts every entry under `prefix` in `zipPath` into `destDir`, prefix stripped. */
async function extractFolder(zipPath: string, prefix: string, destDir: string): Promise<number> {
  const zip = await new Promise<yauzl.ZipFile>((ok, fail) =>
    yauzl.open(zipPath, { lazyEntries: true }, (err, z) => (err ? fail(err) : ok(z))),
  );
  const root = resolve(destDir);
  let count = 0;
  return new Promise<number>((ok, fail) => {
    zip.on("error", fail);
    zip.on("end", () => ok(count));
    zip.on("entry", (entry: yauzl.Entry) => {
      const name = entry.fileName;
      if (!name.startsWith(prefix) || name.endsWith("/")) return zip.readEntry();
      const out = normalize(join(root, name.slice(prefix.length)));
      if (!out.startsWith(root + sep)) return fail(new Error(`zip entry escapes target: ${name}`));
      zip.openReadStream(entry, (err, stream) => {
        if (err) return fail(err);
        mkdir(dirname(out), { recursive: true })
          .then(() => pipeline(stream, createWriteStream(out)))
          .then(() => {
            count++;
            zip.readEntry();
          }, fail);
      });
    });
    zip.readEntry();
  });
}

function pinRecord(): string {
  return JSON.stringify({ version: GAME_VERSION, commit: GAME_COMMIT, zip: GAME_ZIP, sources: GAME_SOURCES }, null, 2);
}

export async function fetchGame(force = false): Promise<void> {
  const stamp = join(GAME_DIR, "pin.json");
  const want = pinRecord();
  const have = await readFile(stamp, "utf8").catch(() => "");
  if (!force && have === want) {
    console.log(`fetch-game: .game/ already holds v${GAME_VERSION}; nothing to do`);
    return;
  }
  await rm(GAME_DIR, { recursive: true, force: true });
  await mkdir(GAME_DIR, { recursive: true });

  for (const src of GAME_SOURCES) {
    const url = `https://raw.githubusercontent.com/bitburner-official/bitburner-src/${GAME_COMMIT}/${src.path}`;
    await downloadVerified(url, src.sha256, join(GAME_DIR, "source", src.path));
    console.log(`fetch-game: ${src.path} ok`);
  }

  const zipPath = join(GAME_DIR, "game.zip");
  console.log(`fetch-game: downloading ${GAME_ZIP.url}`);
  await downloadVerified(GAME_ZIP.url, GAME_ZIP.sha256, zipPath);
  const n = await extractFolder(zipPath, GAME_ZIP.appDir, join(GAME_DIR, "app"));
  if (n === 0) throw new Error(`fetch-game: no entries under ${GAME_ZIP.appDir} in the zip`);
  await rm(zipPath);
  console.log(`fetch-game: extracted ${n} files to .game/app/`);

  await writeFile(stamp, want);
}

if (import.meta.main) {
  await fetchGame(process.argv.includes("--force"));
}
