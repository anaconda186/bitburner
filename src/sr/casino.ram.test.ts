// The casino is the one script that names window (spec #41): it pays the DOM
// charge for window and for document, once each, and still fits its 64 GB
// cloud server. Priced with the game's own calculator, imports included, as
// on home. Plus two source checks: its first line clears the leave-page
// handler, and it never reads the cap from the page.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";
import { loadRamCalculator } from "../../tools/ram-calc.ts";
import { CASINO_HOST_RAM_GB } from "./blackjack.ts";

const SOURCES: Record<string, string> = {
  "sr/h/casino.js": "h/casino.ts",
  "sr/h/serve.js": "h/serve.ts",
  "sr/blackjack.js": "blackjack.ts",
  "sr/ui.js": "ui.ts",
};
const read = (src: string) => readFileSync(join(import.meta.dirname, src), "utf8");
/** The source without its comments (which the game's calculator doesn't charge). */
const code = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

async function built(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const [home, src] of Object.entries(SOURCES)) {
    const js = (await transform(read(src), { loader: "ts", format: "esm", tsconfigRaw: {} })).code;
    files.set(home, js.replace(/from "(\.\.?\/[^"]+)\.ts"/g, 'from "$1.js"'));
  }
  return files;
}

describe("casino RAM", () => {
  it("is charged 25 GB for window and 25 for document, and fits 64 GB", async () => {
    const calc = await loadRamCalculator();
    const priced = calc(await built(), "sr/h/casino.js", { bitNodeN: 1 });
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const dom = priced.entries.filter((e) => e.type === "dom").sort((a, b) => a.name.localeCompare(b.name));
    expect(dom).toEqual([
      { type: "dom", name: "document", cost: 25 },
      { type: "dom", name: "window", cost: 25 },
    ]);
    expect(priced.cost).toBeLessThanOrEqual(CASINO_HOST_RAM_GB);
  });

  it("is the only script under src/ that names window", () => {
    const named: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const e of readdirSync(join(import.meta.dirname, dir), { withFileTypes: true })) {
        const path = `${rel}${e.name}`;
        if (e.isDirectory()) walk(join(dir, e.name), `${path}/`);
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && /\bwindow\b/.test(code(read(join(dir, e.name))))) {
          named.push(path);
        }
      }
    };
    walk("..", "src/");
    expect(named).toEqual(["src/sr/h/casino.ts"]);
  });
});

describe("casino source", () => {
  const source = read("h/casino.ts");

  it("clears the leave-page handler on the first line of main", () => {
    const body = /export async function main\(ns: NS\): Promise<void> \{\n((?:\s*\/\/.*\n)*)\s*(.*)\n/.exec(source);
    expect(body?.[2]).toBe("window.onbeforeunload = null;");
  });

  it("reads the cap from the game's money sources, never from the page", () => {
    expect(source).toMatch(/getMoneySources\(\)\.sinceInstall\.casino/);
    expect(source).not.toMatch(/cheater|reachedLimit|innerText/i);
  });
});
