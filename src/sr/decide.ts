// The decision core (seam A): a plain snapshot in, plain actions out. No `ns`
// here, ever: the conductor builds the snapshot and carries out the actions.
// For now the snapshot holds only the clock and there are no actions, so the
// conductor is a heartbeat. Later tickets grow both types.

/** What the conductor read from the game this iteration. */
export type Snapshot = {
  /** Wall-clock time the snapshot was taken (`Date.now()`). */
  readonly nowMs: number;
};

/** Something for the conductor to do. No kinds exist yet. */
export type Action = never;

export function decide(_snapshot: Snapshot): readonly Action[] {
  return [];
}
