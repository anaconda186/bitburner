// Placeholder boot.js (#42): proves the start command reaches a released
// build. The real boot (manifest, SHA-pinned fetch, spawn) replaces it in #43.
// boot.js must import nothing: the game charges RAM for every imported file.
import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  ns.tprint("boot.js placeholder: the release pipeline works");
}
