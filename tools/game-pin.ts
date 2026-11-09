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
  // The rest of RamCalculations.ts's runtime import closure, bundled by the RAM
  // check (tools/ram-calc.ts). Type-only imports are left out: esbuild drops them.
  { path: "src/Script/RamCalculationErrorCodes.ts", sha256: "b8ca82ecdfca8c21ee415fbfa2909642b00ca4944c7d3dc36884b47360a4f5e8" },
  { path: "src/ThirdParty/acorn-typescript-walk/index.ts", sha256: "e930fe2bcc5104c4652a74685033b77215e54080048d185a0b9da1429c10d20c" },
  { path: "src/utils/helpers/roundToTwo.ts", sha256: "e6152be4fd7feeeafefc6f447335e887bd8fe83a521bda5cc7c3b1a47a1160a4" },
  { path: "src/utils/ScriptTransformer.ts", sha256: "86092613f3929de99389e30ba629a80b675862dfec0a36043342513e4ba77f33" },
  { path: "src/Paths/ScriptFilePath.ts", sha256: "cf87387a6eef8b537dc02565bff3eae1228473ebc90d2ca297cd5b7230eb7279" },
  { path: "src/Paths/Directory.ts", sha256: "f4cbccbc4d415a72044910278bb97b71412eab6fb6d8a1150760cb1ff2bc667e" },
  { path: "src/Paths/FilePath.ts", sha256: "593e4f7e351a3fd2ce70d114d37ab6e4ef67da9afcf09dc390face37ed2e4aad" },
  { path: "src/Paths/ContentFile.ts", sha256: "2e98b9e2f0af34da73de9a69875c29dad904d2ace6212f0b88edfde5b8aa4b07" },
  { path: "src/Paths/FileMetadata.ts", sha256: "b88e2d9534b582268c7bb9c281f33526fc36c858d4a1fb8fe5a047a8e61025c9" },
  { path: "src/utils/JSONReviver.ts", sha256: "ad1d4bb2f5479af3fc7b3b2dbb69fd676d179b7b3d91c55af85a1666f7b2ed7a" },
  { path: "src/Types/Jsonable.ts", sha256: "0c17c18eee7db069d394c16467f216867b941caa90db313c4a8439ec3a3442b6" },
  { path: "src/utils/TypeAssertion.ts", sha256: "06f0e5f8db95302f6618d4660400293d0ebc8d0adfedfc4ee378659439c0b5c3" },
];
