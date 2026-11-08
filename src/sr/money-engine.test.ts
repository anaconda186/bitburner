// Seam B: the money engine's scheduler. An engine snapshot and the orders
// from the conductor in, job launches out. Expected values are worked by hand
// from the game's hack formulas (as in docs/research/money-engine-model/engine.py:
// threads to steal a fraction f are f / per-thread fraction).
import { describe, expect, test } from "vitest";
import { NEUTRAL_MULTS, type Hacker } from "./formulas.ts";
import { HACK_JOB, JOB_RAM_GB, schedule, SPLIT_MONEY, SPLIT_OFF, type Job, type EngineOrders, type EngineSnapshot, type TargetView } from "./money-engine.ts";

const NOW = 1_700_000_000_000;
const player = (hacking: number): Hacker => ({
  skills: { hacking, intelligence: 0 },
  mults: { hacking_chance: 1, hacking_exp: 1, hacking_money: 1, hacking_speed: 1, hacking_grow: 1 },
});
/** A rooted server with money: security 10, required level 1, unless overridden. */
const target = (host: string, over: Partial<TargetView> = {}): TargetView => ({
  host,
  hasAdminRights: true,
  hackDifficulty: 10,
  requiredHackingSkill: 1,
  moneyAvailable: 2e6,
  ...over,
});
const ORDERS: EngineOrders = { split: SPLIT_MONEY, homeReserveGb: 0 };

/** The engine on a big empty server, level 100, one target. */
function snap(over: Partial<EngineSnapshot> = {}): EngineSnapshot {
  return {
    nowMs: NOW,
    engineHost: "big",
    engineRamGb: 0,
    hosts: [{ host: "big", maxRamGb: 1024, usedRamGb: 0 }],
    targets: [target("foodnstuff")],
    player: player(100),
    mults: NEUTRAL_MULTS,
    inFlight: [],
    ...over,
  };
}

describe("drain", () => {
  test("with RAM to spare, one hack steals all of a target's money", () => {
    // One thread steals 0.9 · (100 − 0)/100 / 240 = 0.00375, so 1/0.00375 =
    // 266.7 → 267 threads. Hack time 5 · (2.5 · 1 · 10 + 500)/(100 + 50) = 17.5 s.
    expect(schedule(snap(), ORDERS)).toMatchObject([
      { script: HACK_JOB, host: "big", target: "foodnstuff", threads: 267, additionalMsec: 0, landsAtMs: NOW + 17_500 },
    ]);
  });
});

const ramOf = (jobs: readonly Job[]) => jobs.reduce((gb, j) => gb + j.threads * JOB_RAM_GB[j.script], 0);

describe("the RAM split", () => {
  test("off launches nothing", () => {
    expect(schedule(snap(), { split: SPLIT_OFF, homeReserveGb: 0 })).toEqual([]);
  });

  test("a money fraction caps the RAM drain jobs take: half of 100 GB is 29 hack threads", () => {
    // 50 GB / 1.7 GB = 29.4 threads.
    const s = snap({ hosts: [{ host: "big", maxRamGb: 100, usedRamGb: 0 }] });
    const jobs = schedule(s, { split: { money: 0.5, exp: 0.5, share: 0 }, homeReserveGb: 0 });
    expect(jobs.reduce((n, j) => n + j.threads, 0)).toBe(29);
  });

  test("the fraction is of all the engine's RAM, counting what its jobs in flight already hold", () => {
    // 100 GB in all; a job in flight holds 20 threads (34 GB) of the 50 GB
    // money share, so 16 GB is left for 9 more threads.
    const held: Job = {
      script: HACK_JOB, host: "big", target: "joesguns", threads: 20, additionalMsec: 0,
      landsAtMs: NOW + 5_000, steal: 0.1, securityRise: 0.04,
    };
    const s = snap({ hosts: [{ host: "big", maxRamGb: 100, usedRamGb: 34 }], inFlight: [held] });
    const jobs = schedule(s, { split: { money: 0.5, exp: 0, share: 0 }, homeReserveGb: 0 });
    expect(jobs.reduce((n, j) => n + j.threads, 0)).toBe(9);
    expect(ramOf(jobs)).toBeLessThanOrEqual(16);
  });
});

describe("drain targets", () => {
  const hosts = (gb: number) => [{ host: "big", maxRamGb: gb, usedRamGb: 0 }];

  test("hacks only servers with money whose required level the player has", () => {
    const targets = [
      target("broke", { moneyAvailable: 0 }),
      target("cents", { moneyAvailable: 0.5 }),
      target("too-hard", { requiredHackingSkill: 101 }),
      target("joesguns", { requiredHackingSkill: 10 }),
    ];
    expect(schedule(snap({ targets }), ORDERS).map((j) => j.target)).toEqual(["joesguns"]);
  });

  test("when RAM is short, takes the target that pays most per GB-second first", () => {
    // 17 GB is 10 threads. Same stats, so the richer one pays more per thread.
    const targets = [target("poor", { moneyAvailable: 1e5 }), target("rich", { moneyAvailable: 2e6 })];
    expect(schedule(snap({ targets, hosts: hosts(17) }), ORDERS)).toMatchObject([{ target: "rich", threads: 10 }]);
  });

  test("weighs the hack chance and time: a faster, surer target beats a richer slow one", () => {
    // At level 100: "slow" security 90, required 80: chance (175 − 80)/175 · 0.1 = 0.054,
    // fraction 0.1 · 21/100 / 240, time 5 · (2.5·80·90 + 500)/150 = 616.7 s, so
    // per GB-second 3e6 · 0.054 · 8.75e-5 / 616.7 = 2.3e-5 against "quick":
    // 1e6 · 0.9 · 0.00375 / 17.5 = 193.
    const targets = [
      target("slow", { moneyAvailable: 3e6, hackDifficulty: 90, requiredHackingSkill: 80 }),
      target("quick", { moneyAvailable: 1e6 }),
    ];
    expect(schedule(snap({ targets, hosts: hosts(17) }), ORDERS)).toMatchObject([{ target: "quick" }]);
  });

  test("spreads a target's threads over several hosts when one can't hold them", () => {
    const s = snap({
      hosts: [
        { host: "a", maxRamGb: 10, usedRamGb: 0 },
        { host: "b", maxRamGb: 16, usedRamGb: 4.65 },
      ],
    });
    // 11.35 GB: 6 threads; 10 GB: 5 threads. Fullest room first.
    const jobs = schedule(s, ORDERS);
    expect(jobs.map((j) => [j.host, j.threads])).toEqual([["b", 6], ["a", 5]]);
    expect(jobs.every((j) => j.target === "foodnstuff")).toBe(true);
  });
});
