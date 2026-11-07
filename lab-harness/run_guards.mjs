// Faked clicks, terminal recipe, stacked dialogs, RAM cost, and exploit flags.
import { startServer, launch, freshSave, editSave, addScripts, openWithSave, gotoGame, humanType, waitFor, readSaveBytes, exploits, decode, player, sleep, OUT } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { server, base } = await startServer();
const browser = await launch();
const fresh = await freshSave(browser, base);
const lab = editSave(fresh, ({ P, A, S }) => {
  P.money = 1e9; // Aevum faction asks for $40m
  P.city = 'Aevum';
  A.home.data.maxRam = 256;
  S.SuppressFactionInvites = true;
  addScripts(A, ['t_guards.js', 'marker.js']);
});
for (const arg of ['', ' --stack', ' --after-reload']) {
  const sink = [];
  const ctx = await browser.newContext();
  const page = await openWithSave(ctx, base, lab, sink);
  page.on('dialog', (d) => { sink.push({ ev: 'browser-dialog', type: d.type() }); d.accept(); });
  await gotoGame(page, base);
  await page.locator('#terminal-input').waitFor({ timeout: 90000 });
  await sleep(4000); // let the game's invitation check (every 2 s) fire
  if (arg === ' --after-reload') {
    // The invitation must survive save + page reload, and still be joinable from the Factions page.
    await page.evaluate(() => document.querySelector('[aria-label="save game"]').click());
    await sleep(1000);
    const held = player(decode(await readSaveBytes(page)));
    sink.push({ ev: 'save-before-reload', factionInvitations: held.factionInvitations, factions: held.factions });
    await page.reload({ waitUntil: 'load' });
    await page.locator('#terminal-input').waitFor({ timeout: 90000 });
    await sleep(500); // shorter than the check interval matters less than the save holding it
  }
  await humanType(page, 'run t_guards.js' + arg);
  await waitFor(sink, (e) => e.ev === 'done', 60000, 'done').catch((e) => sink.push({ ev: 'FAILED', text: e.message }));
  const save = await readSaveBytes(page);
  console.log(`\n=== t_guards${arg} ===`);
  for (const e of sink) console.log(JSON.stringify({ ...e, at: undefined }));
  console.log('exploits:', exploits(save));
  await page.screenshot({ path: path.join(OUT, `guards${arg.trim() || '-plain'}.png`) });
  await ctx.close();
}
await browser.close();
server.close();
