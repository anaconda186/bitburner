// Seam B: the exp farm (#58, spec #41 user story 61). The `exp` part of the
// RAM split runs a hack-heavy farm: hacks land one after another on the
// target that earns most exp per GB-second, each one just after a 1-thread
// grow (a hack that drains no money earns a quarter of the exp), with a
// weaken after it for the security. Expected rates come from
// docs/research/money-engine-model/stages.py ("exp per GB-second, by method").
import { describe, expect, test } from "vitest";
import { fleet, player, ramOf, simulate, T0, type Landing } from "../../test/engine-sim.ts";
import { hackExp, hackTimeMs, NEUTRAL_MULTS } from "./formulas.ts";
import {
  ENGINE_TUNABLES, GROW_JOB, HACK_JOB, schedule, SHARE_JOB, SPLIT_MONEY, WEAKEN_JOB, type EngineOrders, type EngineSnapshot, type Job, type RamSplit, type TargetView,
} from "./money-engine.ts";

const orders = (split: RamSplit): EngineOrders => ({ split, homeReserveGb: 0, mults: NEUTRAL_MULTS });
const EXP = orders({ money: 0, exp: 1, sharing: 0 });
/** joesguns at BN1's midpoints (engine.py: $2.5m × 25, security 15, growth 20, level 10), prepared. */
const joesguns = (over: Partial<TargetView> = {}): TargetView => ({
  host: "joesguns",
  hasAdminRights: true,
  requiredHackingSkill: 10,
  baseDifficulty: 15,
  minDifficulty: 5,
  hackDifficulty: 5,
  moneyMax: 62.5e6,
  moneyAvailable: 62.5e6,
  serverGrowth: 20,
  ...over,
});
const n00dles = joesguns({ host: "n00dles", requiredHackingSkill: 1, baseDifficulty: 1, minDifficulty: 1, hackDifficulty: 1, moneyMax: 1.75e6, moneyAvailable: 1.75e6, serverGrowth: 3000 });
const foodnstuff = joesguns({ host: "foodnstuff", requiredHackingSkill: 1, baseDifficulty: 10, minDifficulty: 3, hackDifficulty: 3, moneyMax: 50e6, moneyAvailable: 50e6, serverGrowth: 5 });
const P300 = player(300);
const farmLandings = (ls: readonly Landing[]) => ls.filter((l) => l.job.purpose === "farm");
const letter = (j: Job) => (j.script === HACK_JOB ? "H" : j.script === GROW_JOB ? "G" : "W");

describe("the exp farm", () => {
  const HOSTS = fleet(4, 1024);
  const run = simulate({ hosts: HOSTS, targets: [joesguns()], seconds: 300, orders: EXP, player: P300 });

  test("each hack lands just after a 1-thread grow, and a weaken just after it: grow, hack, weaken, a landing gap apart", () => {
    const ls = farmLandings(run.landings);
    const hacks = ls.filter((l) => l.job.script === HACK_JOB);
    expect(hacks.length).toBeGreaterThan(100);
    // Distinct landing times in order (a hack split over hosts lands as one).
    const times = [...new Map(ls.map((l) => [l.atMs, letter(l.job)])).entries()].sort((a, b) => a[0] - b[0]);
    const pattern = times.map(([, x]) => x).join("");
    // Every hack comes straight after its grow and before its weaken (the
    // first cycles may start with a grow and weaken whose hack was too late).
    expect(pattern.replace(/GHW/g, "")).toMatch(/^[GW]*$/);
    expect(pattern.match(/GHW/g)?.length).toBeGreaterThan(100);
    for (let i = 0; i + 2 < times.length; i++) {
      if (times[i + 1]?.[1] !== "H") continue;
      const [g, h, w] = [times[i], times[i + 1], times[i + 2]] as [[number, string], [number, string], [number, string]];
      expect([h[0] - g[0], w[0] - h[0]].map(Math.round)).toEqual([ENGINE_TUNABLES.landGapMs, ENGINE_TUNABLES.landGapMs]);
    }
    for (const l of ls.filter((x) => x.job.script === GROW_JOB)) expect(l.job.threads).toBe(1);
  });

  test("every hack lands on money (so it earns its full exp) at the minimum security plus its grow's rise", () => {
    const hacks = farmLandings(run.landings).filter((l) => l.job.script === HACK_JOB);
    for (const h of hacks) {
      expect(h.money).toBeGreaterThan(0);
      // Its grow has just added 0.004 (nothing while the money is full); its weaken lands next.
      expect(h.security).toBeGreaterThanOrEqual(5);
      expect(h.security).toBeLessThanOrEqual(5.004 + 1e-9);
    }
  });

  test("it earns more than twice the exp per GB-second of grow plus weaken on the same RAM", () => {
    // Grow plus weaken (stages.py): 12.5 grows per weaken, each thread
    // earning the target's exp, held 3.2 and 4 hack-times:
    // exp · 1.08 / ((1.75 · 3.2 + 0.08 · 1.75 · 4) · T) per GB-second.
    // The model's hack-heavy farm makes 3.2 times that with every hack held
    // exactly its hack time. Here a hack is launched up to a second early
    // (just in time for a 500 ms loop), each cycle's weaken holds about a
    // seventh of the RAM, and the odd slot is lost to the landing guard:
    // about 2.1 to 2.5 times.
    const t = joesguns();
    const T = hackTimeMs(t, P300, NEUTRAL_MULTS) / 1000;
    const e = hackExp(t, P300, NEUTRAL_MULTS);
    const growWeakenRate = (e * 1.08) / ((1.75 * 3.2 + 0.08 * 1.75 * 4) * T);
    // The farm's exp over the last four minutes, once its pipeline is full.
    const late = simulate({ hosts: HOSTS, targets: [joesguns()], seconds: 300, orders: EXP, player: P300 });
    const early = simulate({ hosts: HOSTS, targets: [joesguns()], seconds: 60, orders: EXP, player: P300 });
    const farmRate = (late.exp - early.exp) / (4 * 1024 * 240);
    expect(farmRate / growWeakenRate).toBeGreaterThan(2);
  });

  test("it fills the exp part of the RAM and no more", () => {
    const half = simulate({ hosts: HOSTS, targets: [joesguns()], seconds: 120, orders: orders({ money: 0, exp: 0.5, sharing: 0 }), player: P300 });
    const late = half.heldGb.slice(2 * 60);
    expect(Math.max(...half.heldGb)).toBeLessThanOrEqual(0.5 * 4 * 1024 + 1e-6);
    expect(late.reduce((a, b) => a + b, 0) / late.length).toBeGreaterThan(0.6 * 0.5 * 4 * 1024);
  });

  test("its target is the one that earns most exp per GB-second: foodnstuff, just ahead of joesguns, well ahead of n00dles", () => {
    // Exp per thread 3 + 0.3 × base security, times the expected share
    // (chance + (1 − chance)/4), over a hack time of 2.5 × level × min
    // security + 500. At hacking 300 the chance is (525 − level)/525 ×
    // (100 − min)/100: n00dles 3.3 × 0.991/502.5 = 0.0065, foodnstuff
    // 6 × 0.976/507.5 = 0.0115, joesguns 7.5 × 0.949/625 = 0.0114.
    const s: EngineSnapshot = {
      nowMs: T0, engineHost: "home", engineRamGb: 0, hosts: HOSTS, targets: [n00dles, foodnstuff, joesguns()],
      player: P300, mults: NEUTRAL_MULTS, inFlight: [],
    };
    expect(new Set(schedule(s, EXP).map((j) => j.target))).toEqual(new Set(["foodnstuff"]));
  });

  test("a target above its minimum security is weakened first, and farmed once it is down", () => {
    const run2 = simulate({ hosts: HOSTS, targets: [joesguns({ hackDifficulty: 15 })], seconds: 300, orders: EXP, player: P300 });
    const first = run2.launched.filter((j) => j.launchedAtMs === T0);
    expect(new Set(first.map((j) => j.script))).toEqual(new Set([WEAKEN_JOB]));
    const hacks = farmLandings(run2.landings).filter((l) => l.job.script === HACK_JOB);
    expect(hacks.length).toBeGreaterThan(50);
    for (const h of hacks) expect(h.security).toBeLessThanOrEqual(5.004 + 1e-9);
  });
});

describe("share (spec #41 user story 62: about 25% share while working for rep)", () => {
  test("the share part runs share jobs (10 s each, launched again as they end) on that part of the RAM, the rest farming exp", () => {
    const split = { money: 0, exp: 0.75, sharing: 0.25 };
    const hosts = fleet(4, 1024);
    const run = simulate({ hosts, targets: [joesguns()], seconds: 120, orders: orders(split), player: P300 });
    const shares = run.launched.filter((j) => j.script === SHARE_JOB);
    expect(shares.length).toBeGreaterThan(0);
    for (const j of shares) {
      expect(j.purpose).toBe("sharing");
      // ns.share() takes 10 s (src/NetworkShare/Share.ts ShareBonusTime).
      expect(j.landsAtMs - j.launchedAtMs).toBe(10_000);
    }
    const pool = 4 * 1024;
    for (let ms = T0 + 20_000; ms < T0 + 120_000; ms += 1_000) {
      const held = ramOf(shares.filter((j) => j.launchedAtMs <= ms && j.landsAtMs > ms));
      expect(held).toBeLessThanOrEqual(0.25 * pool + 1e-6);
      expect(held).toBeGreaterThan(0.2 * pool);
    }
    expect(run.launched.some((j) => j.purpose === "farm")).toBe(true);
  });
});

describe("a split change takes effect on the engine's next loop", () => {
  test("money to exp and back: the old kind stops launching at once, the new one starts", () => {
    const phantasy = joesguns({
      host: "phantasy", requiredHackingSkill: 100, baseDifficulty: 20, minDifficulty: 7, hackDifficulty: 7, moneyMax: 600e6, moneyAvailable: 600e6, serverGrowth: 35,
    });
    const flip = T0 + 200_000;
    const back = T0 + 400_000;
    const run = simulate({
      hosts: fleet(25, 1024), targets: [phantasy, joesguns()], seconds: 600, player: P300,
      orders: (ms) => (ms >= flip && ms < back ? EXP : orders(SPLIT_MONEY)),
    });
    const exp = (j: Job) => j.purpose === "farm" || j.purpose === "farmPrep";
    const money = (j: Job) => j.purpose === "batch" || j.purpose === "drain" || j.purpose === "prep";
    const inWindow = (from: number, to: number) => run.launched.filter((j) => j.launchedAtMs >= from && j.launchedAtMs < to);
    expect(inWindow(T0, flip).filter(exp)).toEqual([]);
    expect(inWindow(flip, back).filter(money)).toEqual([]);
    expect(inWindow(flip, flip + 10_000).filter(exp).length).toBeGreaterThan(0);
    expect(inWindow(back, T0 + 600_000).filter(exp)).toEqual([]);
    expect(inWindow(back, back + 10_000).filter(money).length).toBeGreaterThan(0);
    // The RAM follows: by the end of the exp window the farm holds most of it.
    const farmHeld = ramOf(run.launched.filter((j) => j.purpose === "farm" && j.launchedAtMs < back && j.landsAtMs > back - 1_000));
    expect(farmHeld).toBeGreaterThan(0.7 * 25 * 1024);
  });
});
