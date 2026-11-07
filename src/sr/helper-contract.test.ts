import { describe, expect, test } from "vitest";
import { readReply } from "./helper-contract.ts";
import { decodeHelperArgs, settle } from "./h/serve.ts";

describe("readReply: what the conductor accepts off a reply port", () => {
  test("passes a success with its value and a failure with its error", () => {
    expect(readReply({ ok: true, value: { servers: [] } })).toEqual({ ok: true, value: { servers: [] } });
    expect(readReply({ ok: true, value: null })).toEqual({ ok: true, value: null });
    expect(readReply({ ok: false, error: "no money" })).toEqual({ ok: false, error: "no money" });
  });

  test("turns anything else into a failure, never a throw", () => {
    for (const raw of ["NULL PORT DATA", 42, null, { ok: true }, { ok: false }, { ok: "yes", value: 1 }]) {
      const r = readReply(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^malformed reply/);
    }
  });
});

describe("decodeHelperArgs: the helper's two arguments", () => {
  test("parses the JSON argument and the reply port", () => {
    expect(decodeHelperArgs(['{"host":"n00dles"}', 1_000_007])).toEqual({
      ok: true,
      arg: { host: "n00dles" },
      port: 1_000_007,
    });
    expect(decodeHelperArgs(["null", 5])).toEqual({ ok: true, arg: null, port: 5 });
  });

  test("refuses a missing or bad port, so nothing is written to a wrong port", () => {
    for (const args of [["null"], ["null", 0], ["null", 1.5], ["null", "7"]]) {
      expect(decodeHelperArgs(args)).toEqual({ ok: false, port: undefined, error: expect.stringMatching(/port/) });
    }
  });

  test("reports an argument that is not JSON, keeping the port for the reply", () => {
    expect(decodeHelperArgs(["{bad", 9])).toEqual({ ok: false, port: 9, error: expect.stringMatching(/argument/) });
    expect(decodeHelperArgs([7, 9])).toEqual({ ok: false, port: 9, error: expect.stringMatching(/argument/) });
  });
});

describe("settle: one call's outcome as a Reply", () => {
  test("wraps a value, sync or async", async () => {
    expect(await settle(() => 3)).toEqual({ ok: true, value: 3 });
    expect(await settle(async () => ({ a: [1] }))).toEqual({ ok: true, value: { a: [1] } });
  });

  test("turns undefined into null so the reply is always well formed", async () => {
    expect(await settle(() => undefined)).toEqual({ ok: true, value: null });
  });

  test("wraps a throw or a rejection as the error text", async () => {
    expect(await settle(() => { throw new Error("nuke: need 2 ports"); })).toEqual({ ok: false, error: "nuke: need 2 ports" });
    expect(await settle(() => Promise.reject("plain string"))).toEqual({ ok: false, error: "plain string" });
  });
});
