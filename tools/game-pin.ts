// The one place the game is pinned. `npm run fetch-game` reads this; CI keys
// its game cache on this file's hash. Changing the target version means
// changing only this file.

export const GAME_VERSION = "3.0.1";

/** bitburner-src commit for tag v3.0.1. */
export const GAME_COMMIT = "3162fd2590e221eadd0c0fbd46151913f7c4c41c";

/** The Electron release zip; its `resources/app/` is the static web build. */
export const GAME_ZIP = {
  url: `https://github.com/bitburner-official/bitburner-src/releases/download/v${GAME_VERSION}/bitburner-win32-x64.zip`,
  // From the GitHub release asset digest (gh api .../releases/tags/v3.0.1).
  sha256: "eeb96dceb67e8c2bd0de5b1fe3014ea0b555f638deea8e57b107768d36928c94",
  /** Folder inside the zip that is extracted to `.game/app/`. */
  appDir: "resources/app/",
};

/**
 * Source files fetched from `raw.githubusercontent.com` at GAME_COMMIT into
 * `.game/source/<path>`, mirroring the game repo's layout so relative imports
 * between them still resolve. Add a file here when a tool needs it.
 */
export const GAME_SOURCES: ReadonlyArray<{ path: string; sha256: string }> = [
  { path: "src/ScriptEditor/NetscriptDefinitions.d.ts", sha256: "bfabb0f495cc89133ba042420f5d6d514c7f068502565e3bc5f90da5e60242ed" },
  { path: "src/Script/RamCalculations.ts", sha256: "6602d424d25617456c3b02e3079cdcea44f754698b453836ae15355baa375ee5" },
  { path: "src/Netscript/RamCostGenerator.ts", sha256: "470f2c0de8fe624a7df74446961dfc127a7fd0dfacdf9028e94b600880c85da6" },
];
