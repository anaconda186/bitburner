// Worker `casino`: save-scummed blackjack from a few hundred thousand dollars
// to the casino's $10b cap (spec #41 "Casino"), Open category only. It runs on
// a 64 GB cloud server (later on home) and is the only script that names
// `window`: it pays the game's 25 GB DOM charge for `window` and another 25
// for `document` (through `../ui.ts`).
//
// Each load of the page runs this from the top:
//   1. First line: clear `window.onbeforeunload`, so the script reload below
//      never stalls on a leave-page prompt.
//   2. Check the cap (`getMoneySources().sinceInstall.casino`, never the
//      page) before navigating, and again before each hand.
//   3. City → Iker Molina Casino → blackjack. Each hand: bet all (up to
//      $100m), save the game and wait for the save to land, then Start, Hit
//      and Stay with faked trusted clicks in one synchronous task (so no
//      autosave can fall inside a hand). On a loss, reload the page: the game
//      comes back as it was saved, before the hand.
// It is the one non-temporary run script (#23): the save records it as
// running, so the game starts it again after every reload, wherever it ran,
// with the same arguments. On its way out, at the cap or after an error, it
// launches boot.js on home, so the run carries on even without autoexec. A
// reload never reaches that code. UI waits time out and throw.
//
// Launched like a worker: args[0] its JSON argument ({ category }), args[1]
// its status port (WORKERS.casino in `../helpers.ts`), where it posts
// CasinoNews (`../blackjack.ts`). Covered by the in-game checks only. RAM:
// see tools/ram-budget.ts.
import type { NS } from "@ns";
import {
  betFor, capReached, cardValue, handOutcome, readCasinoArg, readCount, shouldHit, type CasinoNews, type HandOutcome,
} from "../blackjack.ts";
import { goTo, setInput, startingWith, trustedClick, waitFor, withText } from "../ui.ts";
import { decodeHelperArgs, postReport } from "./serve.ts";

const BOOT = "boot.js";
const CONDUCTOR = "sr/conductor.js";
/** Its name on Aevum's city map (src/Locations/data/LocationsMetadata.ts). */
const CASINO_NAME = "Iker Molina Casino";
const CASINO_CITY = "Aevum";
/** How long a save may take to reach IndexedDB (about 25 ms in the lab). */
const SAVE_WAIT_MS = 10_000;
/** After asking for a reload, how long before calling it a failure. */
const RELOAD_WAIT_MS = 30_000;
/** Pushes in a row are 8.7% each; this many means the hands aren't being played. */
const MAX_PUSHES_IN_A_ROW = 20;
/** More Hit clicks than this in one hand means the table isn't reading right. */
const MAX_HITS = 11;
/** boot.js may not fit on home at once (probes come and go): tries, 2 s apart. */
const BOOT_TRIES = 30;

function isScriptDeath(e: unknown): boolean {
  return e instanceof Error && e.name === "ScriptDeath";
}

/** Net casino winnings since the install: the number the game's own cap check uses. */
function winnings(ns: NS): number {
  return ns.getMoneySources().sinceInstall.casino;
}

function money(ns: NS): number {
  return ns.getServerMoneyAvailable("home");
}

/** The table's hand box (a Paper whose first line is "Player" or "Dealer"). */
function handBox(label: "Player" | "Dealer"): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(".MuiPaper-root")].find(
    (p) => p.firstElementChild?.textContent?.trim() === label,
  );
}

function playerCounts(): number[] | undefined {
  const line = [...(handBox("Player")?.children ?? [])].find((c) => c.textContent?.trim().startsWith("Count:") === true);
  return line?.textContent === null || line === undefined ? undefined : readCount(line.textContent);
}

/** The dealer's face-up card: the first card (itself a Paper) in the dealer's box. */
function dealerUp(): number | undefined {
  const face = handBox("Dealer")?.querySelector(".MuiPaper-root span")?.textContent;
  return face === null || face === undefined ? undefined : cardValue(face);
}

/** The bet input; setting it the way React hears it changes the table's bet. */
function setBet(bet: number): void {
  const input = document.querySelector<HTMLInputElement>("input[type='number']");
  if (input === null) throw new Error("no bet input at the blackjack table");
  setInput(input, String(bet));
}

/** What the game last saved to IndexedDB (src/db.ts: bitburnerSave v2, store savestring, key save). */
function savedGame(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("bitburnerSave", 2);
    request.onerror = () => reject(request.error ?? new Error("could not open the save database"));
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction("savestring").objectStore("savestring").get("save");
      get.onsuccess = () => {
        db.close();
        resolve(get.result);
      };
      get.onerror = () => {
        db.close();
        reject(get.error ?? new Error("could not read the save"));
      };
    };
  });
}

/** A save as bytes: the game stores gzip bytes, or a string with compression off (src/types.ts SaveData). */
function saveBytes(v: unknown): Uint8Array | string | undefined {
  if (v === undefined || typeof v === "string" || v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  throw new Error(`unexpected save in IndexedDB (${Object.prototype.toString.call(v)})`);
}

function sameSave(x: unknown, y: unknown): boolean {
  const a = saveBytes(x);
  const b = saveBytes(y);
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Clicks the save icon and waits until the new save is in IndexedDB, where a reload reads it. */
async function saveGame(ns: NS): Promise<void> {
  const button = document.querySelector<HTMLElement>("[aria-label='save game']");
  if (button === null) throw new Error("no save button");
  const before = await savedGame();
  button.click();
  const giveUpAt = Date.now() + SAVE_WAIT_MS;
  while (sameSave(await savedGame(), before)) {
    if (Date.now() >= giveUpAt) throw new Error(`timed out after ${SAVE_WAIT_MS / 1000} s waiting for the save`);
    await ns.sleep(5);
  }
}

/**
 * One hand, start to finish, in one synchronous task: Start, then Hit or
 * Stay by basic strategy until the hand is over. React renders at once after
 * each faked click, so the next button is already there.
 */
function playHand(ns: NS): HandOutcome {
  const before = money(ns);
  const start = withText("button", "Start");
  if (start === undefined) throw new Error("no Start button at the blackjack table");
  trustedClick(start);
  for (let hits = 0; ; ) {
    const hit = withText("button", "Hit");
    if (hit === undefined) break;
    const counts = playerCounts();
    const up = dealerUp();
    if (counts === undefined || up === undefined) throw new Error("could not read the player's count or the dealer's card");
    if (shouldHit(counts, up)) {
      if (++hits > MAX_HITS) throw new Error(`more than ${MAX_HITS} hits in one hand`);
      trustedClick(hit);
    } else {
      const stay = withText("button", "Stay");
      if (stay === undefined) throw new Error("no Stay button");
      trustedClick(stay);
    }
  }
  return handOutcome(before, money(ns));
}

/** Plays to the cap. Returns once it is reached; a loss reloads the page instead. */
async function play(ns: NS, post: (change: Partial<CasinoNews>) => void): Promise<void> {
  // The cap comes first, before any navigation: a casino brought back by a
  // reload after the finish just leaves.
  if (capReached(winnings(ns))) return;
  const city = ns.getPlayer().city;
  if (city !== CASINO_CITY) throw new Error(`the casino is in ${CASINO_CITY}, and the player is in ${city}`);
  await goTo(ns, "City");
  (await waitFor(ns, `${CASINO_NAME} on the city map`, () => document.querySelector<HTMLElement>(`[aria-label="${CASINO_NAME}"]`))).click();
  (await waitFor(ns, "the Play blackjack button", () => startingWith("button", "Play blackjack"))).click();
  await waitFor(ns, "the blackjack table", () => withText("button", "Start"));
  let hands = 0;
  let pushes = 0;
  for (;;) {
    const won = winnings(ns);
    post({ phase: "playing", hands, winnings: won });
    if (capReached(won)) return;
    const cash = money(ns);
    const bet = betFor(cash);
    if (bet === 0) throw new Error(`nothing left to bet ($${cash})`);
    setBet(bet);
    await saveGame(ns);
    const outcome = playHand(ns);
    hands++;
    if (outcome === "lost") {
      // Back to the save made just before the hand. The game starts this
      // script again on the reloaded page.
      window.location.reload();
      await ns.sleep(RELOAD_WAIT_MS);
      throw new Error(`the page did not reload within ${RELOAD_WAIT_MS / 1000} s`);
    }
    pushes = outcome === "push" ? pushes + 1 : 0;
    if (pushes >= MAX_PUSHES_IN_A_ROW) throw new Error(`${pushes} pushes in a row: the hands aren't being played`);
    await ns.sleep(0);
  }
}

/**
 * The way out: boot.js on home, so the run carries on without autoexec too.
 * Home may be briefly full; with the conductor already up, the run is live
 * and boot.js isn't needed.
 */
async function launchBoot(ns: NS): Promise<void> {
  // (Not `attempt`: that name is charged as codingcontract.attempt, 10 GB.)
  for (let tries = 1; tries <= BOOT_TRIES; tries++) {
    const pid = ns.exec(BOOT, "home", { temporary: true });
    if (pid !== 0) {
      ns.tprint(`casino: launched ${BOOT} on home`);
      return;
    }
    if (ns.isRunning(CONDUCTOR, "home")) {
      ns.tprint(`casino: ${BOOT} didn't fit on home, but the conductor is running`);
      return;
    }
    await ns.sleep(2000);
  }
  ns.tprint(`ERROR casino: could not launch ${BOOT} on home (${BOOT_TRIES} tries); run it by hand`);
}

export async function main(ns: NS): Promise<void> {
  // First line on every load: a leave-page prompt nobody answers would stall the reload.
  window.onbeforeunload = null;
  ns.disableLog("ALL");
  const decoded = decodeHelperArgs(ns.args);
  let news: CasinoNews = { host: ns.self().server, phase: "starting", hands: 0, winnings: winnings(ns), lastError: null };
  const post = (change: Partial<CasinoNews>) => {
    news = { ...news, ...change };
    if (decoded.port !== undefined) postReport(ns, decoded.port, news);
  };
  post({});
  try {
    if (!decoded.ok) throw new Error(decoded.error);
    const arg = readCasinoArg(decoded.arg);
    if (!arg.ok) throw new Error(arg.error);
    await play(ns, post);
    post({ phase: "capped", winnings: winnings(ns) });
    ns.tprint(`casino: cap reached ($${Math.round(news.winnings).toLocaleString("en-US")} won since the install)`);
  } catch (e) {
    if (isScriptDeath(e)) throw e;
    const text = e instanceof Error ? e.message : String(e);
    post({ phase: "failed", lastError: text });
    ns.tprint(`ERROR casino: ${text}`);
  }
  await launchBoot(ns);
}
