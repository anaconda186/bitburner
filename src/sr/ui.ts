// The UI kit for the run's DOM scripts (the driver, later the casino): finding
// the game's elements, clicking, typing into the terminal, and waiting for the
// page, every wait with a timeout that throws (spec #41 "Driver").
//
// RAM: this file names `document`, so every script that imports it pays the
// game's 25 GB DOM charge. It must never name `window` (another 25 GB) or
// reach it through the document's view property. The conductor and the
// helpers never import it. Recipes from #20 and the lab (docs: lab-harness).
import type { NS } from "@ns";

/** How long a UI wait lasts before it throws, by default. */
export const UI_WAIT_MS = 10_000;
const POLL_MS = 50;

/**
 * Polls `look` until it gives something (not undefined, null or false), and
 * returns that. Throws once `timeoutMs` has passed: a page that never shows
 * what the driver expects is an error, never a hang.
 */
export async function waitFor<T>(
  ns: NS,
  what: string,
  look: () => T | undefined | null | false,
  timeoutMs = UI_WAIT_MS,
): Promise<T> {
  const giveUpAt = Date.now() + timeoutMs;
  for (;;) {
    const found = look();
    if (found !== undefined && found !== null && found !== false) return found;
    if (Date.now() >= giveUpAt) throw new Error(`timed out after ${timeoutMs / 1000} s waiting for ${what}`);
    await ns.sleep(POLL_MS);
  }
}

/** The first element matching `selector` whose trimmed text is exactly `text`. */
export function withText(selector: string, text: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.trim() === text);
}

/** The first element matching `selector` whose trimmed text starts with `prefix`. */
export function startingWith(selector: string, prefix: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.trim().startsWith(prefix) === true);
}

/** A sidebar entry. Its text ends with the label: a badge count can come first ("1Factions"). */
export function sidebarItem(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(".MuiListItem-root, [role='button']")].find(
    (e) => e.textContent?.trim().endsWith(label) === true,
  );
}

/** Goes to a page through its sidebar entry (Terminal, City, Travel, Options, ...). */
export async function goTo(ns: NS, page: string): Promise<void> {
  (await waitFor(ns, `the ${page} entry in the sidebar`, () => sidebarItem(page))).click();
}

/** React keeps each element's props on it under a `__reactProps$<random>` key. */
export function reactProps(el: Element): Record<string, unknown> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps"));
  return key === undefined ? undefined : ((el as unknown as Record<string, Record<string, unknown>>)[key] ?? undefined);
}

/**
 * The faked trusted click (GLOSSARY): calls the element's React onClick with
 * an event that says it is trusted, which gets past the game's isTrusted
 * guards (blackjack, Factions-page Join, #20). Open category only, and only
 * where a guard needs it; a plain `.click()` does everywhere else.
 */
export function trustedClick(el: Element): void {
  const onClick = reactProps(el)?.onClick;
  if (typeof onClick !== "function") throw new Error(`no React onClick on ${el.tagName} "${el.textContent?.trim() ?? ""}"`);
  onClick({ isTrusted: true });
}

/** Sets an input's value the way React hears it: the native setter, then a bubbling input event. */
export function setInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("no value setter on HTMLInputElement");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Types a line into the terminal and submits it (#20's recipe): the Terminal
 * page, the input once it is enabled (it is disabled while hack, backdoor or
 * analyze runs), the value, then Enter. `;` chains several commands; an
 * action such as `backdoor` must come last.
 */
export async function typeCommand(ns: NS, line: string): Promise<void> {
  await goTo(ns, "Terminal");
  const input = await waitFor(ns, "the terminal input", () => {
    const el = document.getElementById("terminal-input");
    return el instanceof HTMLInputElement && !el.disabled ? el : undefined;
  });
  setInput(input, line);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}
