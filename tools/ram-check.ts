// npm run ram-check [-- --build build]
//
// The static RAM budget gate. Prices every entry script in the build with the
// game's own calculator (ram-calc.ts), in every context its row in
// ram-budget.ts lists, and exits non-zero if any script is over budget, an
// entry script has no row, a row names a script not in the build, or a script
// cannot be priced. CI runs it after `build` and before publishing.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parse } from "acorn";
import { RAM_BUDGETS, RAM_CONTEXTS, type BudgetTable } from "./ram-budget.ts";
import { loadRamCalculator, type RamCalculator, type RamContext } from "./ram-calc.ts";

export interface ScriptVerdict {
  script: string;
  budget: number;
  ok: boolean;
  /** The context the script costs most in, and that cost (GB). */
  worst: { context: string; cost: number };
}

export interface RamReport {
  ok: boolean;
  /** One per budget row whose script was priced in every context. */
  scripts: ScriptVerdict[];
  /** Everything else that fails the gate, one line each. */
  problems: string[];
}

/** The game runs a script by calling its exported `main`; files without one are libraries. */
export function isEntryScript(code: string): boolean {
  let ast;
  try {
    ast = parse(code, { ecmaVersion: "latest", sourceType: "module" });
  } catch {
    return true; // can't tell; price it so the error surfaces
  }
  for (const node of ast.body) {
    if (node.type !== "ExportNamedDeclaration") continue;
    const d = node.declaration;
    if (d?.type === "FunctionDeclaration" && d.id.name === "main") return true;
    if (d?.type === "VariableDeclaration" && d.declarations.some((v) => v.id.type === "Identifier" && v.id.name === "main"))
      return true;
    if (node.specifiers.some((s) => s.exported.type === "Identifier" && s.exported.name === "main")) return true;
  }
  return false;
}

/**
 * The gate. `files` is every built file (home path → source); only `.js`
 * files are scripts.
 */
export function checkRamBudgets(
  files: ReadonlyMap<string, string>,
  table: BudgetTable,
  contexts: Readonly<Record<string, RamContext>>,
  calc: RamCalculator,
): RamReport {
  const scripts: ScriptVerdict[] = [];
  const problems: string[] = [];
  const js = [...files.keys()].filter((f) => f.endsWith(".js")).sort();

  for (const f of js) {
    if (!(f in table) && isEntryScript(files.get(f)!)) {
      problems.push(`${f}: entry script with no row in tools/ram-budget.ts`);
    }
  }
  for (const [script, row] of Object.entries(table).sort(([a], [b]) => a.localeCompare(b))) {
    if (!files.has(script) || !script.endsWith(".js")) {
      problems.push(`${script}: has a budget row but is not a script in the build`);
      continue;
    }
    let worst: ScriptVerdict["worst"] | undefined;
    let failed = false;
    for (const name of row.contexts) {
      const r = calc(files, script, contexts[name]!);
      if (!r.ok) {
        problems.push(`${script}: cannot be priced in ${name}: ${r.error}`);
        failed = true;
        break;
      }
      if (!worst || r.cost > worst.cost) worst = { context: name, cost: r.cost };
    }
    if (failed || !worst) continue;
    scripts.push({ script, budget: row.budget, ok: worst.cost <= row.budget, worst });
  }
  return { ok: problems.length === 0 && scripts.every((s) => s.ok), scripts, problems };
}

/** Every file under `dir`, keyed by its path relative to it with `/` separators. */
export async function readBuild(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files.set(relative(dir, full).split(sep).join("/"), await readFile(full, "utf8"));
  }
  return files;
}

export function formatReport(r: RamReport): string {
  const lines = r.scripts.map(
    (s) =>
      `${s.ok ? "ok  " : "OVER"}  ${s.script.padEnd(32)} ${s.worst.cost.toFixed(2).padStart(7)} / ${s.budget
        .toFixed(2)
        .padStart(7)} GB  (worst: ${s.worst.context})`,
  );
  for (const p of r.problems) lines.push(`FAIL  ${p}`);
  lines.push(r.ok ? "ram-check: every entry script is within budget" : "ram-check: FAILED");
  return lines.join("\n");
}

if (import.meta.main) {
  const i = process.argv.indexOf("--build");
  const dir = resolve(i >= 0 ? process.argv[i + 1]! : "build");
  const report = checkRamBudgets(await readBuild(dir), RAM_BUDGETS, RAM_CONTEXTS, await loadRamCalculator());
  console.log(formatReport(report));
  if (!report.ok) process.exitCode = 1;
}
