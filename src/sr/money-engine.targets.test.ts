// Seam B: which target the money batches run on (#58, spec #41 user stories
// 59 and 60). Targets are ranked live by what their batches would earn on
// the money RAM (income per GB-second, our own formulas); the next-best one is
// prepared in the background with at most about 10% of that RAM, and the
// batches switch to it only once it is ready and clearly better.
import { describe, expect, test } from "vitest";
import { fleet, player, ramOf, simulate, T0 } from "../../test/engine-sim.ts";
import { NEUTRAL_MULTS } from "./formulas.ts";
import {
  ENGINE_TUNABLES, HACK_JOB, schedule, SPLIT_MONEY, type EngineOrders, type EngineSnapshot, type Job, type TargetView,
} from "./money-engine.ts";

const ORDERS: EngineOrders = { split: SPLIT_MONEY, homeReserveGb: 0, mults: NEUTRAL_MULTS };
/** phantasy at BN1's midpoints (docs/research/money-engine-model/engine.py), prepared. */
const phantasy = (over: Partial<TargetView> = {}): TargetView => ({
  host: "phantasy",
  hasAdminRights: true,
  requiredHackingSkill: 100,
  baseDifficulty: 20,
  minDifficulty: 7,
  hackDifficulty: 7,
  moneyMax: 600e6,
  moneyAvailable: 600e6,
  serverGrowth: 35,
  ...over,
});
/** The same server with ten times the money: its batches earn about ten times as much. */
const rich = (over: Partial<TargetView> = {}) => phantasy({ host: "rich", moneyMax: 6e9, moneyAvailable: 6e9, ...over });
/** Not prepared: base security and little money. */
const raw = { hackDifficulty: 27, moneyAvailable: 20e6 };
const HOSTS = fleet(25, 1024);
const POOL_GB = 25 * 1024;

/** Two minutes of batches on phantasy: the pipeline full, the book as the engine has it. */
const running = simulate({ hosts: HOSTS, targets: [phantasy()], seconds: 200, orders: ORDERS });

/** The engine's snapshot at the end of that run, with `others` rooted beside phantasy. */
function next(others: TargetView[]): EngineSnapshot {
  const used = new Map<string, number>();
  for (const j of running.book.filter((x) => x.landsAtMs > running.endMs)) {
    used.set(j.host, (used.get(j.host) ?? 0) + ramOf([j]));
  }
  return {
    nowMs: running.endMs,
    engineHost: "home",
    engineRamGb: 0,
    hosts: HOSTS.map((h) => ({ ...h, usedRamGb: used.get(h.host) ?? 0 })),
    targets: [running.targets.get("phantasy") as TargetView, ...others],
    player: player(300),
    mults: NEUTRAL_MULTS,
    inFlight: running.book,
  };
}
const on = (jobs: readonly Job[], host: string) => jobs.filter((j) => j.target === host);
const scripts = (jobs: readonly Job[]) => new Set(jobs.map((j) => j.script));

describe("prepare the next target, then switch", () => {
  test("a clearly better target that isn't ready is prepared with at most 10% of the money RAM, and never hacked yet", () => {
    const jobs = schedule(next([rich(raw)]), ORDERS);
    const prep = on(jobs, "rich");
    expect(prep.length).toBeGreaterThan(0);
    expect(scripts(prep).has(HACK_JOB)).toBe(false);
    expect(ramOf(prep)).toBeLessThanOrEqual(ENGINE_TUNABLES.prepShare * POOL_GB + 1e-6);
    // Meanwhile the batches carry on where they were.
    expect(scripts(on(jobs, "phantasy")).has(HACK_JOB)).toBe(true);
  });

  test("once it is ready (minimum security, full money, nothing of its prep still to land) the batches move to it", () => {
    const jobs = schedule(next([rich()]), ORDERS);
    expect(scripts(on(jobs, "rich")).has(HACK_JOB)).toBe(true);
    expect(on(jobs, "phantasy")).toEqual([]);
  });

  test("a target only a little better is neither prepared nor switched to", () => {
    // 1.1 times phantasy's money: under the switch ratio (1.25).
    expect(ENGINE_TUNABLES.switchRatio).toBe(1.25);
    for (const t of [phantasy({ host: "bit-better", moneyMax: 660e6, moneyAvailable: 660e6 }), phantasy({ host: "bit-better", moneyMax: 660e6, ...raw })]) {
      const jobs = schedule(next([t]), ORDERS);
      // (Drain may take its money, as it would any target nothing batches.)
      expect(on(jobs, "bit-better").filter((j) => j.purpose !== "drain")).toEqual([]);
      expect(scripts(on(jobs, "phantasy")).has(HACK_JOB)).toBe(true);
    }
  });

  test("a better target rooted mid-run: prepared in the background, switched to with no dead time, every hack on a ready target", () => {
    const run = simulate({
      hosts: HOSTS,
      targets: [phantasy()],
      seconds: 1500,
      orders: ORDERS,
      later: [{ atS: 200, targets: [rich(raw)] }],
    });
    // The batches' hacks (once its batches have landed, phantasy is drained like any other).
    const hacks = run.landings.filter((l) => l.job.script === HACK_JOB && l.job.purpose === "batch");
    const onRich = hacks.filter((l) => l.job.target === "rich");
    expect(onRich.length).toBeGreaterThan(100);
    for (const h of hacks) {
      const t = h.job.target === "rich" ? rich() : phantasy();
      expect(h.security).toBeCloseTo(t.minDifficulty, 9);
      expect(h.money).toBeCloseTo(t.moneyMax, 0);
    }
    // No dead time: from the first hack to the last, never more than a few
    // seconds without one landing, across the switch too.
    const times = hacks.map((l) => l.atMs).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
    expect(Math.max(...gaps)).toBeLessThan(5_000);
    // And phantasy's batches stop once rich's start.
    const firstRich = Math.min(...onRich.map((l) => l.job.launchedAtMs));
    expect(run.launched.filter((j) => j.target === "phantasy" && j.purpose === "batch" && j.launchedAtMs > firstRich)).toEqual([]);
    // Its prep never held more than 10% of the RAM.
    for (let ms = T0 + 200_000; ms < T0 + 1_500_000; ms += 5_000) {
      const prepHeld = ramOf(run.launched.filter((j) => j.purpose === "prep" && j.launchedAtMs <= ms && j.landsAtMs > ms));
      expect(prepHeld).toBeLessThanOrEqual(ENGINE_TUNABLES.prepShare * POOL_GB + 1e-6);
    }
  });
});

describe("ranking", () => {
  test("targets rank by what their batches earn per GB-second, not by their money: a slow one with twice the money loses", () => {
    // At hacking 300 a weaken on `slow` (minimum security 60) takes
    // 20 · (2.5 · 100 · 60 + 500)/350 = 886 s against rich's 129 s, so the
    // same RAM runs about a seventh as many of its batches; at security 7 its
    // twice the money wins.
    const first = (slow: TargetView) => {
      const s: EngineSnapshot = {
        nowMs: T0, engineHost: "home", engineRamGb: 0, hosts: HOSTS, targets: [phantasy(), rich(), slow],
        player: player(300), mults: NEUTRAL_MULTS, inFlight: [],
      };
      return [...new Set(schedule(s, ORDERS).filter((j) => j.script === HACK_JOB && j.purpose === "batch").map((j) => j.target))];
    };
    const slow = (minDifficulty: number) =>
      phantasy({ host: "slow", moneyMax: 12e9, moneyAvailable: 12e9, minDifficulty, hackDifficulty: minDifficulty, baseDifficulty: 3 * minDifficulty });
    expect(first(slow(60))).toEqual(["rich"]);
    expect(first(slow(7))).toEqual(["slow"]);
  });
});
