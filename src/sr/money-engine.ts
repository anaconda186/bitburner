// The money engine's scheduler (seam B, spec #41): an engine snapshot plus the
// conductor's orders in, job launches out. Pure and ns-free; the worker
// `h/engine.ts` reads the snapshot, `exec`s the jobs on the job scripts under
// `sr/j/` and remembers them while they are in flight.
//
// Stage built so far: the drain. It hacks rooted servers' money without
// growing it back, filling the RAM the split gives it.
//
// RAM: the engine and the conductor import this file, and the game charges any
// identifier named like an NS function. Never name anything here hack, grow,
// weaken, share, run, exec, scan or probe; strings ("hack") are free.
import { hackChance, hackFraction, hackSecurityRise, hackTimeMs, type HackTarget, type Hacker, type NodeMults } from "./formulas.ts";

/** The job scripts, one NS call each (src/sr/j/). */
export const HACK_JOB = "sr/j/hack.js";
export const GROW_JOB = "sr/j/grow.js";
export const WEAKEN_JOB = "sr/j/weaken.js";
export type JobScript = typeof HACK_JOB | typeof GROW_JOB | typeof WEAKEN_JOB;

/**
 * GB per thread of each job script: base 1.6 plus its one call (hack 0.1, grow
 * and weaken 0.15). src/sr/money-engine.ram.test.ts checks them against the
 * game's own RAM calculator.
 */
export const JOB_RAM_GB: Readonly<Record<JobScript, number>> = {
  [HACK_JOB]: 1.7,
  [GROW_JOB]: 1.75,
  [WEAKEN_JOB]: 1.75,
};

/**
 * How the engine's RAM is shared out (spec #41 "RAM split kinds"): the
 * fraction for money, for hacking exp and for share (`sharing`: a field called `share` would be charged as ns.share, 2.4 GB). All 0 is "off".
 */
export type RamSplit = { readonly money: number; readonly exp: number; readonly sharing: number };
export const SPLIT_OFF: RamSplit = { money: 0, exp: 0, sharing: 0 };
export const SPLIT_MONEY: RamSplit = { money: 1, exp: 0, sharing: 0 };

/** What the conductor keeps on the engine's control port. */
export type EngineOrders = {
  readonly split: RamSplit;
  /** RAM on home the engine never fills, so probes and action helpers still fit there. */
  readonly homeReserveGb: number;
  /** RAM the engine never fills on other hosts, by host (#54: the driver's room on its cloud server). */
  readonly hostReserveGb?: Readonly<Record<string, number>>;
};

/** No RAM for anything; what an empty or garbled control port means. */
export const ORDERS_OFF: EngineOrders = { split: SPLIT_OFF, homeReserveGb: 0 };

const isShare = (x: unknown): x is number => typeof x === "number" && x >= 0 && x <= 1;

/**
 * The orders on the control port. The port is empty after a reload or a reset
 * until the conductor writes it again, and an empty port ("NULL PORT DATA") or
 * anything that isn't well-formed orders is off: the engine launches nothing.
 */
export function readOrders(raw: unknown): EngineOrders {
  if (typeof raw !== "object" || raw === null) return ORDERS_OFF;
  const { split, homeReserveGb, hostReserveGb } = raw as { split?: unknown; homeReserveGb?: unknown; hostReserveGb?: unknown };
  if (typeof split !== "object" || split === null) return ORDERS_OFF;
  const { money, exp, sharing } = split as Record<string, unknown>;
  if (!isShare(money) || !isShare(exp) || !isShare(sharing) || money + exp + sharing > 1 + RAM_EPSILON) return ORDERS_OFF;
  if (typeof homeReserveGb !== "number" || !(homeReserveGb >= 0)) return ORDERS_OFF;
  const orders = { split: { money, exp, sharing }, homeReserveGb };
  if (hostReserveGb === undefined) return orders;
  if (typeof hostReserveGb !== "object" || hostReserveGb === null) return ORDERS_OFF;
  const reserves = Object.entries(hostReserveGb);
  if (!reserves.every(([, gb]) => typeof gb === "number" && gb >= 0)) return ORDERS_OFF;
  return { ...orders, hostReserveGb: Object.fromEntries(reserves) as Record<string, number> };
}

/** A job is dropped from the in-flight book this long after it should have landed (timers only fire late). */
export const LAND_SLACK_MS = 1000;

/** The jobs that may not have landed yet. */
export function stillInFlight(jobs: readonly Job[], nowMs: number): Job[] {
  return jobs.filter((j) => nowMs <= j.landsAtMs + LAND_SLACK_MS);
}

/** A server the engine may launch jobs on (rooted), as read this loop. */
export type HostView = { readonly host: string; readonly maxRamGb: number; readonly usedRamGb: number };

/** A rooted server with money, as read this loop. */
export type TargetView = HackTarget & { readonly host: string; readonly moneyAvailable: number };

/** One launch: `threads` of `script` on `host` against `target`, plus what the scheduler expects of it. */
export type Job = {
  readonly script: JobScript;
  readonly host: string;
  readonly target: string;
  readonly threads: number;
  readonly additionalMsec: number;
  /** When it should land, for the in-flight book. */
  readonly landsAtMs: number;
  /** The share of the target's money it should take when it lands (0..1). */
  readonly steal: number;
  /** Security it should add when it lands. */
  readonly securityRise: number;
};

export type EngineSnapshot = {
  readonly nowMs: number;
  /** Where the engine itself runs, and its own RAM. */
  readonly engineHost: string;
  readonly engineRamGb: number;
  readonly hosts: readonly HostView[];
  readonly targets: readonly TargetView[];
  readonly player: Hacker;
  readonly mults: NodeMults;
  /** Jobs this engine launched that haven't landed yet. */
  readonly inFlight: readonly Job[];
};

/** Rounding slack for RAM sums. */
const RAM_EPSILON = 1e-9;

/** The jobs to launch now. */
export function schedule(s: EngineSnapshot, orders: EngineOrders): Job[] {
  return drain(s, orders);
}

/** GB a list of jobs holds. */
function ramOf(jobs: readonly Job[]): number {
  return jobs.reduce((gb, j) => gb + j.threads * JOB_RAM_GB[j.script], 0);
}

/** Free RAM on a host right now. */
const freeNowGb = (h: HostView): number => Math.max(0, h.maxRamGb - h.usedRamGb);

/**
 * The engine should start again on home (spec #41 user story 64: it starts on
 * the first rooted 16 GB server and moves to home once home has room): it
 * runs elsewhere, and home has room for it now beside the reserve.
 */
export function moveHome(s: EngineSnapshot, orders: EngineOrders): boolean {
  const home = s.hosts.find((h) => h.host === "home");
  if (s.engineHost === "home" || home === undefined) return false;
  return freeNowGb(home) + RAM_EPSILON >= s.engineRamGb + orders.homeReserveGb;
}

/**
 * RAM each host has free for new jobs now, and the engine's whole pool: what
 * it would have if its own jobs in flight were done. The split is a share of
 * that pool. Home keeps the reserve free, and also the engine's own room while
 * the engine runs elsewhere and its jobs are what keep it from moving there.
 */
function ramLedger(s: EngineSnapshot, orders: EngineOrders): { free: Map<string, number>; poolGb: number } {
  const free = new Map<string, number>();
  let poolGb = 0;
  for (const h of s.hosts) {
    const ownGb = ramOf(s.inFlight.filter((j) => j.host === h.host));
    let reserveGb = orders.hostReserveGb?.[h.host] ?? 0;
    if (h.host === "home") {
      reserveGb = orders.homeReserveGb;
      const roomOnceLanded = freeNowGb(h) + ownGb - reserveGb;
      if (s.engineHost !== "home" && roomOnceLanded + RAM_EPSILON >= s.engineRamGb) reserveGb += s.engineRamGb;
    }
    free.set(h.host, Math.max(0, freeNowGb(h) - reserveGb));
    poolGb += Math.max(0, freeNowGb(h) + ownGb - reserveGb);
  }
  return { free, poolGb };
}

/** Money below this is not worth a thread. */
const MIN_DRAIN_MONEY = 1;

/**
 * A target as it will be once everything launched at it has landed: its
 * money after each hack's steal, its security after each hack's rise.
 */
type Projection = { readonly now: TargetView; money: number; security: number };

function project(t: TargetView, inFlight: readonly Job[]): Projection {
  let money = t.moneyAvailable;
  let security = t.hackDifficulty;
  for (const j of inFlight) {
    if (j.target !== t.host || j.script !== HACK_JOB) continue;
    money *= 1 - j.steal;
    security = Math.min(100, security + j.securityRise);
  }
  return { now: t, money, security };
}

/**
 * Drain: hack the money that's there, never grow it back. Each step gives the
 * target paying most per GB-second (chance × money × one thread's fraction per
 * hack-second) the threads it takes to steal what will be left of its money,
 * on the host with the most room, within the money share of the RAM. A hack's
 * duration is fixed at launch (today's security); its chance and steal come
 * when it lands, so they are judged on the projected target.
 */
function drain(s: EngineSnapshot, orders: EngineOrders): Job[] {
  const perThread = JOB_RAM_GB[HACK_JOB];
  const { free, poolGb } = ramLedger(s, orders);
  let budgetGb = orders.split.money * poolGb - ramOf(s.inFlight);
  const plans = s.targets.map((t) => project(t, s.inFlight));
  const atLanding = (p: Projection): HackTarget => ({ ...p.now, hackDifficulty: p.security });
  const rate = (p: Projection): number => {
    const landing = atLanding(p);
    const perThreadMoney = p.money * hackFraction(landing, s.player, s.mults);
    return (hackChance(landing, s.player) * perThreadMoney) / (perThread * hackTimeMs(p.now, s.player, s.mults));
  };
  const jobs: Job[] = [];
  for (;;) {
    const host = roomiest(free);
    if (host === undefined) break;
    const room = Math.min(free.get(host) ?? 0, budgetGb);
    const fits = Math.floor((room + RAM_EPSILON) / perThread);
    if (fits < 1) break;
    let best: Projection | undefined;
    let bestRate = 0;
    for (const p of plans) {
      if (p.money < MIN_DRAIN_MONEY) continue;
      const r = rate(p);
      if (r > bestRate) [best, bestRate] = [p, r];
    }
    if (best === undefined) break;
    const fraction = hackFraction(atLanding(best), s.player, s.mults);
    const threads = Math.min(Math.ceil(1 / fraction), fits);
    const job: Job = {
      script: HACK_JOB,
      host,
      target: best.now.host,
      threads,
      additionalMsec: 0,
      landsAtMs: s.nowMs + hackTimeMs(best.now, s.player, s.mults),
      steal: Math.min(1, fraction * threads),
      securityRise: hackSecurityRise(threads, fraction),
    };
    jobs.push(job);
    free.set(host, (free.get(host) ?? 0) - threads * perThread);
    budgetGb -= threads * perThread;
    best.money *= 1 - job.steal;
    best.security = Math.min(100, best.security + job.securityRise);
  }
  return jobs;
}

/** The host with the most free RAM (ties by name). */
function roomiest(free: ReadonlyMap<string, number>): string | undefined {
  let best: string | undefined;
  for (const [host, gb] of free) {
    const bestGb = best === undefined ? -1 : (free.get(best) ?? 0);
    if (gb > bestGb || (gb === bestGb && best !== undefined && host < best)) best = host;
  }
  return best;
}
