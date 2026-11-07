// Stands in for boot.js: proves the timer's typed command ran, and reports what the reset left behind.
export async function main(ns) {
  const r = ns.getResetInfo();
  const p = ns.getPlayer();
  console.log('[LAB] ' + JSON.stringify({
    ev: 'boot-ran', args: ns.args, node: r.currentNode, ownedAugs: r.ownedAugs ? [...r.ownedAugs.keys()] : null,
    ownedSF: r.ownedSF ? [...r.ownedSF.entries()] : null, money: p.money, hacking: p.skills.hacking,
    files: ns.ls('home', '.js'), temporary: ns.getRunningScript().temporary,
    modals: document.querySelectorAll('.MuiModal-root').length,
  }));
}
