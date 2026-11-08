// The conductor's record of each long-lived worker: what decide's restart
// rule (start when not running, after a backoff) is fed with.
import { describe, expect, test } from "vitest";
import { afterLaunch, NO_WORKER, observeWorker } from "./workers.ts";

const T = 1_700_000_000_000;

describe("worker records", () => {
  test("a launch that failed counts as a failure; one that worked records the process", () => {
    expect(afterLaunch(NO_WORKER, undefined, T)).toEqual({ failures: 1, lastFailAtMs: T });
    expect(afterLaunch(NO_WORKER, 42, T)).toEqual({ failures: 0, pid: 42, startedAtMs: T });
  });

  test("a worker that dies young adds a failure, so the next launch waits longer", () => {
    const running = afterLaunch({ failures: 2, lastFailAtMs: T - 5_000 }, 42, T);
    expect(observeWorker(running, 42, T + 10_000)).toMatchObject({ failures: 2, pid: 42 });
    expect(observeWorker(running, undefined, T + 10_000)).toEqual({ failures: 3, lastFailAtMs: T + 10_000 });
  });

  test("a worker that ran for a minute is healthy: its failures are forgiven", () => {
    const running = afterLaunch({ failures: 4, lastFailAtMs: T - 30_000 }, 42, T);
    expect(observeWorker(running, 42, T + 60_000)).toMatchObject({ failures: 0, pid: 42 });
    expect(observeWorker(running, undefined, T + 120_000)).toEqual({ failures: 1, lastFailAtMs: T + 120_000 });
  });

  test("adopts a live worker it did not start (a conductor started again by boot)", () => {
    expect(observeWorker(NO_WORKER, 7, T)).toEqual({ failures: 0, pid: 7, startedAtMs: T });
  });

  test("nothing running and nothing launched is no failure", () => {
    expect(observeWorker(NO_WORKER, undefined, T)).toEqual(NO_WORKER);
  });
});
