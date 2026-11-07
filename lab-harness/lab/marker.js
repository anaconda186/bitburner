export async function main(ns) {
  console.log('[LAB] ' + JSON.stringify({ ev: 'marker', args: ns.args, server: ns.getHostname() }));
}
