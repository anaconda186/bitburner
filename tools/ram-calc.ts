// The game's own static RAM calculator (RamCalculations.ts + RamCostGenerator.ts
// at the pinned commit), run in Node. fetch-game puts the sources under
// .game/source/; this bundles them with esbuild, stubbing the few game modules
// the calculator does not really use, and loads the bundle once.
//
// Stubs:
//   @player            only `bitNodeN` and `activeSourceFileLvl(n)` are read
//                      (by SF4Cost); set per call from the RamContext.
//   @swc/wasm-web      run-time TS/JSX transpiler, unused for .js input.
//   @babel/standalone  parses .ts/.jsx/.tsx only; we feed compiled .js.
// acorn, acorn-walk, acorn-jsx-walk and lodash are the real packages, pinned
// to the game's locked versions.

import { createHash } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Plugin } from "esbuild";
import { GAME_DIR } from "./fetch-game.ts";

/** What the game reads off the player when pricing a script. */
export interface RamContext {
  bitNodeN: number;
  /** Source-File levels by number; a missing entry is level 0. */
  sourceFiles?: Readonly<Partial<Record<number, number>>>;
}

export interface RamEntry {
  type: "ns" | "dom" | "fn" | "misc";
  name: string;
  cost: number;
}

export type RamResult = { ok: true; cost: number; entries: RamEntry[] } | { ok: false; error: string };

/**
 * Prices `script` the way the game does when it sits on home next to every
 * file in `files` (home path → JS source), so its imports are charged too.
 */
export type RamCalculator = (files: ReadonlyMap<string, string>, script: string, context: RamContext) => RamResult;

const STUBS: Record<string, string> = {
  "@player": `export const Player = {
    bitNodeN: 1,
    sourceFiles: {},
    activeSourceFileLvl(n) { return this.sourceFiles[n] ?? 0; },
  };`,
  "@swc/wasm-web": `export function transformSync() { throw new Error("swc is stubbed in the RAM check"); }`,
  "@babel/standalone": `export const packages = { parser: {} };`,
};

const stubPlugin: Plugin = {
  name: "game-stubs",
  setup(b) {
    const filter = new RegExp(`^(${Object.keys(STUBS).map((k) => k.replace(/[/.]/g, "\\$&")).join("|")})$`);
    b.onResolve({ filter }, (args) => ({ path: args.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
  },
};

interface GameModule {
  calculateRamUsage(
    code: string,
    name: string,
    server: string,
    others: Map<string, { filename: string; server: string; code: string }>,
  ): { cost?: number; entries?: RamEntry[]; errorCode?: unknown; errorMessage?: string };
  Player: { bitNodeN: number; sourceFiles: Readonly<Partial<Record<number, number>>> };
}

/** Bundles the pinned calculator (from `sourceDir`, default `.game/source`) and returns it. */
export async function loadRamCalculator(sourceDir = join(GAME_DIR, "source")): Promise<RamCalculator> {
  const out = await build({
    stdin: {
      contents: `export { calculateRamUsage } from "./src/Script/RamCalculations.ts";\nexport { Player } from "@player";`,
      resolveDir: sourceDir,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    // The game's files use plain `import { T }` for some types; without this
    // esbuild would pick up this repo's tsconfig (verbatimModuleSyntax) and
    // keep those imports, which point at files we don't fetch.
    tsconfigRaw: {},
    plugins: [stubPlugin],
  });
  const code = out.outputFiles[0]!.text;

  // Written once per distinct bundle (named by its hash) so parallel test
  // workers never read a half-written file.
  const file = join(GAME_DIR, `ram-calc-${createHash("sha256").update(code).digest("hex").slice(0, 12)}.mjs`);
  if (!(await access(file).then(() => true, () => false))) {
    await mkdir(GAME_DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.part`;
    await writeFile(tmp, code);
    await rename(tmp, file);
  }
  const game = (await import(pathToFileURL(file).href)) as GameModule;

  return (files, script, context) => {
    game.Player.bitNodeN = context.bitNodeN;
    game.Player.sourceFiles = context.sourceFiles ?? {};
    const code = files.get(script);
    if (code === undefined) return { ok: false, error: `${script} is not among the files` };
    const others = new Map([...files].map(([filename, code]) => [filename, { filename, server: "home", code }]));
    const r = game.calculateRamUsage(code, script, "home", others);
    if (r.cost === undefined) return { ok: false, error: r.errorMessage ?? `RAM calculation failed (code ${String(r.errorCode)})` };
    return { ok: true, cost: r.cost, entries: r.entries ?? [] };
  };
}
