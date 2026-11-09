// Splits (#49): what the conductor records and prints at each milestone, and
// the summary at the finish line. Pure: no `ns` here. The record itself (the
// split's fields, reloads, builds, gross and net) is in state.ts.
//
// RAM: the conductor imports this file, so keep NS function names out of it.
// The stats key "hack" is only ever spelled as a string or a type here.
import type { Snapshot } from "./decide.ts";
import { sleevesPossible } from "./helpers.ts";
import { SPINE } from "./milestones.ts";
import { lostMs, reachedMilestones, splitTime, type RunState, type Split, type SplitStats } from "./state.ts";

/** Every stat unknown: no probe has read them yet. */
const NO_STATS = Object.fromEntries(["hack", "money", "M", "homeRam"].map((k) => [k, null])) as Omit<SplitStats, "sleeves">;

/**
 * A split's stats from the snapshot's latest probe readings: hacking, money,
 * M and home RAM from the stats probe, the sleeves from the sleeves probe
 * (0 where sleeves can't exist). Null where nothing has been read.
 */
export function splitStats(snapshot: Snapshot): SplitStats {
  const { stats, route, sleeves } = snapshot.probes;
  // Only the split's own fields: the probe also reads the city and the casino (#56).
  const v = stats?.ok ? stats.value : undefined;
  const base = v === undefined ? NO_STATS : { "hack": v["hack"], money: v.money, M: v.M, homeRam: v.homeRam };
  let count: number | null = null;
  if (route?.ok) count = !sleevesPossible(route.value) ? 0 : sleeves?.ok ? sleeves.value.count : null;
  return { ...base, sleeves: count };
}

/** `[<d>d ]H:MM:SS`, rounded down to the second. */
export function formatDuration(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const days = Math.floor(s / 86_400);
  const clock = `${Math.floor((s % 86_400) / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

const pad = (n: number) => String(n).padStart(2, "0");

const splitsOf = (state: RunState) => state.splits as readonly Split[];

/**
 * The terminal line for the last split: its name, the time since the start
 * and the delta from the split before it (both gross), plus the net time once
 * reloads have cost the run anything.
 */
export function splitLine(state: RunState): string {
  const splits = splitsOf(state);
  const last = splits.at(-1);
  if (last === undefined) return "conductor: no split yet";
  const before = splits.at(-2)?.ms ?? 0;
  const { grossMs, netMs } = splitTime(last);
  const net = last.lostMs > 0 ? `, net ${formatDuration(netMs)}` : "";
  return `conductor: split ${last.milestone} ${formatDuration(grossMs)} (+${formatDuration(grossMs - before)})${net}`;
}

/** Every destruction of the BitNode order is recorded: the finish line. */
export function runFinished(state: RunState): boolean {
  const reached = reachedMilestones(state);
  return SPINE.every((m) => reached.includes(m.name));
}

/** The lines printed at the finish line, timed by the last split. */
export function finishSummary(state: RunState): string[] {
  const splits = splitsOf(state);
  const last = splits.at(-1);
  if (last === undefined) return [];
  const { grossMs, netMs } = splitTime(last);
  return [
    `conductor: finish line in ${formatDuration(grossMs)} (net ${formatDuration(netMs)})`,
    `conductor: ${splits.length} milestones, ${state.reloads.length} reloads losing ${formatDuration(lostMs(state))}, ` +
      `${state.installs} installs, ${state.builds.length + 1} builds`,
  ];
}
