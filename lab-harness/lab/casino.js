// Lab casino: save, play one hand with basic hit/stand, reload on a loss.
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

export async function main(ns) {
  const money = () => ns.getServerMoneyAvailable('home');
  const hadHandler = typeof window.onbeforeunload === 'function';
  window.onbeforeunload = null;
  log({ ev: 'start', t: Date.now(), money: money(), hadHandler, ram: ns.getScriptRam(ns.getScriptName()) });

  const tNav0 = Date.now();
  let guard = 0;
  while (!sideItem('City') && guard++ < 200) await ns.sleep(20);
  sideItem('City').click();
  await ns.sleep(0);
  guard = 0;
  while (!document.querySelector('[aria-label="Iker Molina Casino"]') && guard++ < 200) await ns.sleep(20);
  document.querySelector('[aria-label="Iker Molina Casino"]').click();
  await ns.sleep(0);
  guard = 0;
  while (!startsBtn('Play blackjack') && guard++ < 200) await ns.sleep(20);
  startsBtn('Play blackjack').click();
  await ns.sleep(0);
  guard = 0;
  while (!btn('Start') && guard++ < 200) await ns.sleep(20);
  log({ ev: 'at-table', navMs: Date.now() - tNav0 });

  const saveBtn = document.querySelector('[aria-label="save game"]');
  for (;;) {
    const m = money();
    const bet = Math.min(Math.floor(m), 100e6);
    if (bet < 1) { log({ ev: 'broke', m }); return; }
    setBet(bet);
    await ns.sleep(0);

    // Save and wait for the bytes in IndexedDB to change.
    const t0 = Date.now();
    const old = await readIdb();
    saveBtn.click();
    let polls = 0;
    for (;;) {
      const cur = await readIdb();
      if (!same(cur, old)) break;
      if (++polls > 2000) { log({ ev: 'save-timeout' }); break; }
      await ns.sleep(5);
    }
    const saveMs = Date.now() - t0;

    // The whole hand runs in one synchronous task, so nothing else can save in the middle.
    // The cap can't be read from the "Alright cheater" dialog: alerts are queued, so it can sit
    // hidden behind the Offline alert. Ask the game for the same number its check uses.
    const casinoNet = ns.getMoneySources().sinceInstall.casino;
    if (casinoNet > 10e9) {
      fake(btn('Start')); // confirm the game really refuses this hand
      const refused = !btn('Hit') && money() === m;
      log({ ev: 'cap', money: money(), casino: casinoNet, refused, dialogVisible: document.body.innerText.includes('Alright cheater'), modals: document.querySelectorAll('.MuiModal-root').length });
      saveBtn.click();
      await ns.sleep(1500);
      log({ ev: 'done', t: Date.now(), money: money() });
      return;
    }
    const t1 = Date.now();
    fake(btn('Start'));
    let hits = 0;
    while (btn('Hit')) {
      if (shouldHit(playerCount(), dealerUp())) { fake(btn('Hit')); hits++; }
      else fake(btn('Stay'));
    }
    const res = document.body.innerText.match(RESULT);
    const result = res ? res[0] : '?';
    const handMs = Date.now() - t1;
    log({ ev: 'hand', t: Date.now(), bet, before: m, after: money(), result, hits, saveMs, handMs, up: 0 });

    if (result === 'You lost!') {
      log({ ev: 'reload', t: Date.now() });
      location.reload();
      await ns.sleep(60000);
      return;
    }
    await ns.sleep(0);
  }
}
