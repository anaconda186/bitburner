// How the casino comes back after a reload: non-temporary on a cloud server, with stand-ins for boot.js and the conductor.
// node run_casino_back.mjs <label> <autoexec|bare>
//   autoexec: boot on every load, conductor idle during the casino.
//   bare: no autoexec, so only the casino runs between reloads. It hands back to boot on its way out.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, freshSave, editSave, addScripts, openWithSave, gotoGame, humanType, readSaveBytes, exploits, sleep, OUT } from './lib.mjs';

const label = process.argv[2] || 'x';
const mode = process.argv[3] || 'autoexec';
const logFile = path.join(OUT, `back-${label}.jsonl`);
fs.writeFileSync(logFile, '');
const { server, base } = await startServer();
const browser = await launch();
const fresh = await freshSave(browser, base);
const lab = editSave(fresh, ({ P, A, S }) => {
  P.money = 3.52e6 + 300e3; // 64 GB cloud server, then the casino's usual start
  P.city = 'Aevum';
  A.home.data.maxRam = 32; // room for the stand-ins, which aren't sized like the real scripts
  addScripts(A, ['cb_boot.js', 'cb_cond.js', 'cb_casino.js']);
  S.AutoexecScript = mode === 'autoexec' ? 'cb_boot.js' : '';
});
const sink = [];
sink.onEvent = (e) => fs.appendFileSync(logFile, JSON.stringify(e) + '\n');
const ctx = await browser.newContext();
const page = await openWithSave(ctx, base, lab, sink);
const dialogs = [];
page.on('dialog', async (d) => {
  dialogs.push({ at: Date.now(), type: d.type() });
  await d.dismiss();
});
await gotoGame(page, base);
await page.locator('#terminal-input').waitFor({ timeout: 90000 });
const tStart = Date.now();
// With autoexec in the save, the first load has already started boot; typing would race the casino's navigation.
if (mode !== 'autoexec') await humanType(page, 'run cb_boot.js --temporary');

let last = Date.now();
let lastCount = 0;
let stalled = false;
for (;;) {
  await sleep(1000);
  if (sink.some((e) => e.ev === 'cond-resume')) break;
  if (sink.length !== lastCount) {
    lastCount = sink.length;
    last = Date.now();
  }
  if (Date.now() - last > 120000) {
    stalled = true;
    console.log('STALLED', JSON.stringify(sink.slice(-6)));
    break;
  }
}
const totalSeconds = (Date.now() - tStart) / 1000;

const pct = (arr, p) => {
  const a = [...arr].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
};
const stats = (a) => ({ n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), max: pct(a, 1) });
const of = (ev) => sink.filter((e) => e.ev === ev);
const after = (list, at) => list.find((e) => e.at > at);
const reloads = of('reload');
const starts = of('start');
const tables = of('at-table');
const boots = of('boot');
const conds = of('cond-start');
const hands = of('hand');
const gap = (list) => reloads.map((r) => {
  const n = after(list, r.at);
  return n ? n.at - r.at : null;
}).filter((x) => x !== null);
const restores = reloads.map((r) => {
  const lost = [...hands].reverse().find((h) => h.at <= r.at);
  const n = after(starts, r.at);
  return lost && n ? n.money >= lost.before : null;
}).filter((x) => x !== null);

// boot's view of each load that followed a reload
const bootOnReload = reloads.map((r, i) => {
  const nextR = reloads[i + 1];
  return boots.find((b) => b.at > r.at && (!nextR || b.at < nextR.at));
});
const tag = (b) => b.outcome + (b.args && b.args.length ? ':' + b.args[0] : '');
const summary = {
  label, mode, stalled, totalSeconds,
  hands: hands.length,
  reloads: reloads.length,
  hosts: [...new Set(starts.map((s) => s.host))],
  temporaryFlags: [...new Set(starts.map((s) => s.temporary))],
  ram: starts[0] && starts[0].ram,
  scriptRestarts: starts.length,
  reloadToCasinoMs: stats(gap(starts)),
  reloadToTableMs: stats(gap(tables)),
  reloadToBootMs: stats(gap(boots)),
  reloadToConductorMs: stats(gap(conds)),
  restoresOk: restores.filter(Boolean).length,
  restoresBad: restores.filter((x) => !x).length,
  handlerSeenOnRestart: starts.slice(1).filter((s) => s.hadHandler).length,
  browserDialogs: dialogs.length,
  bootOutcomes: boots.reduce((m, b) => {
    m[tag(b)] = (m[tag(b)] || 0) + 1;
    return m;
  }, {}),
  bootOnReloadSawCasino: bootOnReload.filter((b) => b && b.casinoOn).length,
  bootOnReloadMissedCasino: bootOnReload.filter((b) => b && !b.casinoOn).length,
  bootOnReloadAbsent: bootOnReload.filter((b) => !b).length,
  casinoLaunches: of('casino-launched'),
  capEvent: of('cap')[0],
  doneEvent: of('done')[0],
  resumeEvent: of('cond-resume')[0],
  casinoErrors: of('casino-error').slice(0, 5),
  errors: sink.filter((e) => e.ev === 'console-error' || e.ev === 'pageerror').slice(0, 5),
};

// A reload straight after the finish: the last save was made with the casino still running.
if (!stalled) {
  const mark = Date.now();
  const handsBefore = hands.length;
  await page.reload({ waitUntil: 'load' });
  await sleep(6000);
  const since = sink.filter((e) => e.at > mark);
  summary.reloadAfterFinish = {
    casinoRestarted: since.filter((e) => e.ev === 'start').length,
    capAtStart: since.filter((e) => e.ev === 'cap-at-start').length,
    handsPlayed: of('hand').length - handsBefore,
    bootOutcomes: since.filter((e) => e.ev === 'boot').map(tag),
    resumed: since.filter((e) => e.ev === 'cond-resume').length,
  };
}
await sleep(500);
const save = await readSaveBytes(page).catch(() => null);
if (save) {
  summary.saveBytes = save.length;
  summary.exploits = exploits(save);
}
await page.screenshot({ path: path.join(OUT, `back-${label}.png`) }).catch(() => {});
fs.writeFileSync(path.join(OUT, `back-${label}-summary.json`), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
server.close();
