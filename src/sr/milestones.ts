// Milestones (GLOSSARY.md): a typed registry of a name plus a test on the
// snapshot. Each test is checked on its own, and a milestone is recorded the
// first time its test passes. The spine is one `bn<N>.<L>` per destruction of
// the BitNode order; plans add named extras scoped to their BitNode. Pure: no
// `ns` here. The conductor records what `milestonesReached` returns.
//
// RAM: the conductor imports this file, so keep NS function names out of it.
import { capReached, readCasinoNews } from "./blackjack.ts";
import type { Snapshot } from "./decide.ts";
import { BITNODE_ORDER, position, type RouteFacts } from "./order.ts";

/** The BitNode a plan's extra belongs to; without `level`, any level of it. */
export type MilestoneScope = { readonly bn: number; readonly level?: number };

export type Milestone = {
  readonly name: string;
  /** Checked only while the run plays this BitNode. Spine milestones have none. */
  readonly scope?: MilestoneScope;
  /** Passes once the milestone is reached. Only called once the route is known. */
  readonly test: (snapshot: Snapshot, route: RouteFacts) => boolean;
};

/** `bn<N>.<L>`, reached once SF N is at level L: just after BitNode N is destroyed. */
export const SPINE: readonly Milestone[] = BITNODE_ORDER.map(({ bn, level }) => ({
  name: `bn${bn}.${level}`,
  test: (_s: Snapshot, route: RouteFacts) => (route.ownedSF[bn] ?? 0) >= level,
}));

/**
 * A plan's extra milestone, named `bn<N>.<L>:<suffix>` when scoped to one
 * level, or `bn<N>.<suffix>` when scoped to any level of BitNode N.
 */
export function scoped(
  bn: number,
  level: number | undefined,
  suffix: string,
  test: (snapshot: Snapshot, route: RouteFacts) => boolean,
): Milestone {
  return level === undefined
    ? { name: `bn${bn}.${suffix}`, scope: { bn }, test }
    : { name: `bn${bn}.${level}:${suffix}`, scope: { bn, level }, test };
}

/** Joins milestone lists into one registry, in order. Throws on a name used twice. */
export function registry(...groups: readonly (readonly Milestone[])[]): readonly Milestone[] {
  const all = groups.flat();
  const names = new Set<string>();
  for (const { name } of all) {
    if (names.has(name)) throw new Error(`milestone ${name} is registered twice`);
    names.add(name);
  }
  return all;
}

/** BN1.1's extras (spec #41 "BN1.1 plan"), in the order the plan reaches them. */
export const BN1_1: readonly Milestone[] = [
  // #54: the driver is up on its cloud server and has reported.
  scoped(1, 1, "driver", (s) => s.workers.driver?.running === true && s.workers.driver.report !== undefined),
  // #56: the casino's first payout, its $10b cap since the install: its own
  // report says so at once, or after a reload the stats probe's reading.
  scoped(1, 1, "casino", casinoPaidOut),
];

function casinoPaidOut(s: Snapshot): boolean {
  const news = readCasinoNews(s.workers.casino?.report?.value);
  const stats = s.probes.stats;
  return news?.phase === "capped" || (stats?.ok === true && capReached(stats.value.casinoWinnings));
}

/** Every milestone of the run. Plans add their extras here as they land. */
export const MILESTONES: readonly Milestone[] = registry(SPINE, BN1_1);

/**
 * The milestones whose test passes now and that are not in `reached` yet, in
 * registry order. Nothing is due until the route probe has read the game.
 */
export function milestonesReached(
  milestones: readonly Milestone[],
  snapshot: Snapshot,
  reached: readonly string[],
): string[] {
  const reading = snapshot.probes.route;
  if (reading === undefined || !reading.ok) return [];
  const route = reading.value;
  const playing = position(route).playing;
  const inScope = (scope: MilestoneScope | undefined) =>
    scope === undefined || (scope.bn === playing.bn && (scope.level === undefined || scope.level === playing.level));
  return milestones
    .filter((m) => !reached.includes(m.name) && inScope(m.scope) && m.test(snapshot, route))
    .map((m) => m.name);
}
