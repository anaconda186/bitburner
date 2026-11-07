// Casino for the "how does it come back" lab: handler cleared first, cap checked before navigating,
// UI waits that throw instead of hanging, and boot launched on the way out.
// Names `document` and the other DOM global, so it pays both 25 GB costs as the plan says.
const log = (o) => console.log('[LAB] ' + JSON.stringify(o));
const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
const startsBtn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
const sideItem = (t) => [...document.querySelectorAll('.MuiListItem-root, [role="button"]')].find((e) => e.textContent.trim().endsWith(t));
function fake(el) {
  const k = Object.keys(el).find((x) => x.startsWith('__reactProps'));
  el[k].onClick({ isTrusted: true });
}
function setBet(n) {
  const i = document.querySelector('input[type="number"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(i, String(n));
  i.dispatchEvent(new Event('input', { bubbles: true }));
}
function readIdb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('bitburnerSave', 2);
    q.onerror = () => rej(q.error);
    q.onsuccess = () => {
      const db = q.result;
      const g = db.transaction('savestring').objectStore('savestring').get('save');
      g.onsuccess = () => { db.close(); res(g.result); };
      g.onerror = () => { db.close(); rej(g.error); };
    };
  });
}
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
function paper(label) {
  return [...document.querySelectorAll('.MuiPaper-root')].find((p) => p.firstElementChild && p.firstElementChild.textContent.trim() === label);
}
function playerCount() {
  const p = paper('Player');
  const line = [...p.children].find((c) => c.textContent.startsWith('Count:'));
  return line.textContent.replace('Count:', '').trim().split(' or ').map(Number);
}
function dealerUp() {
  const d = paper('Dealer');
  const t = d.querySelector('.MuiPaper-root span').textContent.trim();
  if (t === 'A') return 11;
  if (['J', 'Q', 'K'].includes(t)) return 10;
  return Number(t);
}
function shouldHit(values, up) {
  const best = Math.max(...values.filter((v) => v <= 21));
  const soft = values.length > 1;
  if (soft) {
    if (best <= 17) return true;
    if (best === 18) return up >= 9;
    return false;
  }
  if (best <= 11) return true;
  if (best === 12) return !(up >= 4 && up <= 6);
  if (best <= 16) return up >= 7;
  return false;
}
const RESULT = /You won!|You Won! Blackjack!|You lost!|Push! \(Tie\)/;

async function until(ns, get, what) {
  for (let i = 0; i < 250; i++) {
    const v = get();
    if (v) return v;
    await ns.sleep(20);
  }
  throw new Error('timed out waiting for ' + what);
}

export async function main(ns) {
  const hadHandler = typeof window.onbeforeunload === 'function';
  window.onbeforeunload = null;
  const money = () => ns.getServerMoneyAvailable('home');
  log({
    ev: 'start', t: Date.now(), money: money(), hadHandler, host: ns.getHostname(),
    temporary: ns.getRunningScript().temporary, ram: ns.getScriptRam(ns.getScriptName()),
  });
  try {
    await play(ns, money);
  } catch (e) {
    log({ ev: 'casino-error', text: String(e).slice(0, 200) });
  }
  // On the way out, finished or errored. Never reached on a reload.
  const pid = ns.exec('cb_boot.js', 'home', { temporary: true }, 'from-casino');
  log({ ev: 'done', t: Date.now(), money: money(), bootPid: pid });
}

async function play(ns, money) {
  if (ns.getMoneySources().sinceInstall.casino > 10e9) {
    log({ ev: 'cap-at-start' });
    return;
  }
  const tNav0 = Date.now();
  (await until(ns, () => sideItem('City'), 'City')).click();
  await ns.sleep(0);
  (await until(ns, () => document.querySelector('[aria-label="Iker Molina Casino"]'), 'casino')).click();
  await ns.sleep(0);
  (await until(ns, () => startsBtn('Play blackjack'), 'blackjack')).click();
  await ns.sleep(0);
  await until(ns, () => btn('Start'), 'Start');
  log({ ev: 'at-table', navMs: Date.now() - tNav0 });

  const saveBtn = document.querySelector('[aria-label="save game"]');
  for (;;) {
    const m = money();
    const bet = Math.min(Math.floor(m), 100e6);
    if (bet < 1) {
      log({ ev: 'broke', m });
      return;
    }
    setBet(bet);
    await ns.sleep(0);

    const t0 = Date.now();
    const old = await readIdb();
    saveBtn.click();
    let polls = 0;
    for (;;) {
      const cur = await readIdb();
      if (!same(cur, old)) break;
      if (++polls > 2000) throw new Error('save timeout');
      await ns.sleep(5);
    }
    const saveMs = Date.now() - t0;

    const casinoNet = ns.getMoneySources().sinceInstall.casino;
    if (casinoNet > 10e9) {
      log({ ev: 'cap', money: money(), casino: casinoNet });
      saveBtn.click();
      await ns.sleep(1500);
      return;
    }
    const t1 = Date.now();
    fake(btn('Start'));
    while (btn('Hit')) {
      if (shouldHit(playerCount(), dealerUp())) fake(btn('Hit'));
      else fake(btn('Stay'));
    }
    const res = document.body.innerText.match(RESULT);
    const result = res ? res[0] : '?';
    log({ ev: 'hand', t: Date.now(), bet, before: m, after: money(), result, saveMs, handMs: Date.now() - t1 });
    if (result === 'You lost!') {
      log({ ev: 'reload', t: Date.now() });
      location.reload();
      await ns.sleep(60000);
      return;
    }
    await ns.sleep(0);
  }
}
