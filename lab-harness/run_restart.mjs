// Which scripts restart by themselves after a reload: normal, --temporary, and the autoexec setting.
import { startServer, launch, freshSave, editSave, addScripts, openWithSave, gotoGame, humanType, sleep } from './lib.mjs';

const { server, base } = await startServer();
const browser = await launch();
const fresh = await freshSave(browser, base);
const cases = [
  { name: 'normal', cmd: 'run t_temp.js normal', autoexec: '' },
  { name: 'temporary', cmd: 'run t_temp.js temp --temporary', autoexec: '' },
  { name: 'autoexec', cmd: null, autoexec: 't_temp.js' },
];
for (const c of cases) {
  const lab = editSave(fresh, ({ A, S }) => {
    A.home.data.maxRam = 64;
    addScripts(A, ['t_temp.js']);
    S.AutoexecScript = c.autoexec;
  });
  const sink = [];
  const ctx = await browser.newContext();
  const page = await openWithSave(ctx, base, lab, sink);
  page.on('dialog', (d) => d.accept());
  await gotoGame(page, base);
  await page.locator('#terminal-input').waitFor({ timeout: 90000 });
  if (c.cmd) await humanType(page, c.cmd);
  await sleep(1500);
  const before = sink.filter((e) => e.ev === 'temp-start').length;
  await page.evaluate(() => document.querySelector('[aria-label="save game"]').click());
  await sleep(1000);
  await page.reload({ waitUntil: 'load' });
  await sleep(4000);
  const starts = sink.filter((e) => e.ev === 'temp-start');
  console.log(JSON.stringify({ case: c.name, startsBeforeReload: before, startsAfterReload: starts.length - before, last: starts[starts.length - 1] && { args: starts[starts.length - 1].args, temporary: starts[starts.length - 1].temporary } }));
  await ctx.close();
}
await browser.close();
server.close();
