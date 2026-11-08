// The conductor's side of the helper contract (`helper-contract.ts`): the thin
// ns shell that launches a helper and hears back from it. Not unit tested; the
// in-game check covers it. Nothing here throws for a failed launch: a failure
// is a Reply with ok false, which the conductor treats as "not done".
//
// RAM: these are the conductor's expensive names: exec 1.3, scp 0.6,
// isRunning 0.1. Ports are free.
import type { NS } from "@ns";
import { readReply, REPLY_PORT_BASE, REPLY_PORT_SPAN, type Json, type Reply } from "./helper-contract.ts";
import { HELPER_RUNTIME, type HelperScript } from "./helpers.ts";

/** A launched helper: its process and the port its reply will come to. */
export type Launched = { readonly pid: number; readonly port: number };

/** How often a waiting conductor checks that the helper is still alive. */
const LIVENESS_POLL_MS = 200;
/** After a reply, how long to wait for the helper's process to end. */
const EXIT_WAIT_MS = 1000;

/** Hands out reply ports, a fresh one per launch, from a random start. */
export function replyPorts(): () => number {
  let n = Math.floor(Math.random() * REPLY_PORT_SPAN);
  return () => REPLY_PORT_BASE + (n++ % REPLY_PORT_SPAN);
}

/** A kill or a reset surfaces as a thrown ScriptDeath; it must never be swallowed. */
export function isScriptDeath(e: unknown): boolean {
  return e instanceof Error && e.name === "ScriptDeath";
}

/** Why a launch failed: the same shape as a failed Reply. */
export type LaunchFailure = { readonly ok: false; readonly error: string };

/**
 * Starts `script` on `host` with its argument and a port (a fresh reply port
 * for a helper, its status port for a worker), copying it, the helper
 * runtime and any `files` it imports there first when `host` is not home.
 */
export function launchHelper(
  ns: NS,
  script: HelperScript,
  host: string,
  arg: Json,
  port: number,
  files: readonly string[] = [],
): Launched | LaunchFailure {
  try {
    ns.clearPort(port);
    if (host !== "home" && !ns.scp([script, ...HELPER_RUNTIME, ...files], host, "home")) {
      return { ok: false, error: `could not copy ${script} to ${host}` };
    }
    const pid = ns.exec(script, host, { threads: 1, temporary: true }, JSON.stringify(arg), port);
    if (pid === 0) return { ok: false, error: `exec of ${script} on ${host} failed` };
    return { pid, port };
  } catch (e) {
    if (isScriptDeath(e)) throw e;
    return { ok: false, error: `launch of ${script} on ${host} threw: ${String(e)}` };
  }
}

/**
 * The reply, if it has landed. A helper that is gone without one yields a
 * failed Reply; a helper still at work yields undefined.
 */
export function pollReply(ns: NS, h: Launched): Reply | undefined {
  const alive = ns.isRunning(h.pid);
  const port = ns.getPortHandle(h.port);
  if (!port.empty()) return readReply(port.read());
  return alive ? undefined : { ok: false, error: "helper exited without a reply" };
}

/**
 * Waits for the reply, however long the call takes, as long as the helper
 * lives; then waits up to a second for its process to end. Returns the reply
 * and whether the process is still alive (a misbehaving helper).
 */
export async function awaitReply(ns: NS, h: Launched): Promise<{ reply: Reply; stillRunning: boolean }> {
  const port = ns.getPortHandle(h.port);
  let reply = pollReply(ns, h);
  while (reply === undefined) {
    await Promise.race([port.nextWrite(), pause(LIVENESS_POLL_MS)]);
    reply = pollReply(ns, h);
  }
  const giveUpAt = Date.now() + EXIT_WAIT_MS;
  while (ns.isRunning(h.pid) && Date.now() < giveUpAt) await pause(20);
  return { reply, stillRunning: ns.isRunning(h.pid) };
}

/**
 * A plain timer rather than ns.sleep: ns.sleep left pending after a race
 * would make the next ns call a forbidden concurrent call.
 */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
