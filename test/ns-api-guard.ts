// Proves the typecheck is wired to the real Netscript API. Each call below is
// a misuse that must be a type error. If `@ns` ever stops resolving to the
// game's NetscriptDefinitions.d.ts, or degrades to `any`, an
// `@ts-expect-error` goes unused and `npm run typecheck` fails.
import type { NS } from "@ns";

export async function misuse(ns: NS): Promise<void> {
  // @ts-expect-error hack takes a hostname string, not a number
  await ns.hack(42);
  // @ts-expect-error there is no ns.hackk
  ns.hackk("n00dles");
  // @ts-expect-error spawn's second argument is a thread count or options, not a string
  ns.spawn("sr/x.js", "fast");
}
