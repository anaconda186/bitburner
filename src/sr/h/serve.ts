// The helper runtime: every helper script is a `main` that hands its one call
// to `serve`. serve decodes the two arguments, makes the call, and writes
// exactly one Reply to the reply port, also when the helper dies first.
//
//   import type { NS } from "@ns";
//   import { serve } from "./serve.ts";
//   export async function main(ns: NS): Promise<void> {
//     await serve(ns, (arg) => ns.singularity.purchaseTor());
//   }
//
// This file is copied next to a helper launched off home (HELPER_RUNTIME in
// `../helpers.ts`), so it must import nothing at runtime. RAM: every helper
// pays for each NS-named identifier in here, so keep it to writePort,
// clearPort, atExit, args, pid and tprint, all 0 GB.
import type { NS, ScriptArg } from "@ns";
import type { Json, Reply, WorkerReport } from "../helper-contract.ts";

export type DecodedArgs =
  | { readonly ok: true; readonly arg: Json; readonly port: number }
  | { readonly ok: false; readonly port: number | undefined; readonly error: string };

/** Reads `[argJson, replyPort]`. A failure still carries the port when that part was good. */
export function decodeHelperArgs(args: readonly ScriptArg[]): DecodedArgs {
  const [argText, port] = args;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1) {
    return { ok: false, port: undefined, error: `bad reply port ${JSON.stringify(port)}` };
  }
  if (typeof argText !== "string") return { ok: false, port, error: `argument is not a JSON string: ${String(argText)}` };
  try {
    return { ok: true, arg: JSON.parse(argText) as Json, port };
  } catch {
    return { ok: false, port, error: `argument is not valid JSON: ${argText.slice(0, 200)}` };
  }
}

/** Runs the one call and turns its outcome, value or throw, into a Reply. */
export async function settle(call: () => Json | void | Promise<Json | void>): Promise<Reply> {
  try {
    const value = await call();
    return { ok: true, value: value ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A long-lived worker's news: replaces whatever is on its status port with a
 * WorkerReport, so the port always holds exactly the latest one. A worker
 * handing over to a copy of itself names the copy's `pid`, so the conductor
 * sees the copy alive and starts no other.
 */
export function postReport(ns: NS, port: number, value: Json, pid: number = ns.pid): void {
  const report: WorkerReport = { pid, atMs: Date.now(), value };
  ns.clearPort(port);
  ns.writePort(port, report);
}

/** The whole life of a helper: decode, call once, reply once, exit. */
export async function serve(ns: NS, call: (arg: Json) => Json | void | Promise<Json | void>): Promise<void> {
  ns.disableLog("ALL");
  const decoded = decodeHelperArgs(ns.args);
  const port = decoded.port;
  if (port === undefined) {
    ns.tprint(`ERROR helper: ${decoded.ok ? "" : decoded.error}`);
    return;
  }
  let replied = false;
  const answer = (r: Reply) => {
    if (replied) return;
    replied = true;
    ns.writePort(port, r);
  };
  // Runs on any death before the reply (a kill, an error): the conductor
  // still hears back. It runs before the script is marked dead, so ns works.
  ns.atExit(() => answer({ ok: false, error: "helper exited without a reply" }), "reply");
  if (!decoded.ok) return answer({ ok: false, error: decoded.error });
  const arg = decoded.arg;
  answer(await settle(() => call(arg)));
}
