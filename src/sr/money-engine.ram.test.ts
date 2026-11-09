// The scheduler fills RAM by JOB_RAM_GB, so it must be what the game charges
// per thread: the job scripts priced by the game's own calculator, rounded to
// 0.01 GB as the game rounds a script's RAM.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";
import { loadRamCalculator } from "../../tools/ram-calc.ts";
import { JOB_RAM_GB, type JobScript } from "./money-engine.ts";

describe("job script RAM", () => {
  it.each(Object.keys(JOB_RAM_GB) as JobScript[])("%s costs what JOB_RAM_GB says", async (script) => {
    const source = readFileSync(join(import.meta.dirname, script.replace(/^sr\//, "").replace(/\.js$/, ".ts")), "utf8");
    const js = (await transform(source, { loader: "ts", format: "esm", tsconfigRaw: {} })).code;
    const calc = await loadRamCalculator();
    const priced = calc(new Map([[script, js]]), script, { bitNodeN: 1 });
    expect(priced.ok).toBe(true);
    if (priced.ok) expect(Math.round(priced.cost * 100) / 100).toBe(JOB_RAM_GB[script]);
  });
});
