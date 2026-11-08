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
import { decide, type Action, type ProbeReading, type Snapshot, type WorkerView } from "./decide.ts";
import { awaitReply, isScriptDeath, launchHelper, pollReply, replyPorts, type Launched } from "./helper-calls.ts";
import { readWorkerReport, type Json, type Reply } from "./helper-contract.ts";
import { CALLS, HELPER_SCRIPTS, PROBES, WORKERS, type HelperScript, type ProbeName, type ProbeValues, type WorkerName, type WorkerSpec } from "./helpers.ts";
import { MILESTONES, milestonesReached } from "./milestones.ts";
import { openRunState } from "./run-state.ts";
import { finishSummary, formatDuration, runFinished, splitLine, splitStats } from "./splits.ts";
import {
  accountStart, buildOnHome, MANIFEST_FILE, noteBuild, reachedMilestones, recordMilestone, type ConductorStart,
} from "./state.ts";
import { afterLaunch, NO_WORKER, observeWorker, type WorkerBook } from "./workers.ts";

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
  /** Each long-lived worker launched or found alive since this conductor started. */
  workers: { [W in WorkerName]?: WorkerBook };
  /** Cloud servers bought since this conductor started (the network probe may not list them yet). */
  bought: string[];
};

/**
 * Where each worker stands: alive if the process this conductor launched, or
 * the one named in the worker's own status report, is running. The report
 * lets a conductor started again by boot find a worker it didn't launch;
 * after a reload the port is empty and nothing is running.
 */
function readWorkers(ns: NS, m: Memory, nowMs: number): Snapshot["workers"] {
  const views: { [W in WorkerName]?: WorkerView } = {};
  for (const name of Object.keys(WORKERS) as WorkerName[]) {
    const report = readWorkerReport(ns.getPortHandle(WORKERS[name].port).peek());
    const book = m.workers[name];
    if (book === undefined && report === undefined) continue;
    const alivePid = [book?.pid, report?.pid].find((pid) => pid !== undefined && ns.isRunning(pid));
    const next = observeWorker(book ?? NO_WORKER, alivePid, nowMs);
    m.workers[name] = next;
    views[name] = {
      running: alivePid !== undefined,
      failures: next.failures,
      ...(next.lastFailAtMs !== undefined ? { lastFailAtMs: next.lastFailAtMs } : {}),
      ...(report ? { report } : {}),
    };
  }
  return views;
}

/** What is on each worker's control port (peek: the worker reads it the same way). */
function readControls(ns: NS): Snapshot["controls"] {
  const controls: { [W in WorkerName]?: Json } = {};
  for (const name of Object.keys(WORKERS) as WorkerName[]) {
    const spec: WorkerSpec = WORKERS[name];
    if (spec.control === undefined) continue;
    const handle = ns.getPortHandle(spec.control);
    if (!handle.empty()) controls[name] = handle.peek() as Json;
  }
  return controls;
}

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

function takeSnapshot(ns: NS, m: Memory, category: string): Snapshot {
  const helperRamGb: Partial<Record<HelperScript, number>> = {};
  for (const script of HELPER_SCRIPTS) helperRamGb[script] = ns.getScriptRam(script, "home");
  if (m.lingeringCall !== undefined && !ns.isRunning(m.lingeringCall)) m.lingeringCall = undefined;
  const nowMs = Date.now();
  return {
    nowMs,
    category,
    freeRamGb: readFreeRam(ns, m),
    helperRamGb,
    probes: { ...m.probes },
    probesInFlight: [...m.inFlight.keys()],
    callRunning: m.lingeringCall !== undefined,
    ...(m.lastCall ? { lastCall: m.lastCall } : {}),
    workers: readWorkers(ns, m, nowMs),
    controls: readControls(ns),
    ...(m.bought.length > 0 ? { boughtServers: [...m.bought] } : {}),
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
        if (action.script === CALLS.buyServer && reply.ok && typeof reply.value === "string") m.bought.push(reply.value);
        ns.print(reply.ok ? `call ${action.script}: ok` : `call ${action.script}: failed: ${reply.error}`);
        break;
      }
      case "start": {
        const spec: WorkerSpec = WORKERS[action.worker];
        const launched = launchHelper(ns, spec.script, action.host, action.arg, spec.port, spec.files, spec.survivesReload);
        const pid = "pid" in launched ? launched.pid : undefined;
        m.workers[action.worker] = afterLaunch(m.workers[action.worker] ?? NO_WORKER, pid, Date.now());
        if ("pid" in launched) ns.tprint(`conductor: started ${action.worker} on ${action.host}`);
        else ns.tprint(`WARN conductor: ${action.worker} not started: ${launched.error}`);
        break;
      }
      case "control": {
        const port = (WORKERS[action.worker] as WorkerSpec).control;
        if (port === undefined) throw new Error(`conductor: ${action.worker} has no control port`);
        ns.clearPort(port);
        ns.writePort(port, action.message);
        ns.print(`control ${action.worker}: ${JSON.stringify(action.message)}`);
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
  // Every boot with no live conductor lands here. boot.js leaves an existing
  // state file alone, so the conductor records the build and the start (#49).
  let start: ConductorStart = { atMs: Date.now(), savedUpdatedAt: record.state.updatedAt };
  let firstLoop = true;
  record.update((state) => noteBuild(state, buildOnHome(ns.read(MANIFEST_FILE)), start.atMs));
  let startAccounted = false;
  const m: Memory = { probes: {}, inFlight: new Map(), lingeringCall: undefined, lastCall: undefined, nextPort: replyPorts(), workers: {}, bought: [] };
  let beats = 0;
  let lastTerminalBeat = Date.now();
  let failures = 0;
  for (;;) {
    try {
      collectProbes(ns, m);
      const snapshot = takeSnapshot(ns, m, record.state.category);
      if (firstLoop) {
        // A casino report already on its port: this load was one of its script reloads (#56).
        start = { ...start, afterCasino: snapshot.workers.casino !== undefined };
        firstLoop = false;
      }
      await carryOut(ns, m, decide(snapshot));
      // This start is a reload, a reset or the run's first: the route probe's
      // reset times tell which, so it is accounted once its reading lands.
      const route = snapshot.probes.route;
      if (!startAccounted && route?.ok) {
        const before = record.state.reloads.length;
        record.update((state) => accountStart(state, start, route.value));
        if (record.state.reloads.length > before) {
          ns.tprint(`conductor: reload; ${formatDuration(start.atMs - start.savedUpdatedAt)} lost since the last save`);
        }
        startAccounted = true;
      }
      const due = milestonesReached(MILESTONES, snapshot, reachedMilestones(record.state));
      for (const name of due) {
        record.update((state) => recordMilestone(state, name, snapshot.nowMs, splitStats(snapshot)));
        ns.tprint(splitLine(record.state));
      }
      if (due.length > 0 && runFinished(record.state)) for (const line of finishSummary(record.state)) ns.tprint(line);
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
