// The conductor's hold on the state file: the thin `ns` shell around the pure
// rules in state.ts. Only the conductor imports this; boot.js creates the file
// once and every other script leaves it alone.
import type { NS } from "@ns";
import { STATE_FILE, parseState, stateWrite, type RunState, type Written } from "./state.ts";

export type RunRecord = {
  /** The run's state as last kept. */
  readonly state: RunState;
  /** Writes the file if the state changed or the heartbeat is due. */
  keep(nowMs: number): void;
};

/**
 * Reads the state file. If this build can't use it (missing, broken, or a
 * newer version than it knows), prints why and returns null: the conductor
 * then refuses to run, leaving the file as it is.
 */
export function openRunState(ns: NS): RunRecord | null {
  const opened = parseState(ns.read(STATE_FILE));
  if (!opened.ok) {
    ns.tprint(`ERROR conductor: ${opened.error}`);
    return null;
  }
  let state = opened.state;
  let last: Written | null = null;
  return {
    get state() {
      return state;
    },
    keep(nowMs) {
      const due = stateWrite(state, last, nowMs);
      if (due === null) return;
      ns.write(STATE_FILE, due.text, "w");
      state = due.state;
      last = { text: due.text, atMs: nowMs };
    },
  };
}
