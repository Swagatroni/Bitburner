/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  let lvl, req;
  const server = "w0r1d_d43m0n";

  while (1) {
    lvl = ns.getHackingLevel();
    req = ns.getServerRequiredHackingLevel(server);

    if (lvl >= req) break;

    await ns.sleep(1000);
  }

  ns.exec("Curtain/search.js", "home", 1, server);
}