// The driver pays the DOM charge for `document` once and never for `window`
// (spec #41: only the casino names window), and fits its 32 GB cloud server.
// Priced with the game's own calculator, imports included, as on home.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";
import { loadRamCalculator } from "../../tools/ram-calc.ts";
import { DRIVER_HOST_RAM_GB } from "./decide.ts";

const SOURCES: Record<string, string> = {
  "sr/h/driver.js": "h/driver.ts",
  "sr/h/serve.js": "h/serve.ts",
  "sr/driver-jobs.js": "driver-jobs.ts",
  "sr/ui.js": "ui.ts",
};

async function built(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const [home, src] of Object.entries(SOURCES)) {
    const ts = readFileSync(join(import.meta.dirname, src), "utf8");
    const js = (await transform(ts, { loader: "ts", format: "esm", tsconfigRaw: {} })).code;
    files.set(home, js.replace(/from "(\.\.?\/[^"]+)\.ts"/g, 'from "$1.js"'));
  }
  return files;
}

describe("driver RAM", () => {
  it("is charged 25 GB for document, nothing for window, and fits 32 GB", async () => {
    const calc = await loadRamCalculator();
    const priced = calc(await built(), "sr/h/driver.js", { bitNodeN: 1 });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const dom = priced.entries.filter((e) => e.type === "dom");
    expect(dom).toEqual([{ type: "dom", name: "document", cost: 25 }]);
    expect(priced.cost).toBeLessThanOrEqual(DRIVER_HOST_RAM_GB);
  });

  it("never reaches the page through document.defaultView", () => {
    for (const src of Object.values(SOURCES)) {
      expect(readFileSync(join(import.meta.dirname, src), "utf8")).not.toMatch(/defaultView/);
    }
  });
});
