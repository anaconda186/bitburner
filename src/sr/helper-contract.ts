// The helper contract: what a helper script receives and what it writes back.
// Pure and ns-free, shared by the conductor side (`helper-calls.ts`) and the
// unit tests. The helper side (`h/serve.ts`) imports only its types, so a
// helper copied to another server needs no file but itself and `h/serve.js`.
//
// A helper is a one-purpose entry script under `sr/h/`. It is launched with
// `exec` (1 thread, temporary) and two arguments:
//   args[0]  its argument as a JSON string ("null" when it takes none)
//   args[1]  the reply port number
// It makes its one call, writes exactly one Reply object to the port and exits.
// If it dies first (an error, a kill) it still writes a failed Reply from its
// `atExit` hook. Helpers never touch the state file and never launch scripts.

/** Plain JSON data: what helper arguments and helper values are made of. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** What a helper writes to its reply port: its one call's value, or why it failed. */
export type Reply<T = Json> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/**
 * Reply ports are drawn from this range, one fresh port per launch. Ports
 * below it are free for long-lived workers (the money engine, the trader).
 */
export const REPLY_PORT_BASE = 1_000_000;
export const REPLY_PORT_SPAN = 1_000_000;

/**
 * Checks what came off a reply port. Anything that is not a well-formed Reply
 * becomes a failed one, so the conductor never trusts a malformed value.
 */
export function readReply(raw: unknown): Reply {
  if (typeof raw === "object" && raw !== null && "ok" in raw) {
    const r = raw as { ok: unknown; value?: unknown; error?: unknown };
    if (r.ok === true && "value" in r) return { ok: true, value: r.value as Json };
    if (r.ok === false && typeof r.error === "string") return { ok: false, error: r.error };
  }
  return { ok: false, error: `malformed reply: ${String(JSON.stringify(raw)).slice(0, 200)}` };
}
