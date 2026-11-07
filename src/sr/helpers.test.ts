// The registry against the source tree: a helper that isn't registered would
// never get a RAM cost in the snapshot, so decide could never place it.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { HELPER_RUNTIME, HELPER_SCRIPTS } from "./helpers.ts";

const dir = fileURLToPath(new URL("./h/", import.meta.url));
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const homePath = (f: string) => `sr/h/${f.replace(/\.ts$/, ".js")}`;
const isEntry = (f: string) => /^export\s+(async\s+)?function\s+main\b/m.test(readFileSync(dir + f, "utf8"));

describe("helper registry", () => {
  test("lists every helper entry script under src/sr/h/, and nothing else", () => {
    expect([...HELPER_SCRIPTS].sort()).toEqual(sources.filter(isEntry).map(homePath).sort());
  });

  test("the helper runtime is every library under src/sr/h/, and imports nothing at runtime", () => {
    expect([...HELPER_RUNTIME].sort()).toEqual(sources.filter((f) => !isEntry(f)).map(homePath).sort());
    for (const f of sources.filter((f) => !isEntry(f))) {
      expect(readFileSync(dir + f, "utf8")).not.toMatch(/^import (?!type )/m);
    }
  });
});
