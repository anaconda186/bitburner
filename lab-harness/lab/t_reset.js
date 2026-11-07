// Lab driver: names only `document`. Sets an atExit timer that types `run boot_lab.js`,
// then performs a UI-driven install (--install) or BitNode entry (--bitnode).
const log = (o) => console.log('[LAB] ' + JSON.stringify(o));
const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
const sideItem = (t) => [...document.querySelectorAll('.MuiListItem-root, [role="button"]')].find((e) => e.textContent.trim().endsWith(t));

function typeTerm(cmd) {
  const i = document.getElementById('terminal-input');
  if (!i || i.disabled) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(i, cmd);
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
}

export async function main(ns) {
  const mode = ns.args[0];
  log({ ev: 'driver-start', mode, ram: ns.getScriptRam(ns.getScriptName()), node: ns.getResetInfo().currentNode });

  ns.atExit(() => {
    const t = Date.now();
    log({ ev: 'atExit-fired', t });
    let tries = 0;
    let clickedPortal = false;
    let clickedEnter = false;
    const attempt = () => {
      tries++;
      if (mode === '--bitnode' && !clickedEnter) {
        // Scripts are already dead by now: reaching the BitVerse kills them. Only this timer is left.
        if (!clickedPortal) {
          const portal = document.querySelector('[aria-label^="BitNode-4:"]');
          if (portal) {
            portal.click();
            clickedPortal = true;
            log({ ev: 'timer-clicked-portal', msAfterExit: Date.now() - t });
          }
        } else {
          const enter = document.querySelector('[aria-label="enter-bitnode-4"]');
          if (enter) {
            log({ ev: 'timer-clicking-enter', text: enter.textContent, msAfterExit: Date.now() - t });
            enter.click();
            clickedEnter = true;
          }
        }
        if (tries < 3000) setTimeout(attempt, 100);
        return;
      }
      if (typeTerm('run boot_lab.js --from ' + mode)) {
        log({ ev: 'timer-typed', tries, msAfterExit: Date.now() - t, modals: document.querySelectorAll('.MuiModal-root').length });
      } else if (tries < 3000) {
        setTimeout(attempt, 100);
      } else {
        log({ ev: 'timer-gave-up', tries });
      }
    };
    setTimeout(attempt, 500);
  });

  if (mode === '--install') {
    sideItem('Augmentations').click();
    await ns.sleep(200);
    const install = btn('Install Augmentations');
    log({ ev: 'install-button', found: !!install, disabled: install && install.disabled });
    install.click();
    await ns.sleep(200);
    const confirm = btn('Confirm');
    log({ ev: 'install-confirm', found: !!confirm });
    if (confirm) confirm.click();
    await ns.sleep(30000);
    log({ ev: 'driver-survived?!' });
  } else {
    // Find the chain to the World Daemon and walk it with typed commands.
    const prev = { home: null };
    const q = ['home'];
    while (q.length) {
      const c = q.shift();
      for (const n of ns.scan(c)) if (!(n in prev)) { prev[n] = c; q.push(n); }
    }
    const wd = 'w0r1d_d43m0n';
    if (!(wd in prev)) { log({ ev: 'no-path-to-wd', servers: Object.keys(prev).length }); return; }
    const path = [];
    for (let c = wd; c !== 'home'; c = prev[c]) path.unshift(c);
    log({ ev: 'path', path });
    typeTerm(path.map((p) => 'connect ' + p).join('; ') + '; backdoor');
    const t0 = Date.now();
    let portal = null;
    while (!portal && Date.now() - t0 < 120000) {
      portal = document.querySelector('[aria-label^="BitNode-4:"]');
      await ns.sleep(100);
    }
    log({ ev: 'portal', found: !!portal, ms: Date.now() - t0, firstLore: !!btn('Continue') });
    portal.click();
    await ns.sleep(300);
    const enter = document.querySelector('[aria-label="enter-bitnode-4"]');
    log({ ev: 'enter-button', found: !!enter, text: enter && enter.textContent });
    enter.click();
    await ns.sleep(30000);
    log({ ev: 'driver-survived?!' });
  }
}
