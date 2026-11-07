// Logs each start, then waits. Used to see which scripts come back after a page reload.
export async function main(ns) {
  const s = ns.getRunningScript();
  console.log('[LAB] ' + JSON.stringify({ ev: 'temp-start', args: ns.args, temporary: s.temporary, pid: s.pid }));
  await ns.sleep(600000);
}
