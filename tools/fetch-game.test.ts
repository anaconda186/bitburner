import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { downloadVerified } from "./fetch-game.ts";

const body = "the pinned bytes\n";
// Computed independently: printf 'the pinned bytes\n' | sha256sum
const bodySha = "7adb27e1df1ae95ae21b48d6f4f8f03af8e015180f0f43690821d9428d8c8214";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/file.txt") res.end(body);
    else res.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

describe("downloadVerified", () => {
  test("writes the file when its sha256 matches the pin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fetch-game-"));
    await downloadVerified(`${base}/file.txt`, bodySha, join(dir, "file.txt"));
    expect(await readFile(join(dir, "file.txt"), "utf8")).toBe(body);
  });

  test("refuses a file whose sha256 differs from the pin and leaves nothing behind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fetch-game-"));
    const wrong = "0".repeat(64);
    await expect(downloadVerified(`${base}/file.txt`, wrong, join(dir, "file.txt"))).rejects.toThrow(/sha256/);
    expect(await readdir(dir)).toEqual([]);
  });

  test("refuses a non-200 response", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fetch-game-"));
    await expect(downloadVerified(`${base}/missing`, bodySha, join(dir, "x"))).rejects.toThrow(/404/);
    expect(await readdir(dir)).toEqual([]);
  });
});
