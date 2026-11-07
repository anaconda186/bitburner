// atExit timer across a UI-driven install and a UI-driven BitNode entry.
import { startServer, launch, freshSave, editSave, addScripts, openWithSave, gotoGame, humanType, waitFor, readSaveBytes, exploits, sleep, OUT } from './lib.mjs';
import path from 'node:path';

const { server, base } = await startServer();
const browser = await launch();
const fresh = await freshSave(browser, base);

const installSave = editSave(fresh, ({ P, A }) => {
  P.queuedAugmentations = [{ level: 1, name: 'Neurotrainer I' }];
  A.home.data.maxRam = 256;
  addScripts(A, ['t_reset.js', 'boot_lab.js']);
});
const bitnodeSave = editSave(fresh, ({ P, A }) => {
  P.augmentations = [{ level: 1, name: 'The Red Pill' }];
  P.skills.hacking = 3684;
  P.exp.hacking = 1e50; // the level is recomputed from exp: 32*ln(exp+534.6)-200
  P.money = 1e9;
  A.home.data.maxRam = 256;
  const wd = A['w0r1d_d43m0n'].data;
  wd.hasAdminRights = true;
  wd.hackDifficulty = 1;
  wd.serversOnNetwork = ['The-Cave'];
  A['The-Cave'].data.serversOnNetwork.push('w0r1d_d43m0n');
  addScripts(A, ['t_reset.js', 'boot_lab.js']);
});

for (const [mode, bytes] of [['--install', installSave], ['--bitnode', bitnodeSave]]) {
  const sink = [];
  const ctx = await browser.newContext();
  const page = await openWithSave(ctx, base, bytes, sink);
  page.on('dialog', (d) => { sink.push({ ev: 'browser-dialog', type: d.type() }); d.accept(); });
  await gotoGame(page, base);
  await page.locator('#terminal-input').waitFor({ timeout: 90000 });
  await humanType(page, 'run t_reset.js ' + mode);
  await waitFor(sink, (e) => e.ev === 'boot-ran' || e.ev === 'timer-gave-up', 200000, 'boot-ran').catch((e) => sink.push({ ev: 'FAILED', text: e.message }));
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, `reset${mode}.png`) });
  await page.locator('[aria-label="save game"]').click({ force: true, timeout: 3000 }).catch(() => {});
  await sleep(1000);
  const save = await readSaveBytes(page);
  console.log(`\n=== ${mode} ===`);
  const t0 = sink.find((e) => e.at)?.at ?? 0;
  for (const e of sink) console.log(JSON.stringify({ ...e, at: e.at ? e.at - t0 : undefined }));
  console.log('exploits:', exploits(save));
  await ctx.close();
}
await browser.close();
server.close();
