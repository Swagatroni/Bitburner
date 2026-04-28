import { handleBackdoors } from "./utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  // Start Programs
  ns.exec("gang-management.js", "home");
  ns.exec("buyGangAugs.js", "home");
  ns.exec("bladerunner.js", "home");
  ns.exec("NeuroFlux.js", "home");
  ns.exec("sleeves.js", "home", 1, "-h");

  // Buy Tor Router
  ns.singularity.purchaseTor();

  // Buy All Programs
  const list = ns.singularity.getDarkwebPrograms();

  for (const program of list) {
    ns.singularity.purchaseProgram(program);
  }
  await ns.sleep(5000);

  // Search for Factions with Augs Left
  handleBackdoors(ns);

  // Farm Combat Stats
  ns.sleeve.setToBladeburnerAction(0, "Training");
  while (stats(ns, 1000)) await ns.sleep(1000);
  ns.sleeve.setToUniversityCourse(0, "ZB Institute of Technology", "Algorithms");


  // Sector-12
  while (ns.singularity.joinFaction("Sector-12")) await ns.sleep(500);
  while (ns.getPlayer().money < 5e11) await ns.sleep(3000);
  ns.singularity.donateToFaction("Sector-12", 5e11);
}

function stats(ns, desiredNum) {
  const player = ns.getPlayer();
  const combatStats = ["strength", "defense", "dexterity", "agility"];

  let needTrain = false;
  for (const stat of combatStats) {
    if (player[stat] < desiredNum) {
      needTrain = true;
      break;
    }
  }

  return needTrain;
}
