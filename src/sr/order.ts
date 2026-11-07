// The BitNode order (GLOSSARY.md): the fixed sequence of the 45 destructions
// from the fresh save to the finish line, as one table. Pure: no `ns` here.
// Spec #41, "The decision core", from decisions #9 and #35.

/** How a BitNode is destroyed (GLOSSARY.md, "Finish"). */
export type Finish = "hacking" | "blackops";

/** One destruction: BitNode `bn` destroyed to reach its Source-File at `level`. */
export type OrderEntry = { readonly bn: number; readonly level: number; readonly finish: Finish };

/** The spec's finish per BitNode. */
const FINISH: Readonly<Record<number, Finish>> = {
  1: "hacking", 4: "hacking", 5: "hacking", 8: "hacking", 11: "hacking", 12: "hacking",
  2: "blackops", 3: "blackops", 6: "blackops", 7: "blackops", 9: "blackops", 10: "blackops",
  13: "blackops", 14: "blackops", 15: "blackops",
};

/** `[bn, first level, last level]`, run in this order. */
const STRETCHES: readonly (readonly [number, number, number])[] = [
  // Fixed front.
  [1, 1, 1], [4, 1, 3],
  // Enabler tier.
  [5, 1, 1], [1, 2, 3], [6, 1, 1], [10, 1, 3], [7, 1, 3], [9, 1, 2],
  // Draft back.
  [5, 2, 3], [12, 1, 3], [6, 2, 3], [2, 1, 3], [3, 1, 3], [9, 3, 3], [8, 1, 3], [11, 1, 3],
  [13, 1, 3], [14, 1, 3], [15, 1, 3],
];

export const BITNODE_ORDER: readonly OrderEntry[] = STRETCHES.flatMap(([bn, from, to]) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ bn, level: from + i, finish: FINISH[bn] as Finish })),
);

/**
 * What the game says about where the run is (`getResetInfo`'s `currentNode`
 * and `ownedSF`), as plain JSON so it can come back from a helper.
 */
export type RouteFacts = {
  /** The BitNode the player is in now. */
  readonly currentNode: number;
  /** Active level per owned Source-File; a missing key means not owned. */
  readonly ownedSF: Readonly<Record<number, number>>;
};

/** Where the run is in the BitNode order. Never stored: read from the game every time. */
export type Position = {
  /**
   * The destruction now being played: the current BitNode, for the level
   * above the one owned. It may be outside the order (an SF already at 3).
   */
  readonly playing: OrderEntry;
  /** Index of `playing` in BITNODE_ORDER, or -1 when it isn't in the order. */
  readonly index: number;
  /** `playing` is the first destruction of the order not yet owned. */
  readonly onRoute: boolean;
  /**
   * The BitNode to enter when this one is destroyed: the first destruction of
   * the order not owned once `playing` is. Null when that is the finish line.
   */
  readonly next: OrderEntry | null;
  /** Every destruction of the order is owned: the finish line. */
  readonly finished: boolean;
};

const levelOf = (owned: Readonly<Record<number, number>>, bn: number): number => owned[bn] ?? 0;

/** The first destruction of the order not yet owned, or null at the finish line. */
function firstUnowned(owned: Readonly<Record<number, number>>): OrderEntry | null {
  return BITNODE_ORDER.find((e) => levelOf(owned, e.bn) < e.level) ?? null;
}

export function position(facts: RouteFacts): Position {
  const bn = facts.currentNode;
  const level = levelOf(facts.ownedSF, bn) + 1;
  const index = BITNODE_ORDER.findIndex((e) => e.bn === bn && e.level === level);
  const playing = BITNODE_ORDER[index] ?? { bn, level, finish: FINISH[bn] ?? "hacking" };
  const due = firstUnowned(facts.ownedSF);
  return {
    playing,
    index,
    onRoute: due === playing,
    next: firstUnowned({ ...facts.ownedSF, [bn]: level }),
    finished: due === null,
  };
}
