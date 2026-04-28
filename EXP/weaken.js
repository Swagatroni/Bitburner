/** @param {NS} ns */
export async function main(ns) {
  var server = ns.args[0];
  while (true) {
    await ns.weaken(server);
  }
}