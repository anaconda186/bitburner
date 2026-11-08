// Seam B: the money engine's scheduler. An engine snapshot and the orders
// from the conductor in, job launches out. Expected values are worked by hand
// from the game's hack formulas (as in docs/research/money-engine-model/engine.py:
// threads to steal a fraction f are f / per-thread fraction).
import { describe, expect, test } from "vitest";
import { NEUTRAL_MULTS, type Hacker } from "./formulas.ts";
import { HACK_JOB, JOB_RAM_GB, LAND_SLACK_MS, moveHome, ORDERS_OFF, readOrders, schedule, SPLIT_MONEY, SPLIT_OFF, stillInFlight, type Job, type EngineOrders, type EngineSnapshot, type TargetView } from "./money-engine.ts";

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

describe("jobs in flight", () => {
  const onTheWay = (target: string, threads: number, steal: number, securityRise: number): Job => ({
    script: HACK_JOB, host: "big", target, threads, additionalMsec: 0, landsAtMs: NOW + 1_000, steal, securityRise,
  });

  test("a target whose money a hack in flight will take gets nothing more", () => {
    expect(schedule(snap({ inFlight: [onTheWay("foodnstuff", 267, 1, 0.534)] }), ORDERS)).toEqual([]);
  });

  test("a target a hack in flight takes part of gets the threads for the rest, at the security it will have", () => {
    // In flight: security 10 + 9 = 19 when the next one lands. One thread then
    // steals 0.81 · 1 / 240 = 0.003375, so 1/0.003375 = 296.3 → 297 threads,
    // each taking 0.003375 of the money left. The time stays 17.5 s: it is
    // fixed at launch, by today's security.
    const jobs = schedule(snap({ inFlight: [onTheWay("foodnstuff", 100, 0.375, 9)] }), ORDERS);
    expect(jobs).toMatchObject([{ target: "foodnstuff", threads: 297, landsAtMs: NOW + 17_500 }]);
    expect(jobs[0]?.securityRise).toBeCloseTo(0.594, 12);
  });

  test("a job's expected steal and security rise are those of the formulas", () => {
    // 10 threads of 0.00375 steal 0.0375 and add 0.02 security.
    const [job] = schedule(snap({ hosts: [{ host: "big", maxRamGb: 17, usedRamGb: 0 }] }), ORDERS);
    expect(job?.steal).toBeCloseTo(0.0375, 12);
    expect(job?.securityRise).toBeCloseTo(0.02, 12);
  });
});

describe("never over the RAM it is given", () => {
  test("over many random snapshots, jobs fit each host and the money share, and hit only targets with money", () => {
    let seed = 53;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const hosts = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, n) => {
        const maxRamGb = 2 ** Math.floor(rand() * 8);
        return { host: `h${n}`, maxRamGb, usedRamGb: Math.round(rand() * maxRamGb * 100) / 100 };
      });
      const targets = Array.from({ length: Math.floor(rand() * 5) }, (_, n) =>
        target(`t${n}`, {
          moneyAvailable: rand() < 0.2 ? 0 : rand() * 1e7,
          hackDifficulty: 1 + rand() * 99,
          requiredHackingSkill: 1 + Math.floor(rand() * 200),
        }),
      );
      const money = Math.round(rand() * 10) / 10;
      const s = snap({ hosts, targets, player: player(1 + Math.floor(rand() * 300)) });
      const jobs = schedule(s, { split: { money, exp: 1 - money, share: 0 }, homeReserveGb: 0 });
      const pool = hosts.reduce((gb, h) => gb + h.maxRamGb - h.usedRamGb, 0);
      expect(ramOf(jobs)).toBeLessThanOrEqual(money * pool + 1e-6);
      for (const h of hosts) {
        expect(ramOf(jobs.filter((j) => j.host === h.host))).toBeLessThanOrEqual(h.maxRamGb - h.usedRamGb + 1e-6);
      }
      const rich = new Set(targets.filter((t) => t.moneyAvailable >= 1 && t.requiredHackingSkill <= s.player.skills.hacking).map((t) => t.host));
      for (const j of jobs) {
        expect(rich.has(j.target)).toBe(true);
        expect(j.threads).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(j.threads)).toBe(true);
      }
    }
  });
});

describe("home", () => {
  // The engine (4.65 GB) on foodnstuff, the conductor (3.85 GB) on home.
  const ENGINE_GB = 4.65;
  const withHome = (maxRamGb: number, usedRamGb: number, inFlight: Job[] = []) =>
    snap({
      engineHost: "foodnstuff",
      engineRamGb: ENGINE_GB,
      hosts: [
        { host: "home", maxRamGb, usedRamGb },
        { host: "foodnstuff", maxRamGb: 16, usedRamGb: ENGINE_GB },
      ],
      inFlight,
    });
  const reserve = (homeReserveGb: number): EngineOrders => ({ split: SPLIT_MONEY, homeReserveGb });
  const onHome = (jobs: readonly Job[]) => jobs.filter((j) => j.host === "home").reduce((n, j) => n + j.threads, 0);

  test("keeps the reserve free on home for probes and action helpers", () => {
    // 64 − 3.85 − 2.6 = 57.55 GB: 33 threads. Without the reserve, 35.
    const s = snap({ hosts: [{ host: "home", maxRamGb: 64, usedRamGb: 3.85 }] });
    expect(onHome(schedule(s, reserve(2.6)))).toBe(33);
    expect(onHome(schedule(s, reserve(0)))).toBe(35);
  });

  test("an 8 GB home has no room for the engine, so it stays where it is", () => {
    expect(moveHome(withHome(8, 3.85), reserve(2.6))).toBe(false);
  });

  test("moves to home once home has room for it beside the reserve", () => {
    // 32 − 3.85 = 28.15 GB free, at least 4.65 + 2.6.
    expect(moveHome(withHome(32, 3.85), reserve(2.6))).toBe(true);
    expect(moveHome(withHome(32, 3.85 + 21.1), reserve(2.6))).toBe(false); // 7.05 GB free
    expect(moveHome({ ...withHome(32, 3.85), engineHost: "home" }, reserve(2.6))).toBe(false);
  });

  test("holds the engine's room on home while its own jobs fill it, so it can move once they land", () => {
    // Home 20 GB: conductor 3.85 plus 6 hack threads in flight (10.2 GB),
    // 5.95 GB free now. Once they land there is room for the engine, so the
    // 3.35 GB above the reserve stays free (else 1 more thread would go there).
    const held = Array.from({ length: 1 }, (): Job => ({
      script: HACK_JOB, host: "home", target: "n00dles", threads: 6, additionalMsec: 0,
      landsAtMs: NOW + 1_000, steal: 0.02, securityRise: 0.012,
    }));
    const s = withHome(20, 3.85 + 10.2, held);
    expect(moveHome(s, reserve(2.6))).toBe(false);
    expect(onHome(schedule(s, reserve(2.6)))).toBe(0);
    // A home that won't have room even then is used as usual.
    const small = { ...s, hosts: [{ host: "home", maxRamGb: 8, usedRamGb: 3.85 }, ...s.hosts.slice(1)], inFlight: [] };
    expect(onHome(schedule(small, reserve(0)))).toBe(2);
  });
});

describe("the control port", () => {
  test("reads the orders the conductor wrote", () => {
    const orders = { split: { money: 0.75, exp: 0, share: 0.25 }, homeReserveGb: 2.6 };
    expect(readOrders(structuredClone(orders))).toEqual(orders);
  });

  test("an empty port (after a reload or reset) or anything malformed is off", () => {
    expect(ORDERS_OFF.split).toEqual(SPLIT_OFF);
    for (const raw of [
      "NULL PORT DATA",
      undefined,
      null,
      { split: SPLIT_MONEY },
      { split: { money: 1, exp: 0 }, homeReserveGb: 0 },
      { split: { money: 0.8, exp: 0.4, share: 0 }, homeReserveGb: 0 },
      { split: { money: -1, exp: 0, share: 0 }, homeReserveGb: 0 },
      { split: SPLIT_MONEY, homeReserveGb: -1 },
      { split: { money: Number.NaN, exp: 0, share: 0 }, homeReserveGb: 0 },
    ]) {
      expect(readOrders(raw)).toEqual(ORDERS_OFF);
    }
  });
});

describe("the in-flight book", () => {
  const at = (landsAtMs: number): Job => ({
    script: HACK_JOB, host: "big", target: "n00dles", threads: 1, additionalMsec: 0, landsAtMs, steal: 0.004, securityRise: 0.002,
  });

  test("keeps a job until it should have landed, plus slack for a late timer", () => {
    const jobs = [at(NOW), at(NOW + 5_000)];
    expect(stillInFlight(jobs, NOW + LAND_SLACK_MS)).toEqual(jobs);
    expect(stillInFlight(jobs, NOW + LAND_SLACK_MS + 1)).toEqual([at(NOW + 5_000)]);
  });
});
