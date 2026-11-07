// Lab script: does a script reload raise the leave-page prompt, and does clearing the handler remove it?
// Stages survive reloads through localStorage. Started once by a real keypress (stage A) so the page
// has user activation, exactly as after the human types the start command.
const log = (o) => console.log('[LAB] ' + JSON.stringify(o));

export async function main(ns) {
  const stage = localStorage.getItem('labStage') || 'A';
  log({ ev: 'unload-start', stage, hasHandler: typeof window.onbeforeunload === 'function', ram: ns.getScriptRam(ns.getScriptName()) });
  const save = async () => { document.querySelector('[aria-label="save game"]').click(); await ns.sleep(800); };

  if (stage === 'A') {
    // Handler intact, real keypress happened: expect the prompt; the harness dismisses it (stay on page).
    localStorage.setItem('labStage', 'B');
    await save();
    log({ ev: 'reload-call', stage: 'A' });
    location.reload();
    await ns.sleep(5000);
    log({ ev: 'still-alive-after-A', note: 'the reload was cancelled by dismissing the prompt' });
    // Same page, activation still there: clear the handler and reload again.
    window.onbeforeunload = null;
    log({ ev: 'reload-call', stage: 'A-cleared', hasHandler: typeof window.onbeforeunload === 'function' });
    location.reload();
    await ns.sleep(60000);
  } else if (stage === 'B') {
    // Fresh page load with no keypress since: handler is back. Does it prompt without activation?
    localStorage.setItem('labStage', 'C');
    await ns.sleep(3000);
    log({ ev: 'reload-call', stage: 'B-no-activation', hasHandler: typeof window.onbeforeunload === 'function' });
    location.reload();
    await ns.sleep(6000);
    log({ ev: 'still-alive-after-B' });
  } else {
    log({ ev: 'stage-C-reached' });
  }
}
