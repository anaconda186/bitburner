// Who may write the state file (#44): boot.js creates it once, the conductor
// writes it after that, and every other script leaves it alone. This checks
// the sources: the path is spelled out only in boot.ts (its import-free copy)
// and in sr/state.ts, and the state module's path and writer reach the game
// only through run-state.ts, which only the conductor imports.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

const scripts = (readdirSync(SRC, { recursive: true }) as string[])
  .map((f) => f.replaceAll("\\", "/"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ file: f, code: readFileSync(join(SRC, f), "utf8") }));

const which = (pred: (code: string) => boolean) =>
  scripts.filter((s) => pred(s.code)).map((s) => s.file).sort();

describe("only boot.js and the conductor write sr/state.json", () => {
  test("the path is spelled out only in boot.ts and sr/state.ts", () => {
    expect(which((c) => c.includes("sr/state.json"))).toEqual(["boot.ts", "sr/state.ts"]);
  });

  test("the state module's path and writer are imported only by run-state.ts", () => {
    expect(which((c) => /from "\.\/state\.ts"/.test(c) && /\b(STATE_FILE|stateWrite)\b/.test(c))).toEqual([
      "sr/run-state.ts",
    ]);
  });

  test("run-state.ts is imported only by the conductor", () => {
    expect(which((c) => /from "\.\/run-state\.ts"/.test(c))).toEqual(["sr/conductor.ts"]);
  });

  test("boot.js writes only the state file, and only through stateOnBoot's create", () => {
    const boot = scripts.find((s) => s.file === "boot.ts")!.code;
    expect(boot.match(/ns\.write\([^)]*\)/g)).toEqual(["ns.write(STATE_FILE, runState.create, \"w\")"]);
  });
});
