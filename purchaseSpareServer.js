/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  // ns.ui.openTail();

  const home = "home";
  const MAX_RAM = ns.getPurchasedServerMaxRam();
  const server = ns.args[0];
  const scriptRam = ns.args[1] || 256;

  while (!ns.serverExists(server)) {
    ns.print(`Purchasing server: ${server} with 2GB RAM`);
    ns.purchaseServer(server, 2);
    await ns.sleep(1000);
  }

  if (ns.getServerMaxRam(server) >= scriptRam * 1.2) {
    ns.tprint(
      `${server} already has enough RAM (${ns.formatRam(ns.getServerMaxRam(server), 0)})`,
    );
    return null;
  }

  let baseRam = ns.getServerMaxRam(server);

  // Start at the current tier (or 2GB)
  let targetRAM = Math.min(baseRam * 2, MAX_RAM);

  function cash() {
    return ns.getServerMoneyAvailable(home);
  }

  function upgradeCost(server, desiredRam) {
    const cost = ns.getPurchasedServerUpgradeCost(server, desiredRam);
    return Number.isFinite(cost) ? cost : Infinity;
  }

  while (true) {
    const desiredRam = Math.min(targetRAM, MAX_RAM);
    const cost = upgradeCost(server, desiredRam);

    ns.print(`Current RAM: ${ns.formatRam(baseRam, 0)}`);
    ns.print(`Target RAM:  ${ns.formatRam(desiredRam, 0)}`);
    ns.print(`RAM Cost:    $${ns.formatNumber(cost)}`);

    if (cost <= cash() && desiredRam > baseRam) {
      if (ns.upgradePurchasedServer(server, desiredRam)) {
        ns.tprint(`Upgraded ${server} to ${desiredRam} RAM`);
        baseRam = desiredRam;
        if (targetRAM > scriptRam * 1.2) break;
        else targetRAM *= 2;
      } else ns.print(`Failed to upgrade ${server} to ${desiredRam} RAM.`);
    }

    await ns.sleep(3000);
  }

  ns.tprint(
    `Finished upgrading ${server}. Final RAM: ${ns.formatRam(baseRam, 0)}`,
  );
}
