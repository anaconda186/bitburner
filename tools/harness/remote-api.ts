// Our end of the game's Remote API (v3.0.1 src/RemoteFileAPI/). The game is
// the WebSocket client and we are the server: it connects to
// ws://<RemoteFileApiAddress>:<RemoteFileApiPort> from its settings, and we
// send it JSON-RPC 2.0 requests ({jsonrpc, id, method, params}); it answers
// {jsonrpc, id, result} or {jsonrpc, id, error: string}. There is no method to
// run a script, so scripts are started by typing in the terminal.
//
// The game connects again after each page load (or after the reconnection
// delay set in its options), so the newest connection is always the one used.

import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

/** The game answered with an error (a missing file, an invalid script...). */
export class RemoteApiError extends Error {
  override name = "RemoteApiError";
}

export interface RemoteApi {
  /** The port to enter on the game's Options → Remote API page. */
  readonly port: number;
  isConnected(): boolean;
  /** How many times the game has connected so far. */
  connections(): number;
  /**
   * Resolves true once the game is connected on a connection later than the
   * first `since` (default 0: any), false after `timeoutMs`. After a reload,
   * pass the count from before it, so the old socket can't count.
   */
  waitForGame(timeoutMs: number, since?: number): Promise<boolean>;
  call(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  /** A file's text. Throws RemoteApiError if it isn't there. */
  getFile(filename: string, server?: string): Promise<string>;
  /** The game's own RAM figure for a script on `server`, in GB. */
  calculateRam(filename: string, server?: string): Promise<number>;
  getFileNames(server?: string): Promise<string[]>;
  /** Writes a file into the game (created or replaced). Throws RemoteApiError if the game refuses it. */
  pushFile(filename: string, content: string, server?: string): Promise<void>;
  /** The game's save as it would export it: gzip bytes in Chromium. */
  getSaveFile(): Promise<Uint8Array>;
  close(): Promise<void>;
}

interface Pending {
  socket: WebSocket;
  resolve(v: unknown): void;
  reject(e: Error): void;
  timer: NodeJS.Timeout;
}

/** Listens on `host`, on `listenPort` (0, the default: a free one). */
export async function startRemoteApi(host = "127.0.0.1", listenPort = 0): Promise<RemoteApi> {
  const wss = new WebSocketServer({ host, port: listenPort });
  await new Promise<void>((ok, fail) => {
    wss.once("listening", ok);
    wss.once("error", fail);
  });
  const port = (wss.address() as AddressInfo).port;

  let current: WebSocket | null = null;
  let count = 0;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const waiters = new Set<() => void>();

  wss.on("connection", (socket) => {
    current = socket;
    count++;
    // A waiter that still isn't satisfied puts itself back.
    const woken = [...waiters];
    waiters.clear();
    for (const w of woken) w();
    socket.on("message", (data) => {
      let msg: { id?: unknown; result?: unknown; error?: unknown };
      try {
        msg = JSON.parse(String(data)) as typeof msg;
      } catch {
        return;
      }
      const p = typeof msg.id === "number" ? pending.get(msg.id) : undefined;
      if (!p) return;
      pending.delete(msg.id as number);
      clearTimeout(p.timer);
      if (msg.error !== undefined) p.reject(new RemoteApiError(String(msg.error)));
      else p.resolve(msg.result);
    });
    socket.on("close", () => {
      if (current === socket) current = null;
      for (const [id, p] of pending) {
        if (p.socket !== socket) continue;
        pending.delete(id);
        clearTimeout(p.timer);
        p.reject(new Error("Remote API: the game disconnected"));
      }
    });
  });

  const isConnected = () => current !== null && current.readyState === current.OPEN;

  const call: RemoteApi["call"] = (method, params, timeoutMs = 15_000) =>
    new Promise((resolve, reject) => {
      const socket = current;
      if (socket === null || !isConnected()) return reject(new Error("Remote API: the game is not connected"));
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Remote API: no answer to ${method} within ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { socket, resolve, reject, timer });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }));
    });

  return {
    port,
    isConnected,
    connections: () => count,
    waitForGame(timeoutMs, since = 0) {
      const ready = () => count > since && isConnected();
      if (ready()) return Promise.resolve(true);
      return new Promise((ok) => {
        const done = () => {
          if (!ready()) return void waiters.add(done);
          clearTimeout(timer);
          ok(true);
        };
        const timer = setTimeout(() => {
          waiters.delete(done);
          ok(false);
        }, timeoutMs);
        waiters.add(done);
      });
    },
    call,
    async getFile(filename, server = "home") {
      return String(await call("getFile", { filename, server }));
    },
    async calculateRam(filename, server = "home") {
      const r = await call("calculateRam", { filename, server });
      if (typeof r !== "number") throw new RemoteApiError(`calculateRam answered ${JSON.stringify(r)}`);
      return r;
    },
    async getFileNames(server = "home") {
      return (await call("getFileNames", { server })) as string[];
    },
    async pushFile(filename, content, server = "home") {
      await call("pushFile", { filename, content, server });
    },
    async getSaveFile() {
      // v3.0.1 MessageHandlers.ts: {identifier, binary, save}; a binary save
      // comes one char per byte, a text one (no CompressionStream) as base64.
      const r = (await call("getSaveFile", undefined, 60_000)) as { binary?: unknown; save?: unknown };
      if (typeof r?.save !== "string") throw new RemoteApiError(`getSaveFile answered ${JSON.stringify(r)?.slice(0, 200)}`);
      if (r.binary !== true) throw new RemoteApiError("getSaveFile: the game gave a text save, not gzip (no CompressionStream?)");
      return Uint8Array.from(r.save, (c) => c.charCodeAt(0));
    },
    async close() {
      for (const s of wss.clients) s.terminate();
      await new Promise<void>((ok) => wss.close(() => ok()));
    },
  };
}
