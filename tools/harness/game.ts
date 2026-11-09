// The real v3.0.1 game in Chromium, driven the way the human drives it. This
// is the thin browser shell of the harness: it collects observations and the
// pure rules in verdict.ts judge them. Not unit tested; the smoke test is its
// test.
//
// - The game is the zip's `resources/app/` (`.game/app`, from fetch-game),
//   served statically on 127.0.0.1 with a same-origin /blank.html for seeding
//   IndexedDB.
// - Requests to raw.githubusercontent.com/anaconda186/bitburner/... are
//   answered from a LocalRelease, so the start command downloads the local
//   build's exact bytes.
// - Saves live in IndexedDB `bitburnerSave` v2, store `savestring`, key `save`
//   (v3.0.1 src/db.ts). The value is gzip bytes, or a base64 string without
//   CompressionStream.
// - Typing uses real key presses into #terminal-input, as the human does.
//
// Traps (docs/research/headless-game.md §6 has the measurements):
// - The game's own Remote API auto-connect runs once, 2 s after page start,
//   but the settings only load with the save, which takes longer than that
//   (about 5 s locally). So the harness always presses Connect on Options →
//   Remote API after a load.
// - Modal dialogs block Playwright's real clicks and take the keyboard focus,
//   and the Offline summary opens about 250 ms after a loaded save's terminal
//   is up. So every click retries after closing dialogs with Escape
//   (clickThrough), and typeLine checks the input before pressing Enter.
// - page.evaluate counts as a user gesture; nothing here depends on there
//   being none.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { RAW_REPO, type LocalRelease } from "./release.ts";
import type { TerminalLine } from "./verdict.ts";

// The functions passed to page.evaluate run in the page, not in Node. This
// project has no DOM lib (it clashes with Node's own types), so they reach the
// page's globals through these untyped names.
declare const document: any;
declare const indexedDB: any;

export const START_COMMAND = `wget ${RAW_REPO}release/boot.js boot.js; run boot.js`;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Serves `appDir` at http://127.0.0.1:<port>/, plus an empty /blank.html on the same origin. */
export async function serveGame(appDir: string): Promise<{ url: string; close(): Promise<void> }> {
  const root = normalize(appDir);
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (path === "/blank.html") {
      res.writeHead(200, { "content-type": MIME[".html"]! });
      return res.end("<!doctype html><title>blank</title>");
    }
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    readFile(file).then(
      (body) => {
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(body);
      },
      () => {
        res.writeHead(404);
        res.end();
      },
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}

export interface BrowserOptions {
  /** true (the default): headless. */
  headless?: boolean;
  /**
   * "chromium" runs the full Chromium build in its new headless mode; the
   * default is Playwright's headless shell when headless, full Chromium when
   * headed.
   */
  channel?: string;
}

export interface GameSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Uncaught page exceptions, as they happen. */
  pageErrors: string[];
  /** Every raw URL the game asked for, in order. */
  rawRequests: string[];
  close(): Promise<void>;
}

/** A fresh browser and context (so a fresh IndexedDB) with the raw URLs routed to `release`. */
export async function openBrowser(release: LocalRelease, opts: BrowserOptions = {}): Promise<GameSession> {
  const browser = await chromium.launch({ headless: opts.headless ?? true, ...(opts.channel ? { channel: opts.channel } : {}) });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const rawRequests: string[] = [];
  await context.route(`${RAW_REPO}**`, async (route) => {
    const url = route.request().url();
    rawRequests.push(url);
    const a = release.answer(url)!;
    await route.fulfill({ status: a.status, headers: a.headers, body: Buffer.from(a.body) });
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  // The leave-page prompt (window.onbeforeunload) on reload.
  page.on("dialog", (d) => void d.accept());
  return { browser, context, page, pageErrors, rawRequests, close: () => browser.close() };
}

/** Loads the game; resolves once the terminal or the tutorial is up. */
export async function loadGame(page: Page, gameUrl: string): Promise<void> {
  await page.goto(new URL("index.html", gameUrl).href);
  await page.locator("#terminal-input").or(page.getByRole("button", { name: "Exit Tutorial" })).first().waitFor({ timeout: 180_000 });
}

/** The human's "exit the tutorial" on a new game. */
export async function exitTutorial(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Exit Tutorial" }).waitFor({ timeout: 180_000 });
  await clickThrough(page, page.getByRole("button", { name: "Exit Tutorial" }));
  await page.locator("#terminal-input").waitFor({ timeout: 60_000 });
}

async function closeDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 5 && (await page.locator(".MuiModal-root").count()) > 0; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

/**
 * Clicks `target`, closing any dialog in the way first. A dialog can open
 * after the page looks ready: the Offline summary appears about 250 ms after
 * a loaded save's terminal does, and blocks real clicks. So a click that
 * times out closes dialogs and tries again.
 */
async function clickThrough(page: Page, target: Locator, tries = 10): Promise<void> {
  for (let i = 1; ; i++) {
    await closeDialogs(page);
    try {
      await target.click({ timeout: 3_000 });
      return;
    } catch (e) {
      if (i >= tries) throw e;
    }
  }
}

async function sidebar(page: Page, name: string): Promise<void> {
  await clickThrough(page, page.getByRole("button", { name, exact: true }).first());
}

/**
 * Points the game's Remote API at 127.0.0.1:`port` (Options → Remote API),
 * presses Connect, and goes back to the terminal. The settings persist in the
 * save, so after a reload this only presses Connect again. A reconnection
 * delay of 1 s makes the game reconnect by itself if the harness's server
 * drops it.
 */
export async function connectRemoteApi(page: Page, port: number): Promise<void> {
  await closeDialogs(page);
  await sidebar(page, "Options");
  await clickThrough(page, page.getByRole("button", { name: "Remote API", exact: true }));
  const fill = async (placeholder: string, value: string) => {
    const field = page.getByPlaceholder(placeholder, { exact: true });
    if ((await field.inputValue()) !== value) await field.fill(value);
  };
  await fill("localhost", "127.0.0.1");
  await fill("12525", String(port));
  await fill("0", "1");
  await clickThrough(page, page.getByRole("button", { name: "Connect", exact: true }));
  await sidebar(page, "Terminal");
  await page.locator("#terminal-input").waitFor({ timeout: 30_000 });
}

/** Types `line` into the terminal with real key presses, then Enter. */
export async function typeLine(page: Page, line: string): Promise<void> {
  const input = page.locator("#terminal-input");
  await input.waitFor({ timeout: 60_000 });
  // A dialog that opens mid-typing takes the focus, so check what landed in
  // the input before pressing Enter, and start again if it isn't the line.
  for (let i = 1; ; i++) {
    await closeDialogs(page);
    await input.fill("");
    await input.focus();
    await page.keyboard.type(line);
    if ((await input.inputValue()) === line) break;
    if (i >= 5) throw new Error(`typeLine: could not type ${JSON.stringify(line)} into the terminal`);
  }
  await page.keyboard.press("Enter");
}

/**
 * Every terminal line, with whether the game styled it as an error. The
 * terminal's lines are <li>s in #terminal; an error line's Typography gets a
 * class ending in `-error` (v3.0.1 ANSIITypography, tss-react).
 */
export async function terminalLines(page: Page): Promise<TerminalLine[]> {
  return page.locator("#terminal li").evaluateAll((items) =>
    items.map((li) => ({
      text: (li as unknown as { innerText: string }).innerText,
      error: [...li.querySelectorAll("[class]")].some((el) => [...el.classList].some((c) => c.endsWith("-error"))),
    })),
  );
}

/**
 * The game's script-error dialogs ("RUNTIME ERROR" and the like, v3.0.1
 * ErrorModal), with the script and message, so a crash shows up at once
 * instead of only as a state file that stops updating.
 */
export async function errorDialogs(page: Page): Promise<string[]> {
  return page.locator(".MuiModal-root h2").evaluateAll((hs) =>
    hs
      .filter((h) => /\bERROR$/.test(h.textContent ?? ""))
      .map((h) => ((h.parentElement as unknown as { innerText: string } | null)?.innerText ?? h.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
}

/** Whether `ps` on home lists `script`. Types `ps` and reads only its output. */
export async function isRunningOnHome(page: Page, script: string): Promise<boolean> {
  await typeLine(page, "home");
  const before = (await terminalLines(page)).length;
  await typeLine(page, "ps");
  await page.waitForTimeout(500);
  return (await terminalLines(page)).slice(before).some((l) => new RegExp(`\\)\\s+${script.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(\\s|$)`).test(l.text));
}

/** The save in IndexedDB as bytes (a string save is returned as its UTF-8 bytes), or null. */
export async function readSave(page: Page): Promise<Uint8Array | null> {
  const b64 = await page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open("bitburnerSave", 2);
        open.onupgradeneeded = () => open.result.createObjectStore("savestring");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction("savestring", "readonly").objectStore("savestring").get("save");
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            const v: unknown = get.result;
            if (v === undefined) return resolve(null);
            const bytes = typeof v === "string" ? new TextEncoder().encode(v) : new Uint8Array(v as ArrayBuffer);
            let s = "";
            for (const b of bytes) s += String.fromCharCode(b);
            resolve(btoa(s));
          };
        };
      }),
  );
  return b64 === null ? null : new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Puts `save` (an exported save's gzip bytes) into IndexedDB as the game
 * would, from a same-origin blank page, so the next load of the game loads it.
 */
export async function seedSave(page: Page, gameUrl: string, save: Uint8Array): Promise<void> {
  await page.goto(new URL("blank.html", gameUrl).href);
  await page.evaluate(
    (b64) =>
      new Promise<void>((resolve, reject) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const open = indexedDB.open("bitburnerSave", 2);
        open.onupgradeneeded = () => open.result.createObjectStore("savestring");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("savestring", "readwrite");
          tx.objectStore("savestring").put(bytes, "save");
          tx.oncomplete = () => (db.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    Buffer.from(save).toString("base64"),
  );
}

/** Clicks the game's save button and waits until the save in IndexedDB changes. */
export async function saveGame(page: Page, timeoutMs = 15_000): Promise<void> {
  const before = await readSave(page);
  await page.evaluate(() => document.querySelector('[aria-label="save game"]')?.click());
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const now = await readSave(page);
    if (now !== null && (before === null || Buffer.compare(Buffer.from(now), Buffer.from(before)) !== 0)) return;
    await page.waitForTimeout(100);
  }
  throw new Error("save: the save in IndexedDB did not change");
}

export interface TimerProbe {
  visibility: string;
  focused: boolean;
  /** How late `samples` chained 100 ms setTimeouts fired, in ms. */
  lateP50: number;
  lateMax: number;
  samples: number;
}

/**
 * Measures background throttling in the page itself: a hidden or throttled
 * page fires timers late (Chrome: about once a second when hidden, once a
 * minute after 5 min hidden). The game's engine and every ns.sleep are
 * setTimeouts.
 */
export async function probeTimers(page: Page, samples = 20): Promise<TimerProbe> {
  return page.evaluate(async (n) => {
    const late: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = performance.now();
      await new Promise((ok) => setTimeout(ok, 100));
      late.push(performance.now() - t - 100);
    }
    late.sort((a, b) => a - b);
    return {
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      lateP50: Math.round(late[Math.floor(n / 2)]!),
      lateMax: Math.round(late[n - 1]!),
      samples: n,
    };
  }, samples);
}
