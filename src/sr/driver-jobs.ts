// The driver's jobs (spec #41 "Driver"): what the conductor may ask of the
// driver, what the driver reports back, and which job comes next. Pure and
// ns-free: `decide` picks the job from the driver's report, the worker
// `h/driver.ts` carries it out through the UI.
//
// RAM: the conductor and the driver import this file, so every identifier in
// it that is named like an NS function is charged to both. Strings are free.

/** "Purchase TOR router" at a tech vendor (src/Constants.ts:44). */
export const TOR_COST = 200_000;

/**
 * The port openers, in the order they are bought (cheapest first), with their
 * dark web prices (src/DarkWeb/DarkWebItems.ts:6-10). `buy -a` is not used: it
 * goes on to the other dark web items, Formulas.exe ($5b) among them, which
 * the run never uses.
 */
export const PORT_OPENERS: readonly { readonly name: string; readonly price: number }[] = [
  { name: "BruteSSH.exe", price: 500e3 },
  { name: "FTPCrack.exe", price: 1500e3 },
  { name: "relaySMTP.exe", price: 5e6 },
  { name: "HTTPWorm.exe", price: 30e6 },
  { name: "SQLInject.exe", price: 250e6 },
];

export type DriverJob =
  | { readonly kind: "options" }
  | { readonly kind: "tor" }
  /** Type `buy <name>` for each, chained with `;`. */
  | { readonly kind: "buy"; readonly programs: readonly string[] }
  /** Travel there from the Travel page (no confirmation once the options are set). */
  | { readonly kind: "travel"; readonly city: City };

/** A plane ticket (src/Constants.ts:28). */
export const TRAVEL_COST = 200_000;

/** The cities (CityName in src/Enums.ts). Their initials all differ: the travel map shows only those. */
export const CITIES = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"] as const;
export type City = (typeof CITIES)[number];
const isCity = (x: unknown): x is City => CITIES.includes(x as City);

/** What the driver last read from the game (after its last job). */
export type DriverFacts = {
  readonly money: number;
  readonly city: string;
  readonly tor: boolean;
  /** The port openers on home (PORT_OPENERS names). */
  readonly programs: readonly string[];
};

/** The driver's report (its WorkerReport value). */
export type DriverNews = {
  readonly host: string;
  readonly facts: DriverFacts;
  /** This driver has checked (and where needed set) autoexec and the suppress options. */
  readonly optionsSet: boolean;
  /** `seq` of the last order it finished; 0 before its first. */
  readonly done: number;
  readonly lastError: string | null;
};

/**
 * What the conductor keeps on the driver's control port. `seq` goes up by one
 * per job, so the driver tells a new job from one it has done (its news says
 * `done`), and a driver started again finds the last job waiting.
 */
export type DriverOrder = { readonly seq: number; readonly job: DriverJob };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const isCount = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

function readJob(raw: unknown): DriverJob | undefined {
  if (!isObject(raw)) return undefined;
  switch (raw.kind) {
    case "options":
    case "tor":
      return { kind: raw.kind };
    case "buy":
      return isStrings(raw.programs) ? { kind: "buy", programs: raw.programs } : undefined;
    case "travel":
      return isCity(raw.city) ? { kind: "travel", city: raw.city } : undefined;
    default:
      return undefined;
  }
}

/** The order on the control port; an empty port ("NULL PORT DATA") or anything malformed is none. */
export function readDriverOrder(raw: unknown): DriverOrder | undefined {
  if (!isObject(raw) || !isCount(raw.seq) || raw.seq < 1) return undefined;
  const job = readJob(raw.job);
  return job === undefined ? undefined : { seq: raw.seq, job };
}

/** The driver's news from its WorkerReport value; anything malformed is none. */
export function readDriverNews(raw: unknown): DriverNews | undefined {
  if (!isObject(raw) || !isObject(raw.facts)) return undefined;
  const { money, city, tor, programs } = raw.facts;
  if (typeof money !== "number" || typeof city !== "string" || typeof tor !== "boolean" || !isStrings(programs)) return undefined;
  if (typeof raw.host !== "string" || typeof raw.optionsSet !== "boolean" || !isCount(raw.done)) return undefined;
  if (raw.lastError !== null && typeof raw.lastError !== "string") return undefined;
  return {
    host: raw.host,
    facts: { money, city, tor, programs },
    optionsSet: raw.optionsSet,
    done: raw.done,
    lastError: raw.lastError,
  };
}

/** The next job for the driver, or undefined when there is nothing to do yet. */
export function nextDriverJob(news: DriverNews, wantedCity: City | null): DriverJob | undefined {
  if (!news.optionsSet) return { kind: "options" };
  const { facts } = news;
  if (!facts.tor) return facts.money >= TOR_COST ? { kind: "tor" } : undefined;
  const missing = PORT_OPENERS.filter((p) => !facts.programs.includes(p.name));
  const brute = PORT_OPENERS[0];
  if (brute !== undefined && missing.includes(brute)) {
    return facts.money >= brute.price ? { kind: "buy", programs: [brute.name] } : undefined;
  }
  if (wantedCity !== null && facts.city !== wantedCity) {
    return facts.money >= TRAVEL_COST ? { kind: "travel", city: wantedCity } : undefined;
  }
  const affordable: string[] = [];
  let left = facts.money;
  for (const p of missing) {
    if (p.price > left) break;
    affordable.push(p.name);
    left -= p.price;
  }
  return affordable.length > 0 ? { kind: "buy", programs: affordable } : undefined;
}
