/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  while (ns.getHackingLevel() < 4500){
    await ns.sleep(1000);
  }

  ns.exec("Curtain/search.js", "home", 1, "w0r1d_d43m0n");

}
