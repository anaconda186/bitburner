// Throwaway harness for "Do the BN1 UI techniques work in a live v3.0.1 build?"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GAME = process.env.LAB_GAME || path.join(here, 'game');
export const LAB = path.join(here, 'lab');
export const OUT = path.join(here, 'out');
fs.mkdirSync(OUT, { recursive: true });

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.map': 'application/json',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

export function startServer() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (u === '/blank.html') {
        r.writeHead(200, { 'content-type': 'text/html' });
        return r.end('<!doctype html><title>blank</title>');
      }
      const p = path.join(GAME, u === '/' ? 'index.html' : u);
      fs.readFile(p, (e, b) => {
        if (e) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' });
        r.end(b);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ server: s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

export const launch = async (o = {}) => { const b = await chromium.launch({ ...(process.env.LAB_EXE ? { executablePath: process.env.LAB_EXE } : { channel: process.env.LAB_CHANNEL || 'chromium' }), headless: true, ...o }); console.log('browser', b.browserType().name(), b.version()); return b; };

const OPEN_DB = `new Promise((res, rej) => {
  const q = indexedDB.open('bitburnerSave', 2);
  q.onupgradeneeded = () => q.result.createObjectStore('savestring');
  q.onsuccess = () => res(q.result);
  q.onerror = () => rej(q.error);
})`;

// NOTE: page.evaluate is sent with a user gesture, so it must not be used in any
// test that depends on the page having NO user activation.
export async function readSaveBytes(page) {
  const b64 = await page.evaluate(async (openDb) => {
    const db = await eval(openDb);
    const v = await new Promise((res, rej) => {
      const g = db.transaction('savestring').objectStore('savestring').get('save');
      g.onsuccess = () => res(g.result);
      g.onerror = () => rej(g.error);
    });
    db.close();
    if (!v) return null;
    if (typeof v === 'string') return 'S' + v;
    let s = '';
    const u = new Uint8Array(v);
    for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
    return 'B' + btoa(s);
  }, OPEN_DB);
  if (!b64) return null;
  return b64[0] === 'B' ? Buffer.from(b64.slice(1), 'base64') : Buffer.from(b64.slice(1), 'utf8');
}

export const decode = (buf) => JSON.parse(zlib.gunzipSync(buf).toString());
export const encode = (o) => zlib.gzipSync(Buffer.from(JSON.stringify(o)));
export const field = (o, k) => JSON.parse(o.data[k]);
export const setField = (o, k, v) => { o.data[k] = JSON.stringify(v); };
export const player = (o) => field(o, 'PlayerSave').data;
export const exploits = (buf) => player(decode(buf)).exploits;

export function editSave(buf, fn) {
  const o = decode(buf);
  const P = field(o, 'PlayerSave');
  const A = field(o, 'AllServersSave');
  const S = field(o, 'SettingsSave');
  fn({ P: P.data, A, S, o });
  setField(o, 'PlayerSave', P);
  setField(o, 'AllServersSave', A);
  setField(o, 'SettingsSave', S);
  return encode(o);
}

export function addScripts(A, files) {
  const m = A.home.data.scripts;
  for (const f of files) {
    const code = fs.readFileSync(path.join(LAB, f), 'utf8');
    m.data.push([f, { ctor: 'Script', data: { code, filename: f, server: 'home' } }]);
  }
}

export function attachLogs(page, sink) {
  page.on('console', (m) => {
    const x = m.text();
    if (x.startsWith('[LAB] ')) {
      const e = { at: Date.now(), ...JSON.parse(x.slice(6)) };
      sink.push(e);
      if (sink.onEvent) sink.onEvent(e);
    } else if (m.type() === 'error') {
      sink.push({ at: Date.now(), ev: 'console-error', text: x.slice(0, 300) });
    }
  });
  page.on('pageerror', (e) => sink.push({ at: Date.now(), ev: 'pageerror', text: String(e).slice(0, 300) }));
}

export async function openWithSave(ctx, base, bytes, sink) {
  const page = await ctx.newPage();
  attachLogs(page, sink);
  await page.goto(base + '/blank.html');
  await page.evaluate(async ([openDb, b64]) => {
    const db = await eval(openDb);
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await new Promise((res, rej) => {
      const t = db.transaction('savestring', 'readwrite');
      t.objectStore('savestring').put(bin, 'save');
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
    db.close();
  }, [OPEN_DB, bytes.toString('base64')]);
  return page;
}

export const gotoGame = (page, base) => page.goto(base + '/index.html', { waitUntil: 'load' });

// A real, trusted keypress sequence: this is what the human's start command looks like.
export async function humanType(page, cmd) {
  const i = page.locator('#terminal-input');
  await i.waitFor({ timeout: 90000 });
  await i.focus();
  await page.keyboard.type(cmd);
  await page.keyboard.press('Enter');
}

export function waitFor(sink, pred, ms, label = 'event') {
  return new Promise((res, rej) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const hit = sink.find(pred);
      if (hit) { clearInterval(iv); res(hit); }
      else if (Date.now() - start > ms) {
        clearInterval(iv);
        rej(new Error('timeout waiting for ' + label + '; last: ' + JSON.stringify(sink.slice(-6))));
      }
    }, 50);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function freshSave(browser, base) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + '/index.html');
  await page.getByRole('button', { name: 'Exit Tutorial' }).click({ timeout: 90000 });
  await page.locator('[aria-label="save game"]').click();
  await sleep(1500);
  const b = await readSaveBytes(page);
  await ctx.close();
  return b;
}
