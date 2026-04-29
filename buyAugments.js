/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const callbackScript = "buyAugments.js";
  // ns.ui.openTail();
  const augLimit = 3;

  if (!ns.isRunning("GOD-EYE.js")) ns.exec("GOD-EYE.js", "home");
  ns.exec("hashUpgrade.js", "home", 1, "research");
  // ns.exec("hashUpgrade.js", "home", 1, "corp");

  function getAugs() {
    const sing = ns.singularity;
    const arr = [];

    // Collect all factions and their augmentations
    const tempFactions = ns.getPlayer().factions;

    for (const name of tempFactions) {
      let augs = sing.getAugmentationsFromFaction(name);

      let filteredAugs = augs.filter(
        (aug) => !sing.getOwnedAugmentations(true).includes(aug),
      );

      filteredAugs = filteredAugs.map((aug) => {
        return {
          name: aug,
          faction: name,
          price: sing.getAugmentationPrice(aug),
          repReq: sing.getAugmentationRepReq(aug),
        };
      });

      arr.push(...filteredAugs);
    }

    return arr;
  }

  while (true) {
    // Collect All Augs
    const augs = getAugs();
    ns.print(`Found ${augs.length} purchasable augmentation(s).`);

    // Sort by cost (ascending)
    augs.sort((a, b) => a.price - b.price);

    const all = ns.singularity.getOwnedAugmentations(true);
    const installed = ns.singularity.getOwnedAugmentations();
    const toBeInstalled = all.filter((aug) => !installed.includes(aug));

    if (augs.length === 0) break; // No augs to buy, exit loop
    if (toBeInstalled.length >= augLimit)
      ns.singularity.installAugmentations(callbackScript);

    // For each aug:
    for (const aug of augs) {
      const money = ns.getServerMoneyAvailable("home");
      const rep = ns.singularity.getFactionRep(aug.faction);
      ns.print(
        `Checking: ${aug.name} | Price: $${ns.formatNumber(aug.price)} | Rep: ${ns.formatNumber(rep)}/${ns.formatNumber(aug.repReq)} | Money: $${ns.formatNumber(money)}`,
      );
      if (rep >= aug.repReq && money >= aug.price) {
        ns.print(`Attempting to purchase ${aug.name} from ${aug.faction}...`);
        const ok = ns.singularity.purchaseAugmentation(aug.faction, aug.name);
        if (ok) {
          ns.tprint(
            `Purchased: ${aug.name} from ${aug.faction} ($${ns.formatNumber(
              aug.price,
            )})`,
          );
          ns.print(`SUCCESS: Purchased ${aug.name} from ${aug.faction}.`);
        } else {
          ns.print(
            `FAILED: Could not purchase ${aug.name} from ${aug.faction}.`,
          );
        }
      } else {
        ns.print(
          `Skipping ${aug.name}: ${rep < aug.repReq ? "insufficient rep" : "insufficient funds"}.`,
        );
      }
    }
    await ns.sleep(100);
  }
}
