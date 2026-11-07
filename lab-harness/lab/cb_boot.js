// Stands in for boot.js on the casino route: live check, then look for the casino before any fetch.
const CASINO = 'cb_casino.js';
const COND = 'cb_cond.js';
const log = (o) => console.log('[LAB] ' + JSON.stringify(o));
export async function main(ns) {
  const t = Date.now();
  // First line: is a restored casino already visible, on home or a cloud server?
  const hosts = ['home', ...ns.scan('home').filter((h) => h.startsWith('casino-'))];
  const casinoOn = hosts.find((h) => ns.isRunning(CASINO, h));
  if (ns.isRunning(COND, 'home')) {
    log({ ev: 'boot', t, outcome: 'already-live', casinoOn: casinoOn || null, args: ns.args });
    return;
  }
  log({ ev: 'boot', t, outcome: casinoOn ? 'skip-fetch' : 'would-fetch', casinoOn: casinoOn || null, args: ns.args });
  ns.run(COND, { temporary: true });
}
