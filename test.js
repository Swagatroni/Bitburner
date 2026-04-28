/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const search = null;

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

    printFactions(factions);
    await ns.sleep(1000);
  }

  function printFactions(factions) {
    ns.print("Factions and Augmentations:");
    for (const faction of factions) {
      ns.print("  ");
      ns.print(`${faction.name}:`);
      ns.print(` - ${faction.numAugs} Augmentations`);
      if (faction.repGap > 0) {
        ns.print(` - Rep Required: ${ns.formatNumber(faction.repReq)}`);
        ns.print(` - Current Rep: ${ns.formatNumber(faction.currRep)}`);
      }
      ns.print(` - Rep Gap: ${ns.formatNumber(faction.repGap)}`);
    }
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

  factions = factions.filter(
    (faction) =>
      faction.numAugs > 0 &&
      faction.name !== "Bladeburners" &&
      faction.name !== "Shadows of Anarchy",
  );

  if (ns.gang.inGang()) {
    factions = factions.filter(
      (faction) => faction.name !== ns.gang.getGangInformation().faction,
    );
  }

  return factions;
}
