// Stands in for the conductor: launches the casino when decide would, idles while it runs, carries on after.
const CASINO = 'cb_casino.js';
const HOST = 'casino-1';
const log = (o) => console.log('[LAB] ' + JSON.stringify(o));
export async function main(ns) {
  log({ ev: 'cond-start', t: Date.now() });
  let launches = 0;
  for (;;) {
    const hosts = ['home', ...ns.scan('home').filter((h) => h.startsWith('casino-'))];
    const on = hosts.find((h) => ns.isRunning(CASINO, h));
    if (on) {
      await ns.sleep(1000);
      continue;
    }
    const net = ns.getMoneySources().sinceInstall.casino;
    if (net > 10e9) {
      log({ ev: 'cond-resume', t: Date.now(), net, money: ns.getServerMoneyAvailable('home') });
      return;
    }
    if (launches++ > 3) {
      log({ ev: 'cond-gave-up' });
      return;
    }
    if (!ns.serverExists(HOST)) {
      const got = ns.cloud.purchaseServer(HOST, 64);
      log({ ev: 'bought', got, money: ns.getServerMoneyAvailable('home') });
    }
    ns.scp(CASINO, HOST, 'home');
    const pid = ns.exec(CASINO, HOST); // not temporary: the one exception
    log({ ev: 'casino-launched', pid });
    await ns.sleep(1000);
  }
}
