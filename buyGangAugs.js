/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  const cb = ns.args[0] === 0 ? true : false;

  // const faction = "Slum Snakes";
  const SLEEP = 10000;
  let dryLoops = 0;
  const CB_SCRIPT = "GOD-EYE.js";

  ns.tprint(`Starting augmentation buyer...`);

  function canBuyAug(aug) {
    const money = ns.getServerMoneyAvailable("home");
    const rep = ns.singularity.getFactionRep(faction);
    const cost = ns.singularity.getAugmentationPrice(aug);
    const repReq = ns.singularity.getAugmentationRepReq(aug);
    return rep >= repReq && money >= cost;
  }

  function installationNeeded() {
    const augs = ns.singularity.getAugmentationsFromFaction(faction);
    const owned = new Set(ns.singularity.getOwnedAugmentations(true));
    const installed = new Set(ns.singularity.getOwnedAugmentations(false));
    const remaining = augs.filter((a) => !owned.has(a));

    for (const aug of owned) {
      if (!installed.has(aug)) {
        return { remaining, needsInstall: true };
      }
    }
    return { remaining, needsInstall: false };
  }

  while (true) {
    const augs = [];
    ns.print(`Checking for available augmentations...`);
    const { remaining, needsInstall } = installationNeeded();

    ns.print(`Found ${remaining.length} augmentations to potentially buy`);

    // Sort remaining by cost descending so most expensive (best value) is bought first
    remaining.sort(
      (a, b) =>
        ns.singularity.getAugmentationPrice(b) -
        ns.singularity.getAugmentationPrice(a),
    );

    let purchased = 0;
    for (const aug of remaining) {
      if (!canBuyAug(aug)) continue;

      const ok = ns.singularity.purchaseAugmentation(faction, aug);
      if (ok) {
        purchased++;
        ns.tprint(
          `Purchased: ${aug} ($${ns.formatNumber(
            ns.singularity.getAugmentationPrice(aug),
          )})`,
        );
      } else {
        ns.print(`Failed to purchase: ${aug}`);
      }
    }

    if (purchased > 0) {
      dryLoops = 0;
    } else {
      dryLoops++;
      ns.print(`No purchases this loop (${dryLoops}/2 dry loops).`);
    }

    if (dryLoops >= 2 && needsInstall && cb) {
      ns.tprint(
        `2 dry loops with pending installs. Installing augmentations...`,
      );
      ns.singularity.installAugmentations(CB_SCRIPT);
      break;
    }

    if (remaining.length === 0 && !needsInstall) {
      ns.print(`No more augmentations available for purchase. Exiting.`);
      break;
    }

    ns.print(`Sleeping for ${SLEEP / 1000} seconds...`);
    await ns.sleep(SLEEP);
  }
}
