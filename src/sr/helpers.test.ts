// The registry against the source tree: a helper that isn't registered would
// never get a RAM cost in the snapshot, so decide could never place it.
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { HELPER_RUNTIME, HELPER_SCRIPTS, WORKERS, type WorkerSpec } from "./helpers.ts";

const dir = fileURLToPath(new URL("./h/", import.meta.url));
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const homePath = (f: string) => `sr/h/${f.replace(/\.ts$/, ".js")}`;
const isEntry = (f: string) => /^export\s+(async\s+)?function\s+main\b/m.test(readFileSync(dir + f, "utf8"));

describe("helper registry", () => {
  test("lists every helper entry script under src/sr/h/, and nothing else", () => {
    expect([...HELPER_SCRIPTS].sort()).toEqual(sources.filter(isEntry).map(homePath).sort());
  });

  test("each worker lists every file it imports outside the helper runtime, so off home it has them", () => {
    // Its imports' imports too: off home, every file the game loads must be there.
    const srcRoot = fileURLToPath(new URL("../", import.meta.url));
    const importsOf = (home: string): string[] => {
      const source = readFileSync(srcRoot + home.replace(/\.js$/, ".ts"), "utf8");
      return [...source.matchAll(/^import (?!type )[^"]*"(\.\.?\/[^"]+)\.ts";/gm)].map(
        (m) => posix.join(posix.dirname(home), m[1] as string) + ".js",
      );
    };
    for (const w of Object.values(WORKERS)) {
      const seen = new Set<string>();
      const todo = importsOf(w.script);
      while (todo.length > 0) {
        const f = todo.pop() as string;
        if (seen.has(f)) continue;
        seen.add(f);
        todo.push(...importsOf(f));
      }
      expect([...seen].filter((f) => !HELPER_RUNTIME.includes(f as never)).sort()).toEqual([...w.files].sort());
    }
  });

  test("no two workers share a status or control port", () => {
    const ports = Object.values(WORKERS).flatMap((w: WorkerSpec) => [w.port, ...(w.control === undefined ? [] : [w.control])]);
    expect(new Set(ports).size).toBe(ports.length);
  });

  test("the helper runtime is every library under src/sr/h/, and imports nothing at runtime", () => {
    expect([...HELPER_RUNTIME].sort()).toEqual(sources.filter((f) => !isEntry(f)).map(homePath).sort());
    for (const f of sources.filter((f) => !isEntry(f))) {
      expect(readFileSync(dir + f, "utf8")).not.toMatch(/^import (?!type )/m);
    }
  });
});
