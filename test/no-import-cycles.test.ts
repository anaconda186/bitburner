// No game script imports itself round a loop (#57). The game refuses to load
// a script whose imports go in a circle ("Circular dependencies detected",
// a RUNTIME ERROR when the script starts), though Node and Vitest are happy
// with one, so the unit tests can't see it. Type-only imports don't count:
// they are gone from the compiled code. Checked as esbuild compiles each file.
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { join } from "node:path";
import { transformSync } from "esbuild";
import { describe, expect, test } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

const compiled = (ts: string): string => transformSync(ts, { loader: "ts", format: "esm", tsconfigRaw: {} }).code;

/** Each script's runtime imports, as paths under src/. */
function importGraph(files: Record<string, string>): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const [file, code] of Object.entries(files)) {
    const deps = [...code.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*["'](\.\.?\/[^"']+)["']/gm)].map((m) =>
      posix.normalize(posix.join(posix.dirname(file), m[1] as string)),
    );
    graph.set(file, deps);
  }
  return graph;
}

/** One import loop, as the files round it, or null. */
function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, "open" | "done">();
  const path: string[] = [];
  const visit = (f: string): string[] | null => {
    if (state.get(f) === "done") return null;
    if (state.get(f) === "open") return [...path.slice(path.indexOf(f)), f];
    state.set(f, "open");
    path.push(f);
    for (const d of graph.get(f) ?? []) {
      const found = visit(d);
      if (found) return found;
    }
    path.pop();
    state.set(f, "done");
    return null;
  };
  for (const f of graph.keys()) {
    const found = visit(f);
    if (found) return found;
  }
  return null;
}

describe("import cycles", () => {
  test("no game script's imports go round in a circle", () => {
    const files: Record<string, string> = {};
    for (const f of (readdirSync(SRC, { recursive: true }) as string[]).map((x) => x.replaceAll("\\", "/"))) {
      if (f.endsWith(".ts") && !f.endsWith(".test.ts")) files[f] = compiled(readFileSync(join(SRC, f), "utf8"));
    }
    expect(Object.keys(files).length).toBeGreaterThan(10);
    expect(findCycle(importGraph(files))).toBeNull();
  });

  test("the check finds a loop, and ignores type-only imports", () => {
    const loop = {
      "a.ts": compiled('import { b } from "./b.ts";\nexport const a = () => b;'),
      "b.ts": compiled('import { a } from "./a.ts";\nexport const b = () => a;'),
    };
    expect(findCycle(importGraph(loop))).toEqual(["a.ts", "b.ts", "a.ts"]);
    const typesOnly = {
      "a.ts": compiled('import { b } from "./b.ts";\nexport type A = 1;\nexport const a = () => b;'),
      "b.ts": compiled('import type { A } from "./a.ts";\nexport const b: A = 1;'),
    };
    expect(findCycle(importGraph(typesOnly))).toBeNull();
  });
});
