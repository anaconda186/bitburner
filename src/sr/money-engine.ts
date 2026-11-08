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
import {
  grownMoney, growSecurityRise, growThreadsFor, growTimeMs, hackChance, hackFraction, hackSecurityRise, hackTimeMs,
  NEUTRAL_MULTS, weakenAmount, weakenTimeMs, type HackTarget, type Hacker, type NodeMults, type Target,
} from "./formulas.ts";
import { pickMults } from "./node-mults.ts";

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
  /**
   * The BitNode multipliers in force (#57): the engine can't read them itself
   * (getBitNodeMultipliers needs SF5 and 4 GB), so the conductor sends them.
   */
  readonly mults: NodeMults;
  /** RAM the engine never fills on other hosts, by host (#54: the driver's room on its cloud server). */
  readonly hostReserveGb?: Readonly<Record<string, number>>;
};

/** No RAM for anything; what an empty or garbled control port means. */
export const ORDERS_OFF: EngineOrders = { split: SPLIT_OFF, homeReserveGb: 0, mults: NEUTRAL_MULTS };

const isShare = (x: unknown): x is number => typeof x === "number" && x >= 0 && x <= 1;

/**
 * The orders on the control port. The port is empty after a reload or a reset
 * until the conductor writes it again, and an empty port ("NULL PORT DATA") or
 * anything that isn't well-formed orders is off: the engine launches nothing.
 */
export function readOrders(raw: unknown): EngineOrders {
  if (typeof raw !== "object" || raw === null) return ORDERS_OFF;
  const { split, homeReserveGb, hostReserveGb, mults: rawMults } = raw as {
    split?: unknown; homeReserveGb?: unknown; hostReserveGb?: unknown; mults?: unknown;
  };
  if (typeof split !== "object" || split === null) return ORDERS_OFF;
  const { money, exp, sharing } = split as Record<string, unknown>;
  if (!isShare(money) || !isShare(exp) || !isShare(sharing) || money + exp + sharing > 1 + RAM_EPSILON) return ORDERS_OFF;
  if (typeof homeReserveGb !== "number" || !(homeReserveGb >= 0)) return ORDERS_OFF;
  const mults = pickMults(rawMults);
  if (mults === undefined) return ORDERS_OFF;
  const orders = { split: { money, exp, sharing }, homeReserveGb, mults };
  if (hostReserveGb === undefined) return orders;
  if (typeof hostReserveGb !== "object" || hostReserveGb === null) return ORDERS_OFF;
  const reserves = Object.entries(hostReserveGb);
  if (!reserves.every(([, gb]) => typeof gb === "number" && gb >= 0)) return ORDERS_OFF;
  return { ...orders, hostReserveGb: Object.fromEntries(reserves) as Record<string, number> };
}

/**
 * What the engine expects its RAM to earn (#57), for the fleet rule's
 * payback: modelled steady batch income on its target at today's level, on
 * the RAM it has (`poolGb`) and on twice that. The difference over `poolGb`
 * is what one more GB earns, at most (income per GB falls as RAM grows).
 */
export type EngineOutlook = {
  readonly target: string;
  readonly poolGb: number;
  readonly incomePerSec: number;
  readonly incomeAt2xPerSec: number;
};

const isAmount = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

/** An outlook from the engine's report, or undefined if it isn't one. */
export function readOutlook(raw: unknown): EngineOutlook | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { target, poolGb, incomePerSec, incomeAt2xPerSec } = raw as Record<string, unknown>;
  if (typeof target !== "string" || !isAmount(poolGb) || !isAmount(incomePerSec) || !isAmount(incomeAt2xPerSec)) return undefined;
  return { target, poolGb, incomePerSec, incomeAt2xPerSec };
}

/** A job is dropped from the in-flight book this long after it should have landed (timers only fire late). */
export const LAND_SLACK_MS = 1000;

/** The jobs that may not have landed yet. */
export function stillInFlight(jobs: readonly Job[], nowMs: number): Job[] {
  return jobs.filter((j) => nowMs <= j.landsAtMs + LAND_SLACK_MS);
}

/** A server the engine may launch jobs on (rooted), as read this loop. */
export type HostView = { readonly host: string; readonly maxRamGb: number; readonly usedRamGb: number };

/** A rooted server that can hold money, as read this loop. */
export type TargetView = HackTarget & {
  readonly host: string;
  readonly moneyAvailable: number;
  readonly moneyMax: number;
  /** The security weakens stop at. */
  readonly minDifficulty: number;
  /** The security it started at, which sets the hacking exp each thread earns (#58). */
  readonly baseDifficulty: number;
  readonly serverGrowth: number;
};

/**
 * What a job is for (#58): money (`drain`, `batch`, and `prep` for a target
 * being made ready), hacking exp (`farm`) or share (`sharing`). Each draws on
 * its own part of the RAM split.
 */
export type Purpose = "drain" | "batch" | "prep" | "farm" | "sharing";
const MONEY_PURPOSES: readonly Purpose[] = ["drain", "batch", "prep"];

/** One launch: `threads` of `script` on `host` against `target`, plus what the scheduler expects of it. */
export type Job = {
  readonly script: JobScript;
  readonly host: string;
  /** The server it acts on ("" for share, which has none). */
  readonly target: string;
  readonly threads: number;
  readonly additionalMsec: number;
  readonly purpose: Purpose;
  /** When it was launched, and when it should land, for the in-flight book. */
  readonly launchedAtMs: number;
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

/**
 * The jobs to launch now. Batches on one target (`chooseTarget`) when the
 * money RAM can run them at the spacing; the RAM the batch pipeline doesn't
 * need drains the other targets. With too little RAM for batches the engine
 * drains, and batches only once there is nothing left to drain.
 */
export function schedule(s: EngineSnapshot, orders: EngineOrders, t: EngineTunables = ENGINE_TUNABLES): Job[] {
  const { free, poolGb } = ramLedger(s, orders);
  return moneyJobs(s, free, orders.split.money * poolGb, t);
}

/** RAM the engine's jobs in flight for these purposes hold. */
const heldFor = (s: EngineSnapshot, purposes: readonly Purpose[]): number =>
  ramOf(s.inFlight.filter((j) => purposes.includes(j.purpose)));

/**
 * The money part of the split: batches on the chosen target, the next
 * target's prep, and drain on every target nothing else is using.
 */
function moneyJobs(s: EngineSnapshot, free: Map<string, number>, moneyPoolGb: number, t: EngineTunables): Job[] {
  let budgetGb = moneyPoolGb - heldFor(s, MONEY_PURPOSES);
  const { batch: choice, prep } = chooseTarget(s, moneyPoolGb, t);
  const jobs: Job[] = [];
  // Busy targets: drain would undo the work in flight on them.
  const busy = new Set(s.inFlight.filter((j) => j.purpose !== "drain" && j.landsAtMs > s.nowMs).map((j) => j.target));
  if (prep !== undefined) {
    busy.add(prep.host);
    const prepHeld = ramOf(s.inFlight.filter((j) => j.purpose === "prep" && j.target === prep.host));
    const prepared = prepare(s, prep, free, Math.min(budgetGb, t.prepShare * moneyPoolGb - prepHeld), t);
    jobs.push(...prepared);
    budgetGb -= ramOf(prepared);
  }
  let pipelineGb = 0;
  if (choice !== undefined && (!choice.sizing.starved || batchesInFlight(s, choice.target.host))) {
    busy.add(choice.target.host);
    if (!choice.sizing.starved) {
      const launched = batches(s, choice, free, budgetGb, t);
      jobs.push(...launched);
      budgetGb -= ramOf(launched);
      const held = ramOf([...s.inFlight, ...launched].filter((j) => j.target === choice.target.host));
      pipelineGb = Math.max(0, choice.sizing.pipelineGb - held);
    }
  }
  const drained = drain(s, free, budgetGb - pipelineGb, busy);
  jobs.push(...drained);
  if (choice !== undefined && choice.sizing.starved && drained.length === 0) jobs.push(...batches(s, choice, free, budgetGb, t));
  return jobs;
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
    // Jobs past their landing are counted gone: their RAM is in the free reading (or soon will be).
    const ownGb = ramOf(s.inFlight.filter((j) => j.host === h.host && j.landsAtMs > s.nowMs));
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
function drain(s: EngineSnapshot, free: Map<string, number>, budget: number, busy: ReadonlySet<string>): Job[] {
  const perThread = JOB_RAM_GB[HACK_JOB];
  let budgetGb = budget;
  const plans = s.targets.filter((t) => !busy.has(t.host)).map((t) => project(t, s.inFlight));
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
      purpose: "drain",
      launchedAtMs: s.nowMs,
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

// ---------------------------------------------------------------------------
// Batches (#57). A batch is a hack, a weaken for its security, a grow back to
// full money and a weaken for the grow's security, landing in that order a
// landing gap apart. Batches land a spacing apart, continuously; every job is
// launched at once and padded to its landing with additionalMsec, since a
// job's duration is fixed when its call starts, from the target's security
// then. The book of jobs in flight is how the engine knows the target's
// future: the target as it is now, plus every job still to land, applied in
// landing order with the formulas, is what each new batch is planned on.

/** The batch tunables (spec #41 "Tunables": batch spacing 1 s), with the engine's own. */
export const ENGINE_TUNABLES = {
  /** Between one batch's hack landing and the next's. */
  spacingMs: 1000,
  /** Between the landings inside one batch (timers fire late by less than this). */
  landGapMs: 100,
  /**
   * No job is launched on a target while one of its jobs lands within this of
   * now: the new job's duration would be read from the security before it,
   * and the reading of the target may not show it yet.
   */
  guardMs: 50,
  /** Batches are launched up to this long before the earliest landing a weaken allows. */
  launchAheadMs: 2000,
  /** The most of the target's money one batch takes. */
  maxSteal: 0.9,
  /** Projected security this far over the minimum is a bad drift: hacking pauses. */
  badSecurity: 5,
  /** Projected money below this share of the maximum is a bad drift: hacking pauses. */
  badMoney: 0.5,
  /** A new target must earn this many times the current one's to be switched to ("clearly better", #58). */
  switchRatio: 1.25,
  /** The most of the money RAM that preparing the next target may hold (#58: "about 10%"). */
  prepShare: 0.1,
} as const;

export type EngineTunables = { readonly [K in keyof typeof ENGINE_TUNABLES]: number };

/** Security below this over the minimum, or money this close to full, is no drift at all. */
const STATE_EPSILON = 1e-6;

/** A target's money and security at some moment of the projection. */
type TargetState = { readonly money: number; readonly security: number };

/** The full Target the formulas take, at `st`. */
const growable = (t: TargetView, st: TargetState): Target => ({
  ...t,
  moneyAvailable: st.money,
  hackDifficulty: st.security,
});

/** What one job does to the target when it lands (as if a hack succeeds: the worst case). */
function landed(t: TargetView, st: TargetState, j: Job, s: EngineSnapshot): TargetState {
  switch (j.script) {
    case HACK_JOB:
      return { money: st.money * (1 - j.steal), security: Math.min(100, st.security + j.securityRise) };
    case GROW_JOB:
      return {
        money: grownMoney(growable(t, st), s.player, j.threads, 1, s.mults),
        security: Math.min(100, st.security + j.securityRise),
      };
    case WEAKEN_JOB:
      return { money: st.money, security: Math.max(t.minDifficulty, st.security + j.securityRise) };
  }
}

/** The target once `jobs` (all still to land) have landed, from `st`. */
function after(t: TargetView, st: TargetState, jobs: readonly Job[], s: EngineSnapshot): TargetState {
  return [...jobs].sort((a, b) => a.landsAtMs - b.landsAtMs).reduce((acc, j) => landed(t, acc, j, s), st);
}

/** Threads of one batch planned on the target as it will be when its hack lands. */
type BatchThreads = {
  readonly hackThreads: number;
  readonly fraction: number;
  readonly weaken1: number;
  readonly growThreads: number;
  readonly weaken2: number;
  readonly ramGb: number;
};

/**
 * One batch of `hack` threads on the target at `st`: the first weaken takes
 * the security down to the minimum from wherever the hack leaves it, the grow
 * takes the money back to the maximum from what the hack leaves, the second
 * weaken undoes the grow. Drift in `st` is repaired by the same threads.
 */
function batchThreads(t: TargetView, st: TargetState, hackThreads: number, s: EngineSnapshot): BatchThreads {
  const fraction = hackFraction({ ...t, hackDifficulty: st.security }, s.player, s.mults);
  const steal = Math.min(1, hackThreads * fraction);
  const perWeaken = weakenAmount(1, 1, s.mults);
  const toMin = st.security + hackSecurityRise(hackThreads, fraction) - t.minDifficulty;
  const weaken1 = Math.max(0, Math.ceil(toMin / perWeaken - 1e-9));
  const growThreads = growThreadsFor(growable(t, { money: st.money * (1 - steal), security: t.minDifficulty }), s.player, t.moneyMax, 1, s.mults);
  const weaken2 = Math.ceil(growSecurityRise(growThreads) / perWeaken - 1e-9);
  const ramGb =
    hackThreads * JOB_RAM_GB[HACK_JOB] + (weaken1 + weaken2) * JOB_RAM_GB[WEAKEN_JOB] + growThreads * JOB_RAM_GB[GROW_JOB];
  return { hackThreads, fraction, weaken1, growThreads, weaken2, ramGb };
}

/** How batches on a prepared target would run on `poolGb`, and what they would earn. */
type Sizing = {
  /** Hack threads per batch. */
  readonly hackThreads: number;
  /** Batches holding RAM at once: one per spacing over a weaken plus the launch lead. */
  readonly held: number;
  /** Even one hack thread per batch doesn't fit `held` times: batches would come less often than the spacing. */
  readonly starved: boolean;
  /** RAM the whole pipeline holds once full. */
  readonly pipelineGb: number;
  readonly incomePerSec: number;
};

/**
 * Sizes batches to fill `poolGb` on the target once prepared (minimum
 * security, full money): the most hack threads per batch whose batch fits
 * `held` times, up to the most a batch may steal. The income is the expected
 * money a second: chance × steal × max money × batches a second.
 */
function sizeBatches(t: TargetView, poolGb: number, s: EngineSnapshot, tun: EngineTunables): Sizing | undefined {
  // A grow goes on one host, so no batch's grow is bigger than the biggest host.
  const growCap = Math.floor(Math.max(0, ...s.hosts.map((h) => h.maxRamGb)) / JOB_RAM_GB[GROW_JOB]);
  if (!(poolGb > 0)) return undefined;
  const prepared: TargetState = { money: t.moneyMax, security: t.minDifficulty };
  const at = { ...t, hackDifficulty: t.minDifficulty };
  const fraction = hackFraction(at, s.player, s.mults);
  const chance = hackChance(at, s.player);
  if (!(fraction > 0) || !(chance > 0)) return undefined;
  const held = Math.ceil((weakenTimeMs(at, s.player, s.mults) + tun.launchAheadMs) / tun.spacingMs) + 1;
  const perBatchGb = poolGb / held;
  const cap = Math.max(1, Math.floor(tun.maxSteal / fraction));
  const ram = (h: number) => batchThreads(t, prepared, h, s).ramGb;
  const fitsHost = (h: number) => batchThreads(t, prepared, h, s).growThreads <= growCap;
  if (!Number.isFinite(ram(1)) || !fitsHost(1)) return undefined;
  let lo = 0;
  let hi = cap;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ram(mid) <= perBatchGb + RAM_EPSILON && fitsHost(mid)) lo = mid;
    else hi = mid - 1;
  }
  const starved = lo === 0;
  const hackThreads = Math.max(1, lo);
  const batchGb = ram(hackThreads);
  const perSecond = Math.min(1, poolGb / (batchGb * held)) / (tun.spacingMs / 1000);
  return {
    hackThreads,
    held,
    starved,
    pipelineGb: Math.min(poolGb, batchGb * held),
    incomePerSec: chance * Math.min(1, hackThreads * fraction) * t.moneyMax * perSecond,
  };
}

/** Targets batches may run on: rooted, able to hold and grow money, and within the player's level. */
const batchable = (s: EngineSnapshot) =>
  s.targets.filter(
    (t) => t.hasAdminRights && t.moneyMax > 0 && t.serverGrowth > 0 && t.requiredHackingSkill <= s.player.skills.hacking,
  );

/** Batch jobs on the target are in flight. */
function batchesInFlight(s: EngineSnapshot, host: string): boolean {
  return s.inFlight.some((j) => j.target === host && j.purpose === "batch");
}

/** The target the engine batches now: that of the batch job it launched last. */
function batchedNow(s: EngineSnapshot): string | undefined {
  let last: Job | undefined;
  for (const j of s.inFlight) if (j.purpose === "batch" && (last === undefined || j.launchedAtMs > last.launchedAtMs)) last = j;
  return last?.target;
}

type Choice = { readonly target: TargetView; readonly sizing: Sizing };

/**
 * Ready for batches: at its minimum security and full money as read now,
 * with nothing of its prep still to land.
 */
const ready = (s: EngineSnapshot, t: TargetView): boolean =>
  !drifted(t, { money: t.moneyAvailable, security: t.hackDifficulty }) &&
  !s.inFlight.some((j) => j.target === t.host && j.purpose === "prep" && j.landsAtMs > s.nowMs);

/**
 * The target to batch, and the one to prepare (spec #41 user stories 59 and
 * 60). Targets are ranked live by what their batches would earn on the money
 * RAM (`sizeBatches`, our formulas), which for one pool is income per
 * GB-second. With nothing batched yet the best is batched (its first batch
 * starts with a repair wave). Otherwise the batches stay where they are unless
 * the best earns `switchRatio` times as much ("clearly better"); then they
 * move to it once it is `ready`, and until then it is prepared on the side.
 */
function chooseTarget(s: EngineSnapshot, poolGb: number, tun: EngineTunables): { batch?: Choice; prep?: TargetView } {
  const ranked: Choice[] = [];
  for (const target of batchable(s)) {
    const sizing = sizeBatches(target, poolGb, s, tun);
    if (sizing !== undefined && sizing.incomePerSec > 0) ranked.push({ target, sizing });
  }
  ranked.sort((a, b) => b.sizing.incomePerSec - a.sizing.incomePerSec);
  const best = ranked[0];
  if (best === undefined) return {};
  const host = batchedNow(s);
  const current = ranked.find((c) => c.target.host === host);
  if (current === undefined || current === best) return { batch: best };
  if (best.sizing.incomePerSec < tun.switchRatio * current.sizing.incomePerSec) return { batch: current };
  if (ready(s, best.target)) return { batch: best };
  return { batch: current, prep: best.target };
}

/**
 * Prepares a target for batches (#58): a repair wave (weaken to the minimum,
 * grow to full, weaken) planned on the target as its prep in flight will
 * leave it, within `budgetGb`. Each loop adds what the last ones couldn't
 * fit. With `weakenOnly`, just the weaken (the exp farm needs no money).
 */
function prepare(
  s: EngineSnapshot, t: TargetView, free: Map<string, number>, budgetGb: number, tun: EngineTunables, weakenOnly = false,
): Job[] {
  if (!(budgetGb > 0)) return [];
  const onTarget = s.inFlight.filter((j) => j.target === t.host);
  if (onTarget.some((j) => Math.abs(j.landsAtMs - s.nowMs) <= tun.guardMs)) return [];
  const st = after(t, { money: t.moneyAvailable, security: t.hackDifficulty }, onTarget.filter((j) => j.landsAtMs > s.nowMs), s);
  const needed = weakenOnly ? st.security - t.minDifficulty > STATE_EPSILON : drifted(t, st);
  if (!needed) return [];
  return repairWave(s, t, st, s.nowMs + weakenTimeMs(t, s.player, s.mults), free, budgetGb, tun, "prep", weakenOnly);
}

/** One planned job before it has a host: its landing and its threads. */
type Part = { readonly script: JobScript; readonly threads: number; readonly landsAtMs: number; readonly fraction?: number };

/** Each script's duration on the target as it is now, when the jobs' calls will start. */
function durationMs(script: JobScript, t: TargetView, s: EngineSnapshot): number {
  if (script === HACK_JOB) return hackTimeMs(t, s.player, s.mults);
  if (script === GROW_JOB) return growTimeMs(t, s.player, s.mults);
  return weakenTimeMs(t, s.player, s.mults);
}

/**
 * Puts the parts' threads on hosts, roomiest first, splitting a hack or a
 * weaken over hosts when one can't hold it (the pieces land together). A grow
 * is never split: each piece would raise the security the next one grows at,
 * so together they would grow less than one job. All of them or none
 * (`undefined`), within `budgetGb`; `free` is only changed when they fit.
 */
function placeParts(
  s: EngineSnapshot, t: TargetView, free: Map<string, number>, parts: readonly Part[], budgetGb: number, purpose: Purpose,
): Job[] | undefined {
  const trial = new Map(free);
  const jobs: Job[] = [];
  let used = 0;
  for (const part of parts) {
    let left = part.threads;
    const perThread = JOB_RAM_GB[part.script];
    while (left > 0) {
      const host = roomiest(trial);
      if (host === undefined) return undefined;
      const fits = Math.min(left, Math.floor(((trial.get(host) ?? 0) + RAM_EPSILON) / perThread));
      if (fits < 1 || (part.script === GROW_JOB && fits < left)) return undefined;
      trial.set(host, (trial.get(host) ?? 0) - fits * perThread);
      used += fits * perThread;
      left -= fits;
      const fraction = part.fraction ?? 0;
      jobs.push({
        script: part.script,
        host,
        target: t.host,
        threads: fits,
        additionalMsec: part.landsAtMs - s.nowMs - durationMs(part.script, t, s),
        purpose,
        launchedAtMs: s.nowMs,
        landsAtMs: part.landsAtMs,
        steal: part.script === HACK_JOB ? Math.min(1, fits * fraction) : 0,
        securityRise:
          part.script === HACK_JOB
            ? hackSecurityRise(fits, fraction)
            : part.script === GROW_JOB
              ? growSecurityRise(fits)
              : -weakenAmount(fits, 1, s.mults),
      });
    }
  }
  if (used > budgetGb + RAM_EPSILON) return undefined;
  for (const [host, gb] of trial) free.set(host, gb);
  return jobs;
}

/** Drifted badly: hacking pauses until a repair has brought the target back. */
const badlyDrifted = (t: TargetView, st: TargetState, tun: EngineTunables): boolean =>
  st.security - t.minDifficulty > tun.badSecurity || st.money < tun.badMoney * t.moneyMax;

/** Not at its minimum security and full money. */
const drifted = (t: TargetView, st: TargetState): boolean =>
  st.security - t.minDifficulty > STATE_EPSILON || st.money < t.moneyMax * (1 - STATE_EPSILON);

/**
 * A repair wave from `st` (no hack): a weaken to the minimum landing at
 * `slot`, then a grow to full money and its weaken. With too little RAM the
 * weaken goes first and the grow gets what is left (the next loop sees the
 * target still drifted and repairs again).
 */
function repairWave(
  s: EngineSnapshot, t: TargetView, st: TargetState, slot: number, free: Map<string, number>, budgetGb: number, tun: EngineTunables,
  purpose: Purpose, weakenOnly = false,
): Job[] {
  const perWeaken = weakenAmount(1, 1, s.mults);
  const jobs: Job[] = [];
  let budget = budgetGb;
  const fullWeaken = Math.max(0, Math.ceil((st.security - t.minDifficulty) / perWeaken - 1e-9));
  if (fullWeaken > 0) {
    // As much of the weaken as fits.
    const room = Math.min(budget, [...free.values()].reduce((a, b) => a + Math.max(0, b), 0));
    const threads = Math.min(fullWeaken, Math.floor((room + RAM_EPSILON) / JOB_RAM_GB[WEAKEN_JOB]));
    const placed = threads > 0 ? placeParts(s, t, free, [{ script: WEAKEN_JOB, threads, landsAtMs: slot }], budget, purpose) : undefined;
    if (placed === undefined) return jobs;
    jobs.push(...placed);
    budget -= ramOf(placed);
    if (threads < fullWeaken) return jobs;
  }
  if (weakenOnly) return jobs;
  const minSt: TargetState = { money: st.money, security: t.minDifficulty };
  const fullGrow = growThreadsFor(growable(t, minSt), s.player, t.moneyMax, 1, s.mults);
  if (!(fullGrow > 0) || !Number.isFinite(fullGrow)) return jobs;
  const wave = (g: number): Part[] => [
    { script: GROW_JOB, threads: g, landsAtMs: slot + tun.landGapMs },
    { script: WEAKEN_JOB, threads: Math.ceil(growSecurityRise(g) / perWeaken - 1e-9), landsAtMs: slot + 2 * tun.landGapMs },
  ];
  // The biggest grow (with its weaken) that fits.
  let lo = 0;
  let hi = fullGrow;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (placeParts(s, t, new Map(free), wave(mid), budget, purpose) !== undefined) lo = mid;
    else hi = mid - 1;
  }
  if (lo > 0) jobs.push(...(placeParts(s, t, free, wave(lo), budget, purpose) ?? []));
  return jobs;
}

/**
 * This loop's batches on the chosen target: a batch for each free landing
 * slot from the earliest a weaken launched now can land, up to the launch
 * lead past it, each planned on the target as the jobs before it will leave
 * it, so a small drift is repaired by that batch's weaken and grow. A badly
 * drifted projection gets a repair wave instead and no hack, and so does any
 * drift while no hack is on the way (a target being prepared, or one whose
 * hacking paused): hacking starts again once the target will be all back.
 * Nothing is launched near one of the target's landings.
 */
function batches(s: EngineSnapshot, choice: Choice, free: Map<string, number>, budgetGb: number, tun: EngineTunables): Job[] {
  const t = choice.target;
  const onTarget = s.inFlight.filter((j) => j.target === t.host);
  if (onTarget.some((j) => Math.abs(j.landsAtMs - s.nowMs) <= tun.guardMs)) return [];
  const toLand = onTarget.filter((j) => j.landsAtMs > s.nowMs);
  const read: TargetState = { money: t.moneyAvailable, security: t.hackDifficulty };
  const earliest = s.nowMs + weakenTimeMs(t, s.player, s.mults);
  const span = 3 * tun.landGapMs;
  const quiet = tun.spacingMs - span;
  const landings = onTarget.map((j) => j.landsAtMs);
  const jobs: Job[] = [];
  let budget = budgetGb;
  let hacking = toLand.some((j) => j.script === HACK_JOB);
  for (let slot = freeSlot(landings, earliest, span, quiet); slot <= earliest + tun.launchAheadMs; slot = freeSlot(landings, slot + tun.spacingMs, span, quiet)) {
    // Planned on the target as everything landing before this slot leaves it.
    // A slot may come before jobs already on their way (ones launched while
    // the target's security, and so their durations, were higher): a batch
    // leaves the target as it found it, so they land as planned.
    const st = after(t, read, [...toLand, ...jobs].filter((j) => j.landsAtMs < slot), s);
    if (hacking ? badlyDrifted(t, st, tun) : drifted(t, st)) {
      jobs.push(...repairWave(s, t, st, slot, free, budget, tun, "batch"));
      break;
    }
    const parts = (hackThreads: number): Part[] | undefined => {
      const b = batchThreads(t, st, hackThreads, s);
      if (!Number.isFinite(b.ramGb)) return undefined;
      const all: Part[] = [
        { script: HACK_JOB, threads: b.hackThreads, landsAtMs: slot, fraction: b.fraction },
        { script: WEAKEN_JOB, threads: b.weaken1, landsAtMs: slot + tun.landGapMs },
        { script: GROW_JOB, threads: b.growThreads, landsAtMs: slot + 2 * tun.landGapMs },
        { script: WEAKEN_JOB, threads: b.weaken2, landsAtMs: slot + 3 * tun.landGapMs },
      ];
      return all.filter((p) => p.threads > 0);
    };
    const fits = (hackThreads: number): boolean => {
      const p = parts(hackThreads);
      return p !== undefined && placeParts(s, t, new Map(free), p, budget, "batch") !== undefined;
    };
    // The sized batch, or the biggest smaller one that fits in the RAM left.
    let hackThreads = choice.sizing.hackThreads;
    if (!fits(hackThreads)) {
      let lo = 0;
      let hi = hackThreads - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(mid)) lo = mid;
        else hi = mid - 1;
      }
      hackThreads = lo;
    }
    const chosen = hackThreads >= 1 ? parts(hackThreads) : undefined;
    const placed = chosen === undefined ? undefined : placeParts(s, t, free, chosen, budget, "batch");
    if (placed === undefined) break;
    jobs.push(...placed);
    landings.push(...placed.map((j) => j.landsAtMs));
    budget -= ramOf(placed);
    hacking = true;
  }
  return jobs;
}

/**
 * The first slot from `from` whose landings (`span` long) keep `quiet` clear
 * of every landing on the target: before it, so a launch finds a quiet window
 * between batches, and after it, so the next batch starts a spacing later.
 */
function freeSlot(landings: readonly number[], from: number, span: number, quiet: number): number {
  let slot = from;
  for (;;) {
    const clash = landings.filter((l) => l > slot - quiet && l < slot + span + quiet);
    if (clash.length === 0) return slot;
    slot = Math.max(...clash) + quiet;
  }
}

/**
 * What the engine expects its RAM to earn (the fleet rule's payback): the
 * best target's modelled batch income on all the RAM the engine has (not
 * only the money split), and on twice that. Undefined with nothing to batch.
 */
export function outlook(s: EngineSnapshot, orders: EngineOrders, tun: EngineTunables = ENGINE_TUNABLES): EngineOutlook | undefined {
  const { poolGb } = ramLedger(s, orders);
  const best = (gb: number) => {
    let top: { host: string; income: number } | undefined;
    for (const t of batchable(s)) {
      const income = sizeBatches(t, gb, s, tun)?.incomePerSec ?? 0;
      if (top === undefined || income > top.income) top = { host: t.host, income };
    }
    return top;
  };
  const now = best(poolGb);
  const twice = best(2 * poolGb);
  if (now === undefined || twice === undefined) return undefined;
  return { target: now.host, poolGb, incomePerSec: now.income, incomeAt2xPerSec: Math.max(now.income, twice.income) };
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
