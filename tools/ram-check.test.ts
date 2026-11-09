// The gate: built files and the budget table in, a verdict out. Uses the real
// calculator and the real context presets; only the tables are test fixtures.
import { beforeAll, describe, expect, it } from "vitest";
import { RAM_CONTEXTS, type BudgetTable } from "./ram-budget.ts";
import { loadRamCalculator, type RamCalculator } from "./ram-calc.ts";
import { checkRamBudgets } from "./ram-check.ts";

let calc: RamCalculator;
beforeAll(async () => {
  calc = await loadRamCalculator();
});

const files = (entries: Record<string, string>) => new Map(Object.entries(entries));
const check = (built: Record<string, string>, table: BudgetTable) =>
  checkRamBudgets(files(built), table, RAM_CONTEXTS, calc);

const tor = `export async function main(ns) { ns.singularity.purchaseTor(); }`;
const plain = `export async function main(ns) { ns.tprint("hi"); }`;

describe("checkRamBudgets", () => {
  it("passes an entry script within its budget", () => {
    const r = check({ "boot.js": plain }, { "boot.js": { budget: 2, contexts: ["BN1.1"] } });
    expect(r.ok).toBe(true);
    expect(r.scripts).toEqual([
      { script: "boot.js", budget: 2, ok: true, worst: { context: "BN1.1", cost: 1.6 } },
    ]);
  });

  it("fails an entry script that has no row", () => {
    const r = check({ "boot.js": plain, "sr/new.js": plain }, { "boot.js": { budget: 2, contexts: ["BN1.1"] } });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.stringContaining("sr/new.js")]);
  });

  it("counts main exported by name or as a const as an entry script", () => {
    for (const code of [`async function main(ns) {}\nexport { main };`, `export const main = async (ns) => {};`]) {
      expect(check({ "sr/x.js": code }, {}).problems).toEqual([expect.stringContaining("sr/x.js")]);
    }
  });

  it("does not need a row for a library file without main", () => {
    const r = check(
      { "boot.js": `import { f } from "sr/lib.js"; export async function main(ns) { f(); }`, "sr/lib.js": `export function f() {}` },
      { "boot.js": { budget: 2, contexts: ["BN1.1"] } },
    );
    expect(r.ok).toBe(true);
  });

  it("fails a script over budget in its worst context and names that context", () => {
    const r = check({ "sr/tor.js": tor }, { "sr/tor.js": { budget: 10, contexts: ["BN4", "SF4.1", "SF4.3"] } });
    expect(r.ok).toBe(false);
    expect(r.scripts).toEqual([
      { script: "sr/tor.js", budget: 10, ok: false, worst: { context: "SF4.1", cost: 33.6 } },
    ]);
  });

  it("passes the same script when it only runs where Singularity is cheap", () => {
    const r = check({ "sr/tor.js": tor }, { "sr/tor.js": { budget: 4, contexts: ["BN4", "SF4.3", "BN10 start"] } });
    expect(r.ok).toBe(true);
    expect(r.scripts[0]?.worst.cost).toBe(3.6);
  });

  it("fails a row whose script is not in the build", () => {
    const r = check({ "boot.js": plain }, {
      "boot.js": { budget: 2, contexts: ["BN1.1"] },
      "sr/gone.js": { budget: 2, contexts: ["BN1.1"] },
    });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.stringContaining("sr/gone.js")]);
  });

  it("fails a script the calculator cannot price", () => {
    const r = check(
      { "boot.js": `import { x } from "sr/missing.js"; export async function main(ns) { x(); }` },
      { "boot.js": { budget: 100, contexts: ["BN1.1"] } },
    );
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.stringContaining("boot.js")]);
  });

  it("ignores files that are not scripts", () => {
    const r = check({ "boot.js": plain, "sr/notes.txt": "export function main() {}" }, {
      "boot.js": { budget: 2, contexts: ["BN1.1"] },
    });
    expect(r.ok).toBe(true);
  });
});
