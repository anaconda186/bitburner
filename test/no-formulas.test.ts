// No run decision calls ns.formulas (#52, spec #41 "Formulas.exe: never used
// in decisions"). The run uses its own model, src/sr/formulas.ts; only the
// dev-only recorder in tools/golden/ touches the formulas API. The game prices
// every ns.formulas function at 0 GB, so the RAM gate can't catch a use; this
// checks the sources instead, as esbuild compiles them (so without comments,
// which may name the API).
import { readdirSync, readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

const compiled = (ts: string): string => transformSync(ts, { loader: "ts", format: "esm", tsconfigRaw: {} }).code;

const scripts = (readdirSync(SRC, { recursive: true }) as string[])
  .map((f) => f.replaceAll("\\", "/"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ file: f, code: compiled(readFileSync(join(SRC, f), "utf8")) }));

/** Reaching the formulas API: `x.formulas`, `x["formulas"]` or `{ formulas } = x`. */
const usesFormulasApi = (code: string): boolean =>
  /\.\s*formulas\b/.test(code) || /\[\s*["'`]formulas["'`]\s*\]/.test(code) || /\{[^}]*\bformulas\b[^}]*\}\s*=/.test(code);

describe("ns.formulas", () => {
  test("no game script reaches the formulas API", () => {
    expect(scripts.filter((s) => usesFormulasApi(s.code)).map((s) => s.file)).toEqual([]);
  });

  test("the check sees each way of reaching it, and not the model's own import", () => {
    expect(usesFormulasApi("ns.formulas.hacking.hackTime(s, p)")).toBe(true);
    expect(usesFormulasApi('ns["formulas"].hacking')).toBe(true);
    expect(usesFormulasApi("const { formulas } = ns;")).toBe(true);
    expect(usesFormulasApi('import { hackTimeMs } from "./formulas.ts";')).toBe(false);
    expect(usesFormulasApi(compiled("// as ns.formulas.hacking.hackTime does\nexport const x = 1;"))).toBe(false);
  });

  test("the recorder, which does use it, is outside src/", () => {
    const recorder = readFileSync(join(import.meta.dirname, "..", "tools", "golden", "formulas-recorder.ts"), "utf8");
    expect(usesFormulasApi(recorder)).toBe(true);
  });
});
