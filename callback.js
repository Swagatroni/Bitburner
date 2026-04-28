import { handleDarkWeb } from "./Curtain/utils.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  ns.singularity.purchaseTor();
  const dw = handleDarkWeb(ns, true);

  if (dw) {
    for (const program of dw) {
      if (!ns.fileExists(program.program, "home")) {
        const cost = ns.singularity.purchaseProgram(program.program);
      }
    }
  }

  ns.singularity.travelToCity("Aevum");

  // ns.exec("gang-management.js", "home");
  ns.exec("launch-fleets.js", "home");
  // ns.exec("bladeburner.js", "home");
  // ns.exec("buyGangAugs.js", "home");
  // ns.exec("sleeves.js", "home");
  // ns.exec("sleeves.js", "home", 1, "-b");
  ns.exec("diamond-hands.js", "home");
  // ns.exec("hacknet.js", "home");
  // ns.exec("hashUpgrade.js", "home", 1, "rank");
  ns.exec("custom-stats.js", "home");
  ns.exec("setGang.js", "home", 1, "terror");

}
