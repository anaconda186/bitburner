// Worker `engine`: the money engine (spec #41, seam B). A long-lived helper the
// conductor starts, and starts again after a reload, a reset or a death.
// Each loop it reads its orders off its control port, reads the world (every
// rooted server's RAM, every target's money, security and level, the
// player), asks `schedule` which jobs to launch, `exec`s them on the job
// scripts under sr/j/ and posts a report to its status port.
//
// Launched like a helper: args[0] its JSON argument ({ control }, the control
// port; plus `inFlight` when it handed over to a copy of itself), args[1] its
// status port (WORKERS.engine in `../helpers.ts`).
//
// It keeps no state it can't re-read. Its only memory is the jobs it launched
// that haven't landed, which a reload or reset kills anyway; an engine that
// died alone forgets the ones still on their way, and at worst hacks those
// targets again once.
//
// It starts wherever the conductor put it (the first rooted 16 GB server on a
// fresh save) and starts itself again on home once home has room (`moveHome`).
//
// This thin shell is covered by the in-game checks only. It imports nothing
// but `./serve.ts`, `../money-engine.ts` and `../formulas.ts` (copied with it
// off home: WORKERS.files). RAM: see tools/ram-budget.ts.
import type { NS } from "@ns";
import {
  GROW_JOB,
  HACK_JOB,
  moveHome,
  outlook,
  readOrders,
  schedule,
  stillInFlight,
  WEAKEN_JOB,
  type EngineOrders,
  type EngineOutlook,
  type EngineSnapshot,
  type HostView,
  type Job,
  type RamSplit,
  type TargetView,
} from "../money-engine.ts";
import { decodeHelperArgs, postReport } from "./serve.ts";

/** What the engine posts each loop (WorkerReport.value). */
export type EngineNews = {
  readonly host: string;
  readonly split: RamSplit;
  /** Jobs and threads it has in flight now. */
  readonly jobs: number;
  readonly threads: number;
  /** Jobs launched, and launches the game refused, since this engine started. */
  readonly launched: number;
  readonly refused: number;
  readonly lastError: string | null;
  /** What its RAM is expected to earn, for the fleet rule (#57); null with nothing to batch. */
  readonly outlook: EngineOutlook | null;
};

const TICK_MS = 500;
const JOB_SCRIPTS = [HACK_JOB, GROW_JOB, WEAKEN_JOB];

function isScriptDeath(e: unknown): boolean {
  return e instanceof Error && e.name === "ScriptDeath";
}

/** Every server reachable from home (scan skips darknet servers, which hack can't touch). */
function allHosts(ns: NS): string[] {
  const seen = ["home"];
  for (let i = 0; i < seen.length; i++) {
    for (const next of ns.scan(seen[i])) if (!seen.includes(next)) seen.push(next);
  }
  return seen;
}

function readWorld(ns: NS, nowMs: number, inFlight: readonly Job[], orders: EngineOrders): EngineSnapshot {
  const hosts: HostView[] = [];
  const targets: TargetView[] = [];
  for (const host of allHosts(ns)) {
    if (!ns.hasRootAccess(host)) continue;
    hosts.push({ host, maxRamGb: ns.getServerMaxRam(host), usedRamGb: ns.getServerUsedRam(host) });
    if (host === "home") continue;
    const moneyMax = ns.getServerMaxMoney(host);
    if (!(moneyMax > 0)) continue;
    targets.push({
      host,
      hasAdminRights: true,
      moneyAvailable: ns.getServerMoneyAvailable(host),
      moneyMax,
      hackDifficulty: ns.getServerSecurityLevel(host),
      minDifficulty: ns.getServerMinSecurityLevel(host),
      baseDifficulty: ns.getServerBaseSecurityLevel(host),
      serverGrowth: ns.getServerGrowth(host),
      requiredHackingSkill: ns.getServerRequiredHackingLevel(host),
    });
  }
  const p = ns.getPlayer();
  const self = ns.self();
  return {
    nowMs,
    engineHost: self.server,
    engineRamGb: self.ramUsage * self.threads,
    hosts,
    targets,
    player: { skills: { hacking: p.skills.hacking, intelligence: p.skills.intelligence }, mults: p.mults },
    // BitNode multipliers need SF5 and 4 GB to read: the conductor sends them
    // with the orders (its bitnode probe, or its table before SF5).
    mults: orders.mults,
    inFlight,
  };
}

/** The jobs a handing-over engine passed on: anything that doesn't look like one is dropped. */
function carriedJobs(raw: unknown): Job[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (j): j is Job =>
      typeof j === "object" && j !== null && JOB_SCRIPTS.includes((j as Job).script) && typeof (j as Job).landsAtMs === "number",
  );
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const decoded = decodeHelperArgs(ns.args);
  const arg = decoded.ok ? (decoded.arg as { control?: unknown; inFlight?: unknown } | null) : null;
  const control = arg?.control;
  if (decoded.port === undefined || !decoded.ok || typeof control !== "number") {
    ns.tprint(`ERROR engine: bad arguments ${JSON.stringify(ns.args)}`);
    return;
  }
  const port = decoded.port;
  let inFlight = carriedJobs(arg?.inFlight);
  const copied = new Set<string>(["home"]);
  let news: EngineNews = {
    host: ns.self().server,
    split: readOrders(ns.peek(control)).split,
    jobs: inFlight.length,
    threads: 0,
    launched: 0,
    refused: 0,
    lastError: null,
    outlook: null,
  };
  postReport(ns, port, news);
  let failures = 0;
  for (;;) {
    try {
      const nowMs = Date.now();
      inFlight = stillInFlight(inFlight, nowMs);
      const orders = readOrders(ns.peek(control));
      const world = readWorld(ns, nowMs, inFlight, orders);
      if (moveHome(world, orders)) {
        const self = ns.self();
        const pid = ns.exec(self.filename, "home", { threads: 1, temporary: true }, JSON.stringify({ control, inFlight }), port);
        if (pid > 0) {
          postReport(ns, port, { ...news, host: "home" }, pid);
          ns.tprint(`engine: moved from ${world.engineHost} to home`);
          return;
        }
      }
      let launched = 0;
      let refused = 0;
      for (const job of schedule(world, orders)) {
        if (!copied.has(job.host)) {
          if (!ns.scp(JOB_SCRIPTS, job.host, "home")) {
            refused++;
            continue;
          }
          copied.add(job.host);
        }
        const pid = ns.exec(job.script, job.host, { threads: job.threads, temporary: true }, job.target, job.additionalMsec);
        if (pid > 0) {
          inFlight.push(job);
          launched++;
        } else {
          refused++;
          copied.delete(job.host); // the copy may be gone (a reset server); copy again next time
        }
      }
      if (launched > 0) ns.print(`launched ${launched} jobs, ${inFlight.length} in flight`);
      news = {
        host: world.engineHost,
        split: orders.split,
        jobs: inFlight.length,
        threads: inFlight.reduce((n, j) => n + j.threads, 0),
        launched: news.launched + launched,
        refused: news.refused + refused,
        lastError: news.lastError,
        outlook: outlook(world, orders) ?? null,
      };
      failures = 0;
    } catch (e) {
      if (isScriptDeath(e)) throw e;
      failures++;
      const text = e instanceof Error ? e.message : String(e);
      if (failures === 1) ns.tprint(`ERROR engine: loop failed, carrying on: ${text}`);
      else ns.print(`ERROR engine: loop failed (${failures} in a row): ${text}`);
      news = { ...news, lastError: text };
    }
    postReport(ns, port, news);
    await ns.sleep(TICK_MS);
  }
}
