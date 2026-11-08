// Dev-only game script: records golden values for the formula model
// (src/sr/formulas.ts) with the game's own ns.formulas.* on a lab save that
// owns Formulas.exe. Never part of a release: it lives in tools/, and
// tools/record-formulas.ts transpiles it, pushes it to home over the Remote
// API, runs it and reads back OUT_FILE.
//
// Inputs are the lab save's real servers (scan from home), each recorded in
// several states, and the player with chosen skills and person multipliers.
// The BitNode multipliers are whatever the save's BitNode applies; they are
// recorded too when SF5 makes them readable. Cases come from a seeded PRNG,
// so re-recording the same save gives the same fixture.
//
// Non-finite numbers (growThreads on a server that can't grow is Infinity)
// are written as the strings "Infinity", "-Infinity" and "NaN", since JSON
// has no such numbers.
import type { NS, Person, Server } from "@ns";

export const OUT_FILE = "golden-formulas.json";

/** The server fields the model reads. */
const SERVER_KEYS = [
  "hostname",
  "hasAdminRights",
  "hackDifficulty",
  "minDifficulty",
  "baseDifficulty",
  "requiredHackingSkill",
  "serverGrowth",
  "moneyAvailable",
  "moneyMax",
] as const;
const PERSON_MULTS = ["hacking_chance", "hacking_exp", "hacking_money", "hacking_speed", "hacking_grow"] as const;

export async function main(ns: NS): Promise<void> {
  let seed = 0x5eed52;
  const rnd = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const between = (lo: number, hi: number): number => lo + rnd() * (hi - lo);

  const hosts: string[] = ["home"];
  for (let i = 0; i < hosts.length; i++) {
    for (const h of ns.scan(hosts[i])) if (!hosts.includes(h)) hosts.push(h);
  }
  hosts.sort();

  const player = ns.getPlayer();
  const f = ns.formulas;

  const hacking: unknown[] = [];
  for (const host of hosts) {
    const real = ns.getServer(host) as Server;
    for (let i = 0; i < 5; i++) {
      const min = real.minDifficulty ?? 1;
      const base = real.baseDifficulty ?? 1;
      const max = real.moneyMax ?? 0;
      const server: Server = {
        ...real,
        hasAdminRights: i > 0 && rnd() < 0.95,
        hackDifficulty: rnd() < 0.1 ? pick([99.5, 100, 150]) : pick([min, min, base, between(min, 100), between(1, 5)]),
        moneyAvailable: pick([0, 1, max, max * rnd(), max * rnd(), max * rnd() * 0.01]),
      };
      const required = server.requiredHackingSkill ?? 1;
      const person: Person = {
        ...player,
        skills: {
          ...player.skills,
          hacking:
            rnd() < 0.15
              ? pick([1, 5, required])
              : pick([required + 1, Math.ceil(required * between(1, 4)), Math.floor(between(required, 3000))]),
          intelligence: pick([0, 0, 1, 50, 300]),
        },
        mults: { ...player.mults },
      };
      for (const m of PERSON_MULTS) person.mults[m] = rnd() < 0.5 ? 1 : between(0.3, 4);
      const threads = pick([1, 2, 13, 100, 1000, Math.ceil(between(1, 20000))]);
      const cores = pick([1, 1, 2, 5, 16, 64]);
      const money = server.moneyAvailable ?? 0;
      const targetMoney = pick([max, max, max * 2, money, money * between(1, 3), money + between(1, 1e6)]);
      hacking.push({
        server: Object.fromEntries(SERVER_KEYS.map((k) => [k, server[k]])),
        person: {
          skills: { hacking: person.skills.hacking, intelligence: person.skills.intelligence },
          mults: Object.fromEntries(PERSON_MULTS.map((m) => [m, person.mults[m]])),
        },
        threads,
        cores,
        targetMoney,
        out: {
          hackChance: f.hacking.hackChance(server, person),
          hackExp: f.hacking.hackExp(server, person),
          hackPercent: f.hacking.hackPercent(server, person),
          growPercent: f.hacking.growPercent(server, threads, person, cores),
          growAmount: f.hacking.growAmount(server, person, threads, cores),
          growThreads: f.hacking.growThreads(server, person, targetMoney, cores),
          hackTime: f.hacking.hackTime(server, person),
          growTime: f.hacking.growTime(server, person),
          weakenTime: f.hacking.weakenTime(server, person),
        },
      });
    }
  }

  const weaken: unknown[] = [];
  for (const threads of [0, 1, 2, 7, 100, 12345]) {
    for (const cores of [1, 2, 3, 8, 64]) weaken.push({ threads, cores, out: f.hacking.weakenEffect(threads, cores) });
  }

  const mults = [1, 0, 0.8, 0.35, 0.25, 1.37, 2.5, between(0.1, 3)];
  const skills: unknown[] = [];
  for (const exp of [0, 0.5, 1, 100, 1234.5, 1e5, 2.5e6, 1e9, 1e12, 1e15, between(0, 1e8)]) {
    for (const mult of mults) skills.push({ exp, mult, out: f.skills.calculateSkill(exp, mult) });
  }
  const exps: unknown[] = [];
  for (const skill of [1, 2, 10, 100, 250.5, 1000, 2500, 3000, 1e4, Math.floor(between(1, 5000))]) {
    for (const mult of mults.filter((m) => m > 0)) exps.push({ skill, mult, out: f.skills.calculateExp(skill, mult) });
  }

  const cloud: unknown[] = [];
  for (const ram of [0, -8, 1, 2, 3, 6, 8, 32, 64, 100, 128, 256, 1024, 4096, 2 ** 16, 2 ** 19, 2 ** 20, 2 ** 21, 7.9, 8.4]) {
    cloud.push({ ram, out: ns.cloud.getServerCost(ram) });
  }

  let nodeMults: Record<string, number> | null = null;
  try {
    nodeMults = { ...ns.getBitNodeMultipliers() } as unknown as Record<string, number>;
  } catch {
    // Needs SF5 (or BN5); the driver then records the multipliers it set up.
  }
  const reset = ns.getResetInfo();
  const out = {
    bitNodeN: reset.currentNode,
    sfLevel: reset.ownedSF.get(reset.currentNode) ?? 0,
    nodeMults,
    cloudMaxRam: ns.cloud.getRamLimit(),
    hacking,
    weaken,
    skills,
    exps,
    cloud,
  };
  const text = JSON.stringify(out, (_k, v: unknown) =>
    typeof v === "number" && !Number.isFinite(v) ? String(v) : v,
  );
  ns.write(OUT_FILE, text, "w");
  ns.tprint(`GOLDEN done: ${hacking.length} hacking cases`);
}
