// Full casino run from about $300k to the $10b cap. Usage: node run_casino.mjs <label> [startMoney] [--temporary]
import { startServer, launch, freshSave, editSave, addScripts, openWithSave, gotoGame, humanType, readSaveBytes, exploits, sleep, OUT } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const label = process.argv[2] || 'run';
const startMoney = Number(process.argv[3] || 300e3);
const LIMIT_MS = 3 * 3600 * 1000;
const logFile = path.join(OUT, `casino-${label}.jsonl`);
fs.writeFileSync(logFile, '');

const { server, base } = await startServer();
const browser = await launch();
const fresh = await freshSave(browser, base);
const lab = editSave(fresh, ({ P, A }) => {
  P.money = startMoney;
  P.city = 'Aevum';
  A.home.data.maxRam = 128;
  addScripts(A, ['casino.js']);
});
const sink = [];
sink.onEvent = (e) => fs.appendFileSync(logFile, JSON.stringify(e) + '\n');
const ctx = await browser.newContext();
const page = await openWithSave(ctx, base, lab, sink);
const dialogs = [];
page.on('dialog', async (d) => { dialogs.push({ at: Date.now(), type: d.type() }); await d.dismiss(); });
let loads = 0;
page.on('load', () => { loads++; });
await gotoGame(page, base);
await page.locator('#terminal-input').waitFor({ timeout: 90000 });
const tStart = Date.now();
await humanType(page, 'run casino.js');

let last = Date.now();
let lastCount = 0;
for (;;) {
  await sleep(2000);
  if (sink.some((e) => e.ev === 'done' || e.ev === 'broke')) break;
  if (sink.length !== lastCount) { lastCount = sink.length; last = Date.now(); }
  if (Date.now() - last > 180000) { console.log('STALLED; last events', JSON.stringify(sink.slice(-5))); break; }
  if (Date.now() - tStart > LIMIT_MS) { console.log('TIME LIMIT'); break; }
}
const hands = sink.filter((e) => e.ev === 'hand');
const reloads = sink.filter((e) => e.ev === 'reload');
const starts = sink.filter((e) => e.ev === 'start');
const tables = sink.filter((e) => e.ev === 'at-table');
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null; };
// reload gap: the reload call until the script is back at the table
const gaps = [];
for (const r of reloads) {
  const next = tables.find((t) => t.at > r.at);
  if (next) gaps.push(next.at - r.at);
}
const startGaps = [];
for (const r of reloads) {
  const next = starts.find((t) => t.at > r.at);
  if (next) startGaps.push(next.at - r.at);
}
// Did each reload restore the money from before the lost hand?
const restores = [];
for (const r of reloads) {
  const lost = [...hands].reverse().find((h) => h.at <= r.at);
  const next = starts.find((t) => t.at > r.at);
  if (lost && next) restores.push({ want: lost.before, got: next.money, ok: next.money >= lost.before });
}
const summary = {
  label, startMoney,
  totalSeconds: (Date.now() - tStart) / 1000,
  hands: hands.length, reloads: reloads.length, pageLoads: loads,
  results: hands.reduce((m, h) => { m[h.result] = (m[h.result] || 0) + 1; return m; }, {}),
  saveMs: { p50: pct(hands.map((h) => h.saveMs), 0.5), p95: pct(hands.map((h) => h.saveMs), 0.95), max: pct(hands.map((h) => h.saveMs), 1) },
  handMs: { p50: pct(hands.map((h) => h.handMs), 0.5), max: pct(hands.map((h) => h.handMs), 1) },
  reloadToScriptMs: { p50: pct(startGaps, 0.5), p95: pct(startGaps, 0.95), max: pct(startGaps, 1) },
  reloadToTableMs: { p50: pct(gaps, 0.5), p95: pct(gaps, 0.95), max: pct(gaps, 1) },
  restoresOk: restores.filter((r) => r.ok).length, restoresBad: restores.filter((r) => !r.ok),
  scriptRestarts: starts.length,
  firstStart: starts[0],
  handlerSeenOnRestart: starts.slice(1).filter((s) => s.hadHandler).length,
  browserDialogs: dialogs.length,
  capEvent: sink.find((e) => e.ev === 'cap'),
  doneEvent: sink.find((e) => e.ev === 'done'),
  errors: sink.filter((e) => e.ev === 'console-error' || e.ev === 'pageerror').slice(0, 5),
};
await sleep(500);
const save = await readSaveBytes(page).catch(() => null);
if (save) { summary.saveBytes = save.length; summary.exploits = exploits(save); }
await page.screenshot({ path: path.join(OUT, `casino-${label}.png`) }).catch(() => {});
fs.writeFileSync(path.join(OUT, `casino-${label}-summary.json`), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
server.close();
