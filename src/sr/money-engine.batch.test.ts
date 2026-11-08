// Seam B: money batches (#57). An engine snapshot and the orders in, job
// launches out. Most tests run the scheduler in a small simulation of the
// game: every 500 ms (the engine's loop) it is asked for jobs, which hold RAM
// until they land, and each landing changes the target as the game's timer
// would (src/Netscript/NetscriptHelpers.tsx hack, src/NetscriptFunctions.ts
// grow and weaken), using the formula model. Hacks always succeed in it (the
// worst case for money and security).
import { describe, expect, test } from "vitest";
import {
  grownMoney, growThreadsFor, hackChance, hackFraction, hackSecurityRise, hackTimeMs, NEUTRAL_MULTS,
  weakenAmount, weakenTimeMs, type Hacker, type NodeMults,
} from "./formulas.ts";
import {
  ENGINE_TUNABLES, GROW_JOB, HACK_JOB, JOB_RAM_GB, outlook, schedule, SPLIT_MONEY, stillInFlight, WEAKEN_JOB,
  type EngineOrders, type EngineSnapshot, type HostView, type Job, type TargetView,
} from "./money-engine.ts";

const T0 = 1_700_000_000_123;
const player = (hacking: number): Hacker => ({
  skills: { hacking, intelligence: 0 },
  mults: { hacking_chance: 1, hacking_exp: 1, hacking_money: 1, hacking_speed: 1, hacking_grow: 1 },
});
const P300 = player(300);
/** phantasy at BN1's midpoints (docs/research/money-engine-model/engine.py), prepared. */
const phantasy = (over: Partial<TargetView> = {}): TargetView => ({
  host: "phantasy",
  hasAdminRights: true,
  requiredHackingSkill: 100,
  minDifficulty: 7,
  hackDifficulty: 7,
  moneyMax: 600e6,
  moneyAvailable: 600e6,
  serverGrowth: 35,
  baseDifficulty: 20,
  ...over,
});
const orders = (mults: NodeMults = NEUTRAL_MULTS): EngineOrders => ({ split: SPLIT_MONEY, homeReserveGb: 0, mults });
const fleet = (n: number, gb: number): HostView[] =>
  Array.from({ length: n }, (_, i) => ({ host: `sr-${String(i).padStart(2, "0")}`, maxRamGb: gb, usedRamGb: 0 }));
const ramOf = (jobs: readonly Job[]) => jobs.reduce((gb, j) => gb + j.threads * JOB_RAM_GB[j.script], 0);
const threadsOf = (jobs: readonly Job[], script: Job["script"]) =>
  jobs.filter((j) => j.script === script).reduce((n, j) => n + j.threads, 0);

function snapAt(nowMs: number, hosts: HostView[], targets: TargetView[], inFlight: Job[] = [], mults = NEUTRAL_MULTS): EngineSnapshot {
  return { nowMs, engineHost: "home", engineRamGb: 0, hosts, targets, player: P300, mults, inFlight };
}

type Landing = { atMs: number; script: Job["script"]; money: number; security: number };

/** Runs the engine against a simulated game for `seconds`. */
function simulate(opts: {
  hosts: HostView[]; target: TargetView; seconds: number; mults?: NodeMults; inFlight?: Job[];
  /** More hosts that appear this many seconds in (a server bought mid-run). */
  later?: { atS: number; hosts: HostView[] };
}) {
  const mults = opts.mults ?? NEUTRAL_MULTS;
  let t = { ...opts.target };
  const unlanded: Job[] = [...(opts.inFlight ?? [])];
  let book: Job[] = [...unlanded];
  const launched: Job[] = [];
  const landings: Landing[] = [];
  let stolen = 0;
  const heldGb: number[] = [];
  for (let nowMs = T0; nowMs < T0 + opts.seconds * 1000; nowMs += 500) {
    unlanded.sort((a, b) => a.landsAtMs - b.landsAtMs);
    while (unlanded.length > 0 && (unlanded[0] as Job).landsAtMs <= nowMs) {
      const j = unlanded.shift() as Job;
      if (j.target !== t.host) continue;
      landings.push({ atMs: j.landsAtMs, script: j.script, money: t.moneyAvailable, security: t.hackDifficulty });
      if (j.script === HACK_JOB) {
        const fraction = hackFraction(t, P300, mults);
        const take = Math.min(1, fraction * j.threads) * t.moneyAvailable;
        stolen += take * hackChance(t, P300); // expected value, like the engine's outlook
        t = { ...t, moneyAvailable: t.moneyAvailable - take, hackDifficulty: Math.min(100, t.hackDifficulty + hackSecurityRise(j.threads, fraction)) };
      } else if (j.script === GROW_JOB) {
        const full = { ...t, baseDifficulty: t.minDifficulty };
        const money = grownMoney(full, P300, j.threads, 1, mults);
        const used = Math.min(j.threads, growThreadsFor(full, P300, money, 1, mults));
        t = { ...t, moneyAvailable: money, hackDifficulty: Math.min(100, t.hackDifficulty + 0.004 * used) };
      } else {
        t = { ...t, hackDifficulty: Math.max(t.minDifficulty, t.hackDifficulty - weakenAmount(j.threads, 1, mults)) };
      }
    }
    const used = new Map<string, number>();
    for (const j of unlanded) used.set(j.host, (used.get(j.host) ?? 0) + j.threads * JOB_RAM_GB[j.script]);
    const all = opts.later !== undefined && nowMs - T0 >= opts.later.atS * 1000 ? [...opts.hosts, ...opts.later.hosts] : opts.hosts;
    const hosts = all.map((h) => ({ ...h, usedRamGb: h.usedRamGb + (used.get(h.host) ?? 0) }));
    heldGb.push(ramOf(unlanded));
    book = stillInFlight(book, nowMs);
    const jobs = schedule(snapAt(nowMs, hosts, [t], book, mults), orders(mults));
    for (const j of jobs) {
      expect(j.additionalMsec).toBeGreaterThanOrEqual(0);
      const free = (hosts.find((h) => h.host === j.host)?.maxRamGb ?? 0) - (hosts.find((h) => h.host === j.host)?.usedRamGb ?? 0);
      expect(ramOf(jobs.filter((x) => x.host === j.host))).toBeLessThanOrEqual(free + 1e-6);
    }
    unlanded.push(...jobs);
    book.push(...jobs);
    launched.push(...jobs);
  }
  return { launched, landings, stolen, heldGb, final: t };
}

/** The landings on the target, in order, as one letter each: H, W, G. */
const pattern = (ls: readonly Landing[]) => ls.map((l) => (l.script === HACK_JOB ? "H" : l.script === GROW_JOB ? "G" : "W")).join("");

/** Landing times of the distinct jobs (split jobs share one). */
function landingsOf(jobs: readonly Job[]): { atMs: number; script: Job["script"] }[] {
  const seen = new Map<number, Job["script"]>();
  for (const j of jobs) seen.set(j.landsAtMs, j.script);
  return [...seen].map(([atMs, script]) => ({ atMs, script })).sort((a, b) => a.atMs - b.atMs);
}

describe("batches on a prepared target", () => {
  // 25 × 1 TB. At hacking 300 a weaken on phantasy takes 4 · 5 · (2.5·100·7 +
  // 500)/350 = 128.6 s, so the pipeline is full after a little over two minutes.
  const run = simulate({ hosts: fleet(25, 1024), target: phantasy(), seconds: 300 });

  test("each batch lands hack, weaken, grow, weaken, a landing gap apart, and batches land a spacing apart", () => {
    const { spacingMs, landGapMs } = ENGINE_TUNABLES;
    expect(spacingMs).toBe(1000);
    const ls = landingsOf(run.launched);
    expect(ls.length).toBeGreaterThan(4 * 100);
    expect(pattern(ls.map((l) => ({ ...l, money: 0, security: 0 })))).toMatch(/^(HWGW)+$/);
    for (let i = 0; i + 4 < ls.length; i += 4) {
      const [h, w1, g, w2, next] = ls.slice(i, i + 5) as [Landing, Landing, Landing, Landing, Landing];
      expect([w1.atMs - h.atMs, g.atMs - w1.atMs, w2.atMs - g.atMs]).toEqual([landGapMs, landGapMs, landGapMs]);
      expect(next.atMs - h.atMs).toBeGreaterThanOrEqual(spacingMs);
    }
    // Continuous: once running, no slot is skipped.
    const hacks = ls.filter((l) => l.script === HACK_JOB).map((l) => l.atMs);
    const steady = hacks.slice(5, 150);
    expect(steady.slice(1).map((t, i) => t - (steady[i] as number))).toEqual(steady.slice(1).map(() => spacingMs));
  });

  test("every hack lands on the target at its minimum security and full money", () => {
    const hacks = run.landings.filter((l) => l.script === HACK_JOB);
    expect(hacks.length).toBeGreaterThan(100);
    for (const h of hacks) {
      expect(h.security).toBeCloseTo(7, 9);
      expect(h.money).toBeCloseTo(600e6, 0);
    }
    expect(run.final.hackDifficulty).toBeLessThan(7 + 3);
  });

  test("the fraction stolen grows to fill the RAM: once the pipeline is full it holds most of the fleet, never more", () => {
    const pool = 25 * 1024;
    const full = run.heldGb.slice(2 * 140); // after 140 s
    expect(Math.min(...full)).toBeGreaterThan(0.85 * pool);
    expect(Math.max(...run.heldGb)).toBeLessThanOrEqual(pool + 1e-6);
    const half = simulate({ hosts: fleet(25, 512), target: phantasy(), seconds: 20 });
    const steal = (jobs: readonly Job[]) => jobs.find((j) => j.script === HACK_JOB)?.steal ?? 0;
    expect(steal(run.launched)).toBeGreaterThan(1.5 * steal(half.launched));
  });

  test("income beats drain on the same RAM: ten minutes of batches take more than all of the target's money", () => {
    // Drain can take at most what is on the target: $600m, once.
    const long = simulate({ hosts: fleet(25, 1024), target: phantasy(), seconds: 600 });
    expect(long.stolen).toBeGreaterThan(600e6);
  });

  test("the engine's outlook matches what the batches earn once running", () => {
    const s = snapAt(T0, fleet(25, 1024), [phantasy()]);
    const o = outlook(s, orders());
    expect(o?.target).toBe("phantasy");
    expect(o?.poolGb).toBe(25 * 1024);
    // Money taken per second over the last two minutes of the run.
    const late = simulate({ hosts: fleet(25, 1024), target: phantasy(), seconds: 400 });
    const perHack = late.landings.filter((l) => l.script === HACK_JOB && l.atMs > T0 + 280_000);
    expect(perHack.length).toBeGreaterThan(100);
    const rate = (late.stolen - simulate({ hosts: fleet(25, 1024), target: phantasy(), seconds: 280 }).stolen) / 120;
    expect(rate / (o?.incomePerSec ?? 1)).toBeGreaterThan(0.85);
    expect(rate / (o?.incomePerSec ?? 1)).toBeLessThan(1.15);
    expect(o?.incomeAt2xPerSec).toBeGreaterThan(o?.incomePerSec ?? Infinity);
  });
});

describe("drift", () => {
  const hosts = fleet(25, 1024);
  const first = (target: TargetView) => schedule(snapAt(T0, hosts, [target]), orders());
  const firstBatch = (jobs: readonly Job[]) => {
    const ls = landingsOf(jobs);
    const [h, w1, g, w2] = ls;
    const at = (l: { atMs: number } | undefined) => jobs.filter((j) => j.landsAtMs === l?.atMs);
    return { hack: at(h), w1: at(w1), grow: at(g), w2: at(w2), order: ls.slice(0, 4).map((l) => l.script) };
  };

  test("while batching, a target that has drifted a little gets repair threads in its next batch: more weaken and more grow", () => {
    // A batch's hack on the way: the engine is batching this target.
    const onTheWay: Job = {
      script: HACK_JOB, host: "sr-00", target: "phantasy", threads: 10, additionalMsec: 0, purpose: "batch", launchedAtMs: T0 - 60_000,
      landsAtMs: T0 + 60_000, steal: 0.02, securityRise: 0.02,
    };
    const next = (target: TargetView) => schedule(snapAt(T0, hosts, [target], [onTheWay]), orders());
    const clean = firstBatch(next(phantasy()));
    const drifted = firstBatch(next(phantasy({ hackDifficulty: 8, moneyAvailable: 500e6 })));
    expect(drifted.order).toEqual([HACK_JOB, WEAKEN_JOB, GROW_JOB, WEAKEN_JOB]);
    expect(threadsOf(drifted.hack, HACK_JOB)).toBeGreaterThan(0);
    // One security point over is 20 more weaken threads (0.05 each).
    expect(threadsOf(drifted.w1, WEAKEN_JOB)).toBeGreaterThanOrEqual(threadsOf(clean.w1, WEAKEN_JOB) + 20 - 1);
    expect(threadsOf(drifted.grow, GROW_JOB)).toBeGreaterThan(threadsOf(clean.grow, GROW_JOB));
  });

  test("a badly drifted target, or any drifted one with no hack on the way, gets no hack, only what brings it back", () => {
    const cases: [TargetView, Job["script"][]][] = [
      [phantasy({ hackDifficulty: 7 + 20 }), [WEAKEN_JOB]],
      [phantasy({ moneyAvailable: 600e6 * 0.1 }), [GROW_JOB, WEAKEN_JOB]],
      [phantasy({ hackDifficulty: 21, moneyAvailable: 0 }), [WEAKEN_JOB, GROW_JOB, WEAKEN_JOB]],
      [phantasy({ hackDifficulty: 8, moneyAvailable: 500e6 }), [WEAKEN_JOB, GROW_JOB, WEAKEN_JOB]],
    ];
    for (const [bad, wave] of cases) {
      const jobs = first(bad);
      expect(threadsOf(jobs, HACK_JOB)).toBe(0);
      expect(landingsOf(jobs).map((l) => l.script)).toEqual(wave);
    }
  });

  test("a weaken that brings it back is sized from the security it has: 20 over is 400 threads", () => {
    const jobs = first(phantasy({ hackDifficulty: 27 }));
    const [w1] = landingsOf(jobs);
    expect(threadsOf(jobs.filter((j) => j.landsAtMs === w1?.atMs), WEAKEN_JOB)).toBe(400);
  });

  test("hacking starts again only once the target has recovered: every hack lands on a prepared target", () => {
    // A weaken from security 27 takes 414 s at hacking 300, so the first
    // hacks land after that.
    const run = simulate({ hosts, target: phantasy({ hackDifficulty: 27, moneyAvailable: 20e6 }), seconds: 700 });
    const hacks = run.landings.filter((l) => l.script === HACK_JOB);
    expect(hacks.length).toBeGreaterThan(100);
    for (const h of hacks) {
      expect(h.security).toBeCloseTo(7, 9);
      expect(h.money).toBeCloseTo(600e6, 0);
    }
    // The first landing of all is the repair's weaken, before any hack.
    expect(run.landings[0]?.script).toBe(WEAKEN_JOB);
  });

  test("RAM that comes free while a target is prepared doesn't stall the pipeline once it's ready (#57's in-game drain)", () => {
    // #57's 15-minute run: 24 � 1 TB, phantasy from base security. Batches
    // launched before the repair weaken lands take the weaken time at base
    // security (414 s); once it lands they take 129 s. A batch launched late
    // in the prep, on RAM that came free (here a server bought at +200 s),
    // lands far beyond where any batch launched after the prep can, and the
    // engine launched nothing until time caught up with it: the pipeline ran
    // dry for over a minute. Batches now fill the free slots before it.
    const run = simulate({
      hosts: fleet(24, 1024),
      target: phantasy({ hackDifficulty: 27, moneyAvailable: 20e6 }),
      seconds: 800,
      later: { atS: 200, hosts: [{ host: "sr-99", maxRamGb: 1024, usedRamGb: 0 }] },
    });
    const hacks = run.landings.filter((l) => l.script === HACK_JOB).map((l) => l.atMs);
    expect(hacks.length).toBeGreaterThan(300);
    const gaps = hacks.slice(1).map((t, i) => t - (hacks[i] as number));
    // The one gap left: from the prep's last batch to the first one launched
    // once the target was ready, about 14 s (it was 84 s).
    expect(Math.max(...gaps)).toBeLessThan(20_000);
    for (const l of run.landings.filter((x) => x.script === HACK_JOB)) {
      expect(l.security).toBeCloseTo(7, 9);
      expect(l.money).toBeCloseTo(600e6, 0);
    }
  });

  test("launches nothing on the target while one of its jobs is about to land (its duration would be read wrong)", () => {
    const landing: Job = {
      script: WEAKEN_JOB, host: "sr-00", target: "phantasy", threads: 10, additionalMsec: 0, purpose: "batch", launchedAtMs: T0 - 100_000,
      landsAtMs: T0 + 30, steal: 0, securityRise: -0.5,
    };
    const s = snapAt(T0, hosts, [phantasy({ hackDifficulty: 7.2 })], [landing]);
    expect(schedule(s, orders()).filter((j) => j.target === "phantasy")).toEqual([]);
    const later = { ...landing, landsAtMs: T0 + ENGINE_TUNABLES.guardMs + 400 };
    expect(schedule({ ...s, inFlight: [later] }, orders()).filter((j) => j.target === "phantasy").length).toBeGreaterThan(0);
  });
});

describe("which stage", () => {
  test("with too little RAM for batches at the spacing, the engine drains instead", () => {
    // 64 GB can't hold 130 batches of even one hack thread on phantasy.
    const jobs = schedule(snapAt(T0, fleet(1, 64), [phantasy()]), orders());
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.script === HACK_JOB && j.additionalMsec === 0)).toBe(true);
  });

  test("with RAM for batches it batches its target", () => {
    const tiny = phantasy({ host: "n00dles", moneyMax: 1.75e6, moneyAvailable: 70e3, requiredHackingSkill: 1, minDifficulty: 1, hackDifficulty: 1, serverGrowth: 3000 });
    const jobs = schedule(snapAt(T0, fleet(25, 1024), [phantasy(), tiny]), orders());
    expect(new Set(jobs.filter((j) => j.target === "phantasy").map((j) => j.script))).toEqual(new Set([HACK_JOB, GROW_JOB, WEAKEN_JOB]));
  });

  test("picks the target whose batches would earn most on its RAM, and only one it has the level for", () => {
    const rich = phantasy({ host: "rich", moneyMax: 6e9, moneyAvailable: 6e9 });
    const tooHard = phantasy({ host: "hard", moneyMax: 60e9, moneyAvailable: 60e9, requiredHackingSkill: 301 });
    const jobs = schedule(snapAt(T0, fleet(25, 1024), [phantasy(), rich, tooHard]), orders());
    expect(new Set(jobs.filter((j) => j.script !== HACK_JOB || j.additionalMsec > 0).map((j) => j.target))).toEqual(new Set(["rich"]));
  });

  test("BitNode multipliers count: BN4's steal of ×0.2 takes five times the hack threads per batch for the same share", () => {
    const bn4 = { ...NEUTRAL_MULTS, ScriptHackMoney: 0.2 };
    const perThread = (m: NodeMults) => {
      const jobs = schedule(snapAt(T0, fleet(25, 1024), [phantasy()], [], m), orders(m));
      const h = jobs.find((j) => j.script === HACK_JOB);
      return (h?.steal ?? 0) / threadsOf(jobs.filter((j) => j.landsAtMs === h?.landsAtMs), HACK_JOB);
    };
    expect(perThread(bn4) / perThread(NEUTRAL_MULTS)).toBeCloseTo(0.2, 6);
  });

  test("weaken and hack durations come from the target as it is at launch", () => {
    const t = phantasy({ hackDifficulty: 7.5 });
    const jobs = schedule(snapAt(T0, fleet(25, 1024), [t]), orders());
    for (const j of jobs.filter((x) => x.target === "phantasy")) {
      const ms = j.script === HACK_JOB ? hackTimeMs(t, P300, NEUTRAL_MULTS) : j.script === WEAKEN_JOB ? weakenTimeMs(t, P300, NEUTRAL_MULTS) : 3.2 * hackTimeMs(t, P300, NEUTRAL_MULTS);
      expect(j.landsAtMs - T0 - j.additionalMsec).toBeCloseTo(ms, 3); // (a slot a rounding error early gets additionalMsec 0: the game refuses a negative one)
    }
  });
});
