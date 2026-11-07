// The conductor: the one long-lived script on home. boot.js spawns it
// (temporary) once every file of the release is present. Each iteration
// builds a snapshot, asks `decide` what to do and carries that out. An
// exception inside an iteration is printed to the terminal and the loop
// carries on after a backoff capped at about 30 s: only a reset or the finish
// line ends it. For now there are no actions, so it only beats.
//
// RAM: everything this file reaches counts, imports included, and any
// identifier named like an NS function is charged. Keep the source free of
// Singularity calls; expensive reads belong to helper scripts.
import type { NS } from "@ns";
import { backoffMs } from "./backoff.ts";
import { decide, type Action, type Snapshot } from "./decide.ts";
import { openRunState } from "./run-state.ts";

/** Time between iterations when nothing went wrong. */
const TICK_MS = 1000;
/** A heartbeat line goes to the terminal this often; every beat goes to the log. */
const TERMINAL_BEAT_MS = 60_000;

function takeSnapshot(): Snapshot {
  return { nowMs: Date.now() };
}

function carryOut(_ns: NS, actions: readonly Action[]): void {
  for (const action of actions) {
    // No action kinds exist yet; `action` is `never`.
    throw new Error(`conductor: unknown action ${JSON.stringify(action)}`);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const record = openRunState(ns);
  if (record === null) return;
  ns.tprint("conductor: up");
  let beats = 0;
  let lastTerminalBeat = Date.now();
  let failures = 0;
  for (;;) {
    try {
      const snapshot = takeSnapshot();
      carryOut(ns, decide(snapshot));
      record.keep(snapshot.nowMs);
      beats++;
      ns.print(`heartbeat ${beats} at ${new Date(snapshot.nowMs).toISOString()}`);
      if (snapshot.nowMs - lastTerminalBeat >= TERMINAL_BEAT_MS) {
        ns.tprint(`conductor: heartbeat ${beats}`);
        lastTerminalBeat = snapshot.nowMs;
      }
      failures = 0;
      await ns.sleep(TICK_MS);
    } catch (e) {
      // A kill (reset, `kill`) surfaces as a thrown ScriptDeath: let it end the script.
      if (e instanceof Error && e.name === "ScriptDeath") throw e;
      failures++;
      const pause = backoffMs(failures);
      ns.tprint(`ERROR conductor: iteration failed (${failures} in a row), retrying in ${pause / 1000} s: ${String(e)}`);
      await ns.sleep(pause);
    }
  }
}
