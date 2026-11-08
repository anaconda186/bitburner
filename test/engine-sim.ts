// A small simulation of the game for the money engine's tests (seam B): every
// 500 ms (the engine's loop) the scheduler is asked for jobs, which hold RAM
// until they land, and each landing changes its target as the game's timer
// would (src/Netscript/NetscriptHelpers.tsx hack, src/NetscriptFunctions.ts
// grow and weaken, src/Server/ServerHelpers.ts processSingleServerGrowth),
// using the formula model. A hack's money and security are as if it
// succeeded (the worst case); its exp is the expected value (a failed hack
// earns a quarter, and so does a hack that drains nothing).
import {
  grownMoney, growThreadsFor, hackChance, hackExp, hackFraction, hackSecurityRise, NEUTRAL_MULTS, weakenAmount,
  type Hacker, type NodeMults,
} from "../src/sr/formulas.ts";
import {
  GROW_JOB, HACK_JOB, JOB_RAM_GB, schedule, stillInFlight, WEAKEN_JOB,
  type EngineOrders, type EngineSnapshot, type HostView, type Job, type TargetView,
} from "../src/sr/money-engine.ts";

export const T0 = 1_700_000_000_123;

export const player = (hacking: number): Hacker => ({
  skills: { hacking, intelligence: 0 },
  mults: { hacking_chance: 1, hacking_exp: 1, hacking_money: 1, hacking_speed: 1, hacking_grow: 1 },
});

export const fleet = (n: number, gb: number, prefix = "sr-"): HostView[] =>
  Array.from({ length: n }, (_, i) => ({ host: `${prefix}${String(i).padStart(2, "0")}`, maxRamGb: gb, usedRamGb: 0 }));

export const ramOf = (jobs: readonly Job[]): number => jobs.reduce((gb, j) => gb + j.threads * JOB_RAM_GB[j.script], 0);

export type Landing = { readonly atMs: number; readonly job: Job; readonly money: number; readonly security: number };

export type SimOpts = {
  readonly hosts: readonly HostView[];
  readonly targets: readonly TargetView[];
  readonly seconds: number;
  /** The orders at each moment (the conductor may change them mid-run). */
  readonly orders: EngineOrders | ((nowMs: number) => EngineOrders);
  readonly player?: Hacker;
  readonly mults?: NodeMults;
  readonly startMs?: number;
  readonly inFlight?: readonly Job[];
  /** Hosts and targets that appear this many seconds in (a server bought, a server rooted). */
  readonly later?: readonly { readonly atS: number; readonly hosts?: readonly HostView[]; readonly targets?: readonly TargetView[] }[];
};

export type SimRun = {
  readonly launched: Job[];
  readonly landings: Landing[];
  /** Expected money stolen, and hacking exp earned. */
  readonly stolen: number;
  readonly exp: number;
  /** RAM held at each loop. */
  readonly heldGb: number[];
  /** The engine's book at the end, and the targets as they ended. */
  readonly book: Job[];
  readonly targets: Map<string, TargetView>;
  readonly endMs: number;
};

export function simulate(opts: SimOpts): SimRun {
  const bn = opts.mults ?? NEUTRAL_MULTS;
  const p = opts.player ?? player(300);
  const start = opts.startMs ?? T0;
  const targets = new Map(opts.targets.map((t) => [t.host, { ...t }]));
  let hosts = [...opts.hosts];
  const unlanded: Job[] = [...(opts.inFlight ?? [])];
  let book: Job[] = [...unlanded];
  const launched: Job[] = [];
  const landings: Landing[] = [];
  const heldGb: number[] = [];
  let stolen = 0;
  let exp = 0;
  const seen = new Set<number>();
  let nowMs = start;
  for (; nowMs < start + opts.seconds * 1000; nowMs += 500) {
    for (const [i, ev] of (opts.later ?? []).entries()) {
      if (seen.has(i) || nowMs - start < ev.atS * 1000) continue;
      seen.add(i);
      hosts = [...hosts, ...(ev.hosts ?? [])];
      for (const t of ev.targets ?? []) targets.set(t.host, { ...t });
    }
    unlanded.sort((a, b) => a.landsAtMs - b.landsAtMs);
    while (unlanded.length > 0 && (unlanded[0] as Job).landsAtMs <= nowMs) {
      const j = unlanded.shift() as Job;
      const t = targets.get(j.target);
      if (t === undefined) continue;
      landings.push({ atMs: j.landsAtMs, job: j, money: t.moneyAvailable, security: t.hackDifficulty });
      const full = { ...t };
      const perThreadExp = hackExp(full, p, bn);
      if (j.script === HACK_JOB) {
        const fraction = hackFraction(t, p, bn);
        const take = Math.min(1, fraction * j.threads) * t.moneyAvailable;
        const chance = hackChance(t, p);
        stolen += take * chance;
        exp += perThreadExp * j.threads * (chance * (take > 0 ? 1 : 0.25) + (1 - chance) * 0.25);
        targets.set(t.host, {
          ...t,
          moneyAvailable: t.moneyAvailable - take,
          hackDifficulty: Math.min(100, t.hackDifficulty + (take > 0 || t.moneyAvailable === 0 ? hackSecurityRise(j.threads, fraction) : 0)),
        });
      } else if (j.script === GROW_JOB) {
        const money = grownMoney(full, p, j.threads, 1, bn);
        const used = money === t.moneyAvailable ? 0 : Math.min(j.threads, Math.ceil(growThreadsFor(full, p, money, 1, bn)));
        exp += perThreadExp * j.threads;
        targets.set(t.host, { ...t, moneyAvailable: money, hackDifficulty: Math.min(100, t.hackDifficulty + 0.004 * used) });
      } else if (j.script === WEAKEN_JOB) {
        exp += perThreadExp * j.threads;
        targets.set(t.host, { ...t, hackDifficulty: Math.max(t.minDifficulty, t.hackDifficulty - weakenAmount(j.threads, 1, bn)) });
      }
    }
    // Jobs with no target (share) end when they land too.
    const used = new Map<string, number>();
    for (const j of unlanded) used.set(j.host, (used.get(j.host) ?? 0) + j.threads * JOB_RAM_GB[j.script]);
    const viewed = hosts.map((h) => ({ ...h, usedRamGb: h.usedRamGb + (used.get(h.host) ?? 0) }));
    heldGb.push(ramOf(unlanded));
    book = stillInFlight(book, nowMs);
    const orders = typeof opts.orders === "function" ? opts.orders(nowMs) : opts.orders;
    const s: EngineSnapshot = { nowMs, engineHost: "home", engineRamGb: 0, hosts: viewed, targets: [...targets.values()], player: p, mults: bn, inFlight: book };
    const jobs = schedule(s, orders);
    for (const j of jobs) {
      if (j.additionalMsec < 0) throw new Error(`negative additionalMsec: ${JSON.stringify(j)}`);
      const h = viewed.find((x) => x.host === j.host);
      const free = (h?.maxRamGb ?? 0) - (h?.usedRamGb ?? 0);
      if (ramOf(jobs.filter((x) => x.host === j.host)) > free + 1e-6) throw new Error(`over-filled ${j.host}`);
    }
    unlanded.push(...jobs);
    book.push(...jobs);
    launched.push(...jobs);
  }
  return { launched, landings, stolen, exp, heldGb, book, targets, endMs: nowMs };
}
