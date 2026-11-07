// The game's own RAM calculator, run outside the game. Expected values come
// from docs/research/bitburner-current-state.md §4a (SF4 multipliers, base
// costs) and game-source RamCostConstants (Base 1.6, Dom 25), not from this code.
import { beforeAll, describe, expect, it } from "vitest";
import { loadRamCalculator, type RamCalculator } from "./ram-calc.ts";

let calc: RamCalculator;
beforeAll(async () => {
  calc = await loadRamCalculator();
});

const files = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("Singularity costs follow the SF4 level", () => {
  const code = `export async function main(ns) { ns.singularity.purchaseTor(); }`;
  const cost = (bitNodeN: number, sf4: number) =>
    calc(files({ "sr/tor.js": code }), "sr/tor.js", { bitNodeN, sourceFiles: { 4: sf4 } });

  it("is x16 outside BN4 at SF4.1", () => {
    expect(cost(1, 1)).toMatchObject({ ok: true, cost: 33.6 });
  });
  it("is x16 outside BN4 with no SF4", () => {
    expect(cost(1, 0)).toMatchObject({ ok: true, cost: 33.6 });
  });
  it("is x4 at SF4.2", () => {
    expect(cost(5, 2)).toMatchObject({ ok: true, cost: 9.6 });
  });
  it("is x1 at SF4.3", () => {
    expect(cost(10, 3)).toMatchObject({ ok: true, cost: 3.6 });
  });
  it("is x1 inside BN4 whatever the SF4 level", () => {
    expect(cost(4, 0)).toMatchObject({ ok: true, cost: 3.6 });
    expect(cost(4, 2)).toMatchObject({ ok: true, cost: 3.6 });
  });
});

describe("naming document or window", () => {
  const bn1 = { bitNodeN: 1 };
  const price = (body: string) =>
    calc(files({ "sr/ui.js": `export async function main(ns) { ${body} }` }), "sr/ui.js", bn1);

  it("charges 25 GB for document", () => {
    expect(price(`document.title = "x";`)).toMatchObject({ ok: true, cost: 26.6 });
  });
  it("charges 25 GB for window", () => {
    expect(price(`window.scrollTo(0, 0);`)).toMatchObject({ ok: true, cost: 26.6 });
  });
  it("charges 25 GB for each when both are named", () => {
    expect(price(`document.title = "x"; window.scrollTo(0, 0);`)).toMatchObject({ ok: true, cost: 51.6 });
  });
  it("charges document once however often it is named", () => {
    expect(price(`document.title = "a"; document.title = "b";`)).toMatchObject({ ok: true, cost: 26.6 });
  });
});

describe("imports", () => {
  it("charges what an imported file names", () => {
    const r = calc(
      files({
        "sr/main.js": `import { dom } from "sr/lib.js"; export async function main(ns) { dom(); }`,
        "sr/lib.js": `export function dom() { return document.title; }`,
      }),
      "sr/main.js",
      { bitNodeN: 1 },
    );
    expect(r).toMatchObject({ ok: true, cost: 26.6 });
  });
  it("resolves relative imports against the importer", () => {
    const r = calc(
      files({
        "sr/a/main.js": `import { dom } from "../lib.js"; export async function main(ns) { dom(); }`,
        "sr/lib.js": `export function dom() { return document.title; }`,
      }),
      "sr/a/main.js",
      { bitNodeN: 1 },
    );
    expect(r).toMatchObject({ ok: true, cost: 26.6 });
  });
  it("fails on an import that is not among the files", () => {
    const r = calc(
      files({ "sr/main.js": `import { x } from "sr/gone.js"; export async function main(ns) { x(); }` }),
      "sr/main.js",
      { bitNodeN: 1 },
    );
    expect(r.ok).toBe(false);
  });
});
