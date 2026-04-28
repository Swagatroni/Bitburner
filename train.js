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

  while (true) {
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
        await ns.sleep(1000);
        const current = ns.getPlayer().skills[SKILL_MAP[skill]];
        skills[skill] = current >= TARGET;
      }
    }

    if (Object.values(skills).every((val) => val)) {
      ns.tprint("Training complete.");
      ns.singularity.stopAction();

      let inBB = ns.bladeburner.joinBladeburnerDivision();
      if (inBB) ns.exec("bladeburner.js", "home");

      ns.tprint("Joined Bladeburner Division.");
      break;
    }

    await ns.sleep(1000);
  }
}
