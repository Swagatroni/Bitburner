/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  function buyAugs(sleeveIndex) {
    let money = ns.getServerMoneyAvailable("home");

    const augs = ns.sleeve
      .getSleevePurchasableAugs(sleeveIndex)
      .slice()
      .sort((a, b) => a.cost - b.cost);

    for (const aug of augs) {
      if (money < aug.cost) break;
      const ok = ns.sleeve.purchaseSleeveAug(sleeveIndex, aug.name);
      if (ok) {
        ns.print(
          `SLEEVE-${sleeveIndex} bought ${aug.name} for $${ns.format.number(aug.cost)}`,
        );
        money -= aug.cost;
      }
    }
  }

  while (true) {
    const numSleeves = ns.sleeve.getNumSleeves();

    // 2) Sync next
    if (info.sync < 100) {
      ns.sleeve.setToSynchronize(s);
      continue;
    }

    // 2) Shock recovery always wins
    if (info.shock > 0) {
      ns.sleeve.setToShockRecovery(s);
      continue;
    }

    // Buy sleeve augs last (so you don’t interrupt shock/sync)
    for (let s = 0; s < numSleeves; s++) {
      const info = ns.sleeve.getSleeve(s);
      buyAugs(s);
    }

    await ns.sleep(1000);
  }
}
