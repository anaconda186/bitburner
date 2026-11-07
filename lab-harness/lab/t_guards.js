// Lab script: names only `document` (never the other global), so it pays one DOM RAM cost.
// Tests plain clicks (control) against faked trusted clicks on each guard the plan needs.
const log = (o) => console.log('[LAB] ' + JSON.stringify(o));
const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
const startsBtn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
const sideItem = (t) => [...document.querySelectorAll('.MuiListItem-root, [role="button"]')].find((e) => e.textContent.trim().endsWith(t));
function fake(el) {
  const k = Object.keys(el).find((x) => x.startsWith('__reactProps'));
  el[k].onClick({ isTrusted: true });
}
const modals = () => document.querySelectorAll('.MuiModal-root').length;

function typeTerm(cmd) {
  const i = document.getElementById('terminal-input');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(i, cmd);
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

export async function main(ns) {
  const stack = ns.args.includes('--stack');
  const money = () => ns.getServerMoneyAvailable('home');
  log({ ev: 'ram', ram: ns.getScriptRam(ns.getScriptName()), stack });

  if (stack) {
    ['one', 'two', 'three'].forEach((t) => ns.alert('stacked dialog ' + t));
    await ns.sleep(300);
    log({ ev: 'stacked', modals: modals() });
  }

  // Terminal recipe, with and without stacked dialogs
  const inp = document.getElementById('terminal-input');
  log({ ev: 'terminal-el', tag: inp && inp.tagName });
  typeTerm('run marker.js --tag recipe' + (stack ? '-stack' : ''));
  await ns.sleep(500);
  typeTerm('connect n00dles; connect home; run marker.js --tag chain' + (stack ? '-stack' : ''));
  await ns.sleep(500);

  // Navigate to the casino: these have no guard, so a plain click should do.
  sideItem('City').click();
  await ns.sleep(100);
  const loc = document.querySelector('[aria-label="Iker Molina Casino"]');
  log({ ev: 'city', found: !!loc });
  loc.click();
  await ns.sleep(100);
  const play = startsBtn('Play blackjack');
  log({ ev: 'casino-page', found: !!play });
  play.click();
  await ns.sleep(100);

  // Blackjack control: plain .click() and dispatched MouseEvent must be stopped by the guard.
  const m0 = money();
  btn('Start').click();
  await ns.sleep(100);
  const afterPlain = { hit: !!btn('Hit'), money: money() };
  btn('Start').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ns.sleep(100);
  const afterDispatch = { hit: !!btn('Hit'), money: money() };
  log({ ev: 'bj-control', m0, afterPlain, afterDispatch, blocked: !afterPlain.hit && !afterDispatch.hit && afterDispatch.money === m0 });

  // Faked click, and whether the React re-render happens synchronously.
  // Blackjack may end at the deal (naturals), so retry until a hand is in progress.
  let hands = 0;
  for (let i = 0; i < 20; i++) {
    const before = money();
    fake(btn('Start'));
    hands++;
    const syncHit = !!btn('Hit');
    const syncMoney = money();
    log({ ev: 'bj-start', before, syncMoney, syncHit, paidBet: syncMoney !== before || syncHit });
    if (syncHit) break;
    await ns.sleep(50);
  }
  await ns.sleep(50);
  const stayBtn = btn('Stay');
  const hitBtn = btn('Hit');
  if (hitBtn) {
    // Hit control, then fake it
    const cards = () => document.querySelectorAll('.MuiPaper-root .MuiPaper-root').length;
    const c0 = cards();
    hitBtn.click();
    await ns.sleep(50);
    const c1 = cards();
    if (btn('Hit')) fake(btn('Hit'));
    await ns.sleep(50);
    const c2 = cards();
    log({ ev: 'bj-hit', c0, afterPlain: c1, afterFake: c2, guardHeld: c0 === c1, fakeWorked: c2 > c1 });
    if (btn('Stay')) {
      btn('Stay').click();
      await ns.sleep(50);
      const stillPlaying = !!btn('Stay');
      fake(btn('Stay'));
      await ns.sleep(50);
      log({ ev: 'bj-stay', guardHeld: stillPlaying, fakeFinished: !btn('Stay'), text: document.body.innerText.match(/You won!|You Won! Blackjack!|You lost!|Push! \(Tie\)/)?.[0] });
    } else {
      log({ ev: 'bj-stay', note: 'hand ended on the hit (bust)' });
    }
  }
  log({ ev: 'bj-end', stayExistedEarlier: !!stayBtn, hands, money: money() });

  // Faction join: control then fake.
  const factions = () => ns.getPlayer().factions;
  btn('Stop playing') && btn('Stop playing').click();
  await ns.sleep(50);
  const f = sideItem('Factions');
  log({ ev: 'factions-side', found: !!f });
  if (f) {
    f.click();
    await ns.sleep(200);
    const join = btn('Join!');
    log({ ev: 'join-button', found: !!join, factions: factions() });
    if (join) {
      join.click();
      await ns.sleep(200);
      const afterPlainJoin = factions().length;
      fake(btn('Join!'));
      await ns.sleep(200);
      log({ ev: 'join', guardHeld: afterPlainJoin === 0, afterPlainJoin, factions: factions() });
    }
  }

  // Back to the terminal page for clean state, then save so the harness can read exploit flags.
  sideItem('Terminal').click();
  await ns.sleep(100);
  document.querySelector('[aria-label="save game"]').click();
  await ns.sleep(1000);
  log({ ev: 'done', modals: modals() });
}
