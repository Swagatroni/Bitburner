/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  let faction = ns.args[0] || "Sector-12";

  while (1) {
    ns.singularity.purchaseAugmentation(faction, "NeuroFlux Governor");
    await ns.sleep(100);
  }

  ns.tprint("NeuroFlux Governor Bought");
}
