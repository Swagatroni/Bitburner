/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const TARGET = 100;
  const CITY = "Sector-12";
  const GYM = "Powerhouse Gym";
  const SKILL_MAP = {
    str: "strength",
    def: "defense",
    dex: "dexterity",
    agi: "agility",
  };

  if (ns.getPlayer().city !== CITY) {
    ns.tprint(`Traveling to ${CITY}...`);
    ns.singularity.travelToCity(CITY);
  }

  if (ns.bladeburner.inBladeburner()) {
    ns.exec("crime-auto.js", "home");
    return;
  }

  const player = ns.getPlayer().skills;
  const skills = {
    str: player.strength >= TARGET,
    def: player.defense >= TARGET,
    dex: player.dexterity >= TARGET,
    agi: player.agility >= TARGET,
  };

  for (const skill in skills) {
    while (!skills[skill]) {
      ns.singularity.gymWorkout(GYM, skill, false);
      await ns.sleep(1500);
      const current = ns.getPlayer().skills[SKILL_MAP[skill]];
      skills[skill] = current >= TARGET;
    }
  }

  if (Object.values(skills).every((val) => val)) {
    ns.tprint("Training complete.");
    ns.singularity.stopAction();

    ns.exec("crime-auto.js", "home");
  }
}
