// The Remote API server against a stand-in for the game's client, which
// answers JSON-RPC the way v3.0.1's Remote.ts does.
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { RemoteApiError, startRemoteApi, type RemoteApi } from "./remote-api.ts";

const files: Record<string, string> = { "sr/state.json": '{"v":1}' };

/** Connects like the game and answers getFile and calculateRam. */
async function fakeGame(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on("message", (data) => {
    const msg = JSON.parse(String(data)) as { id: number; method: string; params: { filename: string } };
    const answer = (x: object) => ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...x }));
    if (msg.method === "getFile") {
      const f = files[msg.params.filename];
      answer(f === undefined ? { error: `File does not exist. Filename: ${msg.params.filename}` } : { result: f });
    } else if (msg.method === "calculateRam") answer({ result: 1.6 });
    else answer({ error: "Unknown message received" });
  });
  await new Promise((ok) => ws.once("open", ok));
  return ws;
}

let api: RemoteApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

describe("startRemoteApi", () => {
  it("waits for the game to connect, then reads files and RAM through it", async () => {
    api = await startRemoteApi();
    expect(api.isConnected()).toBe(false);
    const connected = api.waitForGame(5000);
    await fakeGame(api.port);
    expect(await connected).toBe(true);
    expect(await api.getFile("sr/state.json")).toBe('{"v":1}');
    expect(await api.calculateRam("boot.js")).toBe(1.6);
  });

  it("turns the game's error answer into a RemoteApiError", async () => {
    api = await startRemoteApi();
    await fakeGame(api.port);
    await api.waitForGame(5000);
    await expect(api.getFile("sr/nope.json")).rejects.toThrow(RemoteApiError);
  });

  it("reports no game when none connects in time", async () => {
    api = await startRemoteApi();
    expect(await api.waitForGame(50)).toBe(false);
    await expect(api.getFile("sr/state.json")).rejects.toThrow(/not connected/);
  });

  it("uses the newest connection after the game reconnects (a page reload)", async () => {
    api = await startRemoteApi();
    const first = await fakeGame(api.port);
    await api.waitForGame(5000);
    const before = api.connections();
    expect(await api.waitForGame(50, before)).toBe(false);
    first.close();
    await new Promise((ok) => first.once("close", ok));
    await fakeGame(api.port);
    expect(await api.waitForGame(5000, before)).toBe(true);
    expect(await api.getFile("sr/state.json")).toBe('{"v":1}');
  });

  it("listens on the port asked for, so a game's saved settings keep working", async () => {
    const free = await startRemoteApi();
    const port = free.port;
    await free.close();
    api = await startRemoteApi("127.0.0.1", port);
    expect(api.port).toBe(port);
    await fakeGame(port);
    expect(await api.waitForGame(5000)).toBe(true);
  });
});
