// The conductor's record of each long-lived worker (WORKERS in `helpers.ts`),
// kept between iterations and lost on a restart, like the rest of its memory.
// Pure: the conductor feeds in what it saw (`isRunning` on the known pids) and
// hands the result to `decide` as a WorkerView. decide starts a worker that
// isn't running once `backoffMs(failures)` has passed since the last failure.

export type WorkerBook = {
  /** The process last seen alive or launched. */
  readonly pid?: number;
  readonly startedAtMs?: number;
  /** Launches in a row that failed or died young. */
  readonly failures: number;
  readonly lastFailAtMs?: number;
};

export const NO_WORKER: WorkerBook = { failures: 0 };

/** A worker alive this long has done its job: its failures are forgiven. */
export const HEALTHY_MS = 60_000;

/** The record after a launch: `pid` when it started, undefined when the launch failed. */
export function afterLaunch(book: WorkerBook, pid: number | undefined, nowMs: number): WorkerBook {
  if (pid === undefined) return { failures: book.failures + 1, lastFailAtMs: nowMs };
  return { ...book, pid, startedAtMs: nowMs };
}

/** The record after a look at the processes: `alivePid` is the worker's live process, if any. */
export function observeWorker(book: WorkerBook, alivePid: number | undefined, nowMs: number): WorkerBook {
  if (alivePid !== undefined) {
    const own = book.pid === alivePid ? book : { ...book, pid: alivePid, startedAtMs: nowMs };
    if (nowMs - (own.startedAtMs ?? nowMs) < HEALTHY_MS || own.failures === 0) return own;
    const { lastFailAtMs: _forgiven, ...rest } = own;
    return { ...rest, failures: 0 };
  }
  if (book.pid === undefined) return book;
  const lived = nowMs - (book.startedAtMs ?? nowMs);
  return { failures: lived >= HEALTHY_MS ? 1 : book.failures + 1, lastFailAtMs: nowMs };
}
