/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  while (true){
    ns.singularity.upgradeHomeRam();
    await ns.sleep(1000);
  }

  // ns.exec("Curtain/search.js", "home", 1, "w0r1d_d43m0n");

}
