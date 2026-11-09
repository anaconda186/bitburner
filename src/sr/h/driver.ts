// Worker `driver`: BN1.1's UI automation (spec #41 "Driver"), a long-lived
// script on its own 32 GB cloud server (sr-00). It names `document` only, so
// it pays the game's 25 GB DOM charge once (`../ui.ts`).
//
// The conductor keeps one job on the control port (a DriverOrder from
// `../driver-jobs.ts`); the driver does each new one through the UI and posts
// DriverNews to its status port: what it last read from the game, and the
// seq of the last job it finished. Every job checks the game first, so a job
// done already changes nothing (a driver started again redoes the last one).
//
// Its UI waits time out and throw. Any error ends the driver, after an
// `ERROR driver:` line; the conductor starts it again with backoff.
//
// Launched like a helper: args[0] its JSON argument ({ control }), args[1] its
// status port (WORKERS.driver in `../helpers.ts`). Covered by the in-game
// checks only. RAM: see tools/ram-budget.ts.
import type { NS } from "@ns";
import { PORT_OPENERS, readDriverOrder, type DriverFacts, type DriverJob, type DriverNews } from "../driver-jobs.ts";
import { goTo, setInput, startingWith, reactProps, typeCommand, waitFor, withText } from "../ui.ts";
import { decodeHelperArgs, postReport } from "./serve.ts";

const TICK_MS = 500;
/** What autoexec runs on every game load: the way back after a page reload. */
const AUTOEXEC = "boot.js";
/** The switches on Options → Gameplay the run wants on (src/GameOptions/ui/GameplayPage.tsx). */
const SUPPRESS = ["Suppress faction invites", "Suppress travel confirmations", "Suppress augmentations confirmation"];
/** Every tech vendor (sells TOR), by its name on the city map (src/Locations/data/LocationsMetadata.ts). */
const TECH_VENDORS = [
  "Alpha Enterprises",
  "ECorp",
  "Fulcrum Technologies",
  "NetLink Technologies",
  "Omega Software",
  "Storm Technologies",
  "CompuTek",
  "OmniTek Incorporated",
];

function isScriptDeath(e: unknown): boolean {
  return e instanceof Error && e.name === "ScriptDeath";
}

function readFacts(ns: NS): DriverFacts {
  const player = ns.getPlayer();
  return {
    money: player.money,
    city: player.city,
    tor: ns.hasTorRouter(),
    programs: PORT_OPENERS.map((p) => p.name).filter((name) => ns.fileExists(name, "home")),
  };
}

/** Options → System: autoexec; Options → Gameplay: the suppress switches. Saves the game if it changed any. */
async function setOptions(ns: NS): Promise<void> {
  let changed = false;
  await goTo(ns, "Options");
  (await waitFor(ns, "the System tab", () => withText("[role='button']", "System"))).click();
  const autoexec = await waitFor(ns, "the autoexec input", () =>
    withText("p", "Autoexec Script + Args")?.parentElement?.querySelector("input") ?? undefined,
  );
  if (autoexec.value !== AUTOEXEC) {
    setInput(autoexec, AUTOEXEC);
    await waitFor(ns, `autoexec to read ${AUTOEXEC}`, () => autoexec.value === AUTOEXEC);
    changed = true;
  }
  (await waitFor(ns, "the Gameplay tab", () => withText("[role='button']", "Gameplay"))).click();
  for (const text of SUPPRESS) {
    const box = () => withText("label", text)?.querySelector<HTMLInputElement>("input[type='checkbox']") ?? undefined;
    const input = await waitFor(ns, `the "${text}" switch`, box);
    if (input.checked) continue;
    input.click();
    await waitFor(ns, `"${text}" to be on`, () => box()?.checked === true);
    changed = true;
  }
  if (changed) {
    // Settings live in the save: save now, so a reload before the next autosave keeps them.
    (await waitFor(ns, "the save button", () => document.querySelector<HTMLElement>("[aria-label='save game']"))).click();
    ns.tprint("driver: autoexec set to boot.js and the suppress options on; game saved");
  }
  await goTo(ns, "Terminal");
}

/** City → a tech vendor → "Purchase TOR router". */
async function buyTor(ns: NS): Promise<void> {
  if (ns.hasTorRouter()) return;
  await goTo(ns, "City");
  const vendor = await waitFor(ns, "a tech vendor on the city map", () =>
    TECH_VENDORS.map((name) => document.querySelector<HTMLElement>(`[aria-label="${name}"]`)).find((el) => el !== null),
  );
  vendor.click();
  (await waitFor(ns, "the Purchase TOR router button", () => startingWith("button", "Purchase TOR router"))).click();
  await waitFor(ns, "the TOR router to be owned", () => ns.hasTorRouter());
  ns.tprint("driver: bought the TOR router");
  await goTo(ns, "Terminal");
}

/** `buy <program>` for each one not on home yet, in one `;` chain. */
async function buyPrograms(ns: NS, programs: readonly string[]): Promise<void> {
  const missing = programs.filter((name) => !ns.fileExists(name, "home"));
  if (missing.length === 0) return;
  await typeCommand(ns, missing.map((name) => `buy ${name}`).join("; "));
  await waitFor(ns, `${missing.join(", ")} on home`, () => missing.every((name) => ns.fileExists(name, "home")));
}

/**
 * The city on the Travel page: a "Travel to <city>" button with ASCII art off,
 * else its letter on the world map (a span with a click handler).
 */
function travelSpot(city: string): HTMLElement | undefined {
  return (
    withText("button", `Travel to ${city}`) ??
    [...document.querySelectorAll<HTMLElement>("span")].find(
      (s) => s.textContent === city.charAt(0) && typeof reactProps(s)?.onClick === "function",
    )
  );
}

/** Travel → the city (no confirmation once "Suppress travel confirmations" is on). */
async function travelTo(ns: NS, city: string): Promise<void> {
  if (ns.getPlayer().city === city) return;
  await goTo(ns, "Travel");
  (await waitFor(ns, `${city} on the Travel page`, () => travelSpot(city))).click();
  await waitFor(ns, `arriving in ${city}`, () => ns.getPlayer().city === city);
  ns.tprint(`driver: travelled to ${city}`);
  await goTo(ns, "Terminal");
}

async function carryOut(ns: NS, job: DriverJob): Promise<void> {
  switch (job.kind) {
    case "options":
      return setOptions(ns);
    case "tor":
      return buyTor(ns);
    case "buy":
      return buyPrograms(ns, job.programs);
    case "travel":
      return travelTo(ns, job.city);
    default: {
      const unknown: never = job;
      throw new Error(`unknown job ${JSON.stringify(unknown)}`);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const decoded = decodeHelperArgs(ns.args);
  const control = decoded.ok ? (decoded.arg as { control?: unknown } | null)?.control : undefined;
  if (decoded.port === undefined || typeof control !== "number") {
    ns.tprint(`ERROR driver: bad arguments ${JSON.stringify(ns.args)}`);
    return;
  }
  const port = decoded.port;
  let news: DriverNews = { host: ns.self().server, facts: readFacts(ns), optionsSet: false, done: 0, lastError: null };
  postReport(ns, port, news);
  try {
    for (;;) {
      const order = readDriverOrder(ns.peek(control));
      if (order !== undefined && order.seq > news.done) {
        ns.print(`job ${order.seq}: ${JSON.stringify(order.job)}`);
        await carryOut(ns, order.job);
        news = { ...news, done: order.seq, optionsSet: news.optionsSet || order.job.kind === "options" };
      }
      news = { ...news, facts: readFacts(ns) };
      postReport(ns, port, news);
      await ns.sleep(TICK_MS);
    }
  } catch (e) {
    if (isScriptDeath(e)) throw e;
    const text = e instanceof Error ? e.message : String(e);
    postReport(ns, port, { ...news, lastError: text });
    ns.tprint(`ERROR driver: ${text}; exiting, the conductor starts it again`);
    // Leave the page on the terminal, where the error line shows (best effort).
    try {
      await goTo(ns, "Terminal");
    } catch (back) {
      if (isScriptDeath(back)) throw back;
    }
  }
}
