// Capped exponential backoff, shared by every retry loop in the run.
// boot.js keeps its own copy (it may import nothing); both are held to the
// same expectations by their tests.

export const BACKOFF_CAP_MS = 30_000;

/** How long to wait after `failures` consecutive failures (1 or more). */
export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_CAP_MS, 1000 * 2 ** Math.max(0, failures - 1));
}
