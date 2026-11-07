// Leave-page prompt. After the first keypress this harness calls NOTHING that evaluates in the page,
// because Playwright's evaluate carries a user gesture and would spoil the no-activation stage.
import { startServer, launch, freshSave, editSave, addScripts, openWithSave, gotoGame, humanType, waitFor, sleep } from './lib.mjs';

const { server, base } = await startServer();
const browser = await launch();
const fresh = await freshSave(browser, base);
const lab = editSave(fresh, ({ A }) => {
  A.home.data.maxRam = 256;
  addScripts(A, ['t_unload.js']);
});
const sink = [];
const ctx = await browser.newContext();
const page = await openWithSave(ctx, base, lab, sink);
page.on('dialog', async (d) => {
  sink.push({ at: Date.now(), ev: 'BROWSER-DIALOG', type: d.type(), message: d.message() });
  await d.dismiss(); // "stay on page": a run has no human to accept it
});
page.on('load', () => sink.push({ at: Date.now(), ev: 'page-load' }));
await gotoGame(page, base);
await humanType(page, 'run t_unload.js');
await waitFor(sink, (e) => e.ev === 'stage-C-reached' || e.ev === 'still-alive-after-B', 90000, 'stage C').catch((e) => sink.push({ ev: 'FAILED', text: e.message }));
await sleep(1000);
const t0 = sink.find((e) => e.at)?.at ?? 0;
for (const e of sink) console.log(JSON.stringify({ ...e, at: e.at ? e.at - t0 : undefined }));
await browser.close();
server.close();
