// The conductor: the one long-lived script on home. boot.js spawns it
// (temporary) once every file of the release is present. Each iteration
// collects helper replies, builds a snapshot, asks `decide` what to do and
// carries that out. An exception inside an iteration is printed to the
// terminal and the loop carries on after a backoff capped at about 30 s: only
// a reset or the finish line ends it.
//
// Helpers (`helper-contract.ts`): probes are launched and not awaited; their
// reply lands in `snapshot.probes` on a later loop. Action helpers are
// launched one at a time and awaited. A failed launch is "not done": nothing
// is recorded as in flight, so `decide` wants it again next loop.
//
// RAM: everything this file reaches counts, imports included, and any
// identifier named like an NS function is charged. Keep the source free of
// Singularity calls; expensive reads belong to probe helpers.
import type { NS } from "@ns";
import { backoffMs } from "./backoff.ts";
import { decide, type Action, type ProbeReading, type Snapshot } from "./decide.ts";
import { awaitReply, isScriptDeath, launchHelper, pollReply, replyPorts, type Launched } from "./helper-calls.ts";
import type { Json, Reply } from "./helper-contract.ts";
import { HELPER_SCRIPTS, PROBES, type HelperScript, type ProbeName, type ProbeValues } from "./helpers.ts";
import { MILESTONES, milestonesReached } from "./milestones.ts";
import { openRunState } from "./run-state.ts";
import { reachedMilestones, recordMilestone } from "./state.ts";

/** Time between iterations when nothing went wrong. */
const TICK_MS = 1000;
/** A heartbeat line goes to the terminal this often; every beat goes to the log. */
const TERMINAL_BEAT_MS = 60_000;

type Probes = { [P in ProbeName]?: ProbeReading<ProbeValues[P]> };

/** What the conductor remembers between iterations. Lost on a restart, by design. */
type Memory = {
  probes: Probes;
  inFlight: Map<ProbeName, Launched>;
  /** An action helper that replied but had not exited yet. */
  lingeringCall: number | undefined;
  lastCall: Snapshot["lastCall"];
  nextPort: () => number;
};

/** Moves every landed probe reply into the readings. */
function collectProbes(ns: NS, m: Memory): void {
  for (const [name, launched] of m.inFlight) {
    const reply = pollReply(ns, launched);
    if (reply === undefined) continue;
    m.inFlight.delete(name);
    (m.probes as Record<ProbeName, ProbeReading<unknown>>)[name] = { ...reply, atMs: Date.now() };
    ns.print(reply.ok ? `probe ${name}: ok` : `probe ${name}: failed: ${reply.error}`);
  }
}

/**
 * Free RAM on home and on every known host we hold root on right now. A host
 * that vanished (a deleted server) is skipped.
 */
function readFreeRam(ns: NS, m: Memory): Record<string, number> {
  const network = m.probes.network;
  const hosts = new Set(["home", ...(network?.ok ? network.value.hosts : [])]);
  const free: Record<string, number> = {};
  for (const host of hosts) {
    try {
      if (host === "home" || ns.hasRootAccess(host)) free[host] = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
    } catch (e) {
      if (isScriptDeath(e)) throw e;
    }
  }
  return free;
}

function takeSnapshot(ns: NS, m: Memory): Snapshot {
  const helperRamGb: Partial<Record<HelperScript, number>> = {};
  for (const script of HELPER_SCRIPTS) helperRamGb[script] = ns.getScriptRam(script, "home");
  if (m.lingeringCall !== undefined && !ns.isRunning(m.lingeringCall)) m.lingeringCall = undefined;
  return {
    nowMs: Date.now(),
    freeRamGb: readFreeRam(ns, m),
    helperRamGb,
    probes: { ...m.probes },
    probesInFlight: [...m.inFlight.keys()],
    callRunning: m.lingeringCall !== undefined,
    ...(m.lastCall ? { lastCall: m.lastCall } : {}),
  };
}

async function carryOut(ns: NS, m: Memory, actions: readonly Action[]): Promise<void> {
  for (const action of actions) {
    switch (action.kind) {
      case "probe": {
        const script = PROBES[action.name].script;
        const launched = launchHelper(ns, script, action.host, null, m.nextPort());
        if ("pid" in launched) m.inFlight.set(action.name, launched);
        else ns.print(`probe ${action.name}: not launched: ${launched.error}`);
        break;
      }
      case "call": {
        const reply = await callHelper(ns, m, action.script, action.host, action.arg);
        m.lastCall = { script: action.script, arg: action.arg, atMs: Date.now(), reply };
        ns.print(reply.ok ? `call ${action.script}: ok` : `call ${action.script}: failed: ${reply.error}`);
        break;
      }
      default: {
        const unknown: never = action;
        throw new Error(`conductor: unknown action ${JSON.stringify(unknown)}`);
      }
    }
  }
}

/** One action helper, start to finish. Never two at once. */
async function callHelper(ns: NS, m: Memory, script: HelperScript, host: string, arg: Json): Promise<Reply> {
  if (m.lingeringCall !== undefined && ns.isRunning(m.lingeringCall)) {
    return { ok: false, error: "another action helper is still running" };
  }
  const launched = launchHelper(ns, script, host, arg, m.nextPort());
  if (!("pid" in launched)) return launched;
  const { reply, stillRunning } = await awaitReply(ns, launched);
  m.lingeringCall = stillRunning ? launched.pid : undefined;
  return reply;
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const record = openRunState(ns);
  if (record === null) return;
  ns.tprint("conductor: up");
  const m: Memory = { probes: {}, inFlight: new Map(), lingeringCall: undefined, lastCall: undefined, nextPort: replyPorts() };
  let beats = 0;
  let lastTerminalBeat = Date.now();
  let failures = 0;
  for (;;) {
    try {
      collectProbes(ns, m);
      const snapshot = takeSnapshot(ns, m);
      await carryOut(ns, m, decide(snapshot));
      for (const name of milestonesReached(MILESTONES, snapshot, reachedMilestones(record.state))) {
        record.update((state) => recordMilestone(state, name, snapshot.nowMs));
        ns.tprint(`conductor: milestone ${name}`);
      }
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
      if (isScriptDeath(e)) throw e;
      failures++;
      const pause = backoffMs(failures);
      ns.tprint(`ERROR conductor: iteration failed (${failures} in a row), retrying in ${pause / 1000} s: ${String(e)}`);
      await ns.sleep(pause);
    }
  }
}
