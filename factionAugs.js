/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const search = null;
  const factionWorkTypes = ["hacking", "field", "security"];

  const printFactions = (factions) => {
    ns.clearLog();
    ns.print("Factions and Augmentations:");
    for (const faction of factions) {
      ns.print("  ");
      ns.print(`${faction.name}:`);
      ns.print(
        ` - Augs: ${faction.numAugs} | Rep Gap: ${ns.format.number(faction.repGap)}`,
      );
    }
  };

  while (true) {
    const factions = getFactionsAugs(ns);

    factions.sort((a, b) => {
      return a.repGap - b.repGap || b.numAugs - a.numAugs;
    });

    if (search) {
      for (const faction of factions) {
        const aug = faction.augs.find((aug) =>
          aug.stats.toLowerCase().includes(search.toLowerCase()),
        );
      }
    }

    const bestFaction = factions.find((faction) => faction.repGap > 0);

    if (bestFaction) {
      let started = false;

      for (const workType of factionWorkTypes) {
        if (ns.singularity.workForFaction(bestFaction.name, workType, false)) {
          started = true;
          break;
        }
      }

      if (!started) {
        ns.print(`Unable to start faction work for ${bestFaction.name}`);
      }
    } else {
      ns.singularity.stopAction();
    }

    printFactions(factions);
    await ns.sleep(1000);
  }
}

export function getFactionsAugs(ns) {
  const sing = ns.singularity;

  // Collect all factions and their augmentations
  const tempFactions = ns.getPlayer().factions;
  let factions = [];

  for (const name of tempFactions) {
    let augs = sing.getAugmentationsFromFaction(name);

    augs = augs.filter(
      (aug) => !sing.getOwnedAugmentations(true).includes(aug),
    );

    let rep = 0;
    for (const aug of augs) {
      let facRep = sing.getAugmentationRepReq(aug);
      if (facRep > rep) rep = facRep;
    }

    const faction = {
      name,
      numAugs: augs.length,
      repReq: rep,
      currRep: sing.getFactionRep(name),
      repGap: rep - sing.getFactionRep(name),
      augs: augs.map((aug) => ({
        name: aug,
        repReq: sing.getAugmentationRepReq(aug),
        stats: sing.getAugmentationStats(aug),
      })),
    };

    factions.push(faction);
  }

  factions = factions.filter((faction) => faction.numAugs > 0);

  if (ns.gang.inGang()) {
    factions = factions.filter(
      (faction) => faction.name !== ns.gang.getGangInformation().faction,
    );
  }

  return factions;
}
