import { getPservs, stockPortfolio } from "./Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const home = "home";
  const pservs = getPservs(ns);
  const MAX_RAM = ns.getPurchasedServerMaxRam();

  const hasStocks =
    typeof ns.stock !== "undefined" &&
    (ns.stock.hasWSEAccount?.() ?? false) &&
    (ns.stock.hasTIXAPIAccess?.() ?? false) &&
    (ns.stock.has4SDataTIXAPI?.() ?? false);

  let baseRam = ns.serverExists("pserv-01")
    ? ns.getServerMaxRam("pserv-01")
    : 2;

  // Start at the current tier (or 2GB)
  let targetRAM = Math.min(baseRam, MAX_RAM);

  let cycles = ns.args[0];
  let count = 0;

  function cash() {
    return ns.getServerMoneyAvailable(home);
  }

  function totalWealth() {
    if (!hasStocks) return cash();
    return cash() + stockPortfolio(ns);
  }

  function canBuyNew(ram) {
    if (ram > MAX_RAM) return false;
    return cash() >= ns.getPurchasedServerCost(ram);
  }

  function upgradeCost(server, desiredRam) {
    const cost = ns.getPurchasedServerUpgradeCost(server, desiredRam);
    return Number.isFinite(cost) ? cost : Infinity;
  }

  function getServersNeedingUpgrade(desiredRam) {
    return pservs.filter(
      (s) =>
        ns.serverExists(s) &&
        ns.getServerMaxRam(s) < desiredRam &&
        ns.getServerMaxRam(s) < MAX_RAM,
    );
  }

  async function buyMissingServers() {
    for (const server of pservs) {
      if (!ns.serverExists(server)) {
        while (!canBuyNew(targetRAM)) {
          ns.print(
            `Waiting to buy ${server} @ ${ns.format.ram(targetRAM)}. Cash: $${ns.format.number(cash())}`,
          );
          await ns.sleep(3000);
        }
        ns.purchaseServer(server, targetRAM);
      }
    }
  }

  async function upgradeTier(desiredRam) {
    const serversToUpgrade = getServersNeedingUpgrade(desiredRam);
    if (serversToUpgrade.length === 0) return;

    const sample = serversToUpgrade[0];
    const costOne = upgradeCost(sample, desiredRam);

    const wealth = totalWealth();
    if (wealth < costOne) {
      ns.print(
        `Wealth ${ns.format.number(wealth)} < ${ns.format.number(costOne)} (one upgrade to ${ns.format.ram(desiredRam)}).`,
      );
      return;
    }

    for (const server of serversToUpgrade) {
      const currentRam = ns.getServerMaxRam(server);
      if (currentRam >= desiredRam) continue;

      const cost = upgradeCost(server, desiredRam);
      if (!Number.isFinite(cost)) continue;

      if (cash() >= cost) {
        const ok = ns.upgradePurchasedServer(server, desiredRam);
      }
    }
  }

  while (true) {
    await buyMissingServers();

    const desiredRam = Math.min(targetRAM, MAX_RAM);
    await upgradeTier(desiredRam);

    // Check if all servers are at MAX_RAM
    let allMaxed = true;
    for (const s of pservs) {
      if (!ns.serverExists(s) || ns.getServerMaxRam(s) < MAX_RAM) {
        allMaxed = false;
        break;
      }
    }
    if (allMaxed) {
      ns.tprint(`✅ All purchased servers maxed (${ns.format.ram(MAX_RAM)})`);
      break;
    }

    // If all existing servers are at least at targetRAM, bump the tier
    let allAtTarget = true;
    for (const s of pservs) {
      if (!ns.serverExists(s) || ns.getServerMaxRam(s) < targetRAM) {
        allAtTarget = false;
        break;
      }
    }

    if (allAtTarget && targetRAM < MAX_RAM) {
      targetRAM = Math.min(targetRAM * 2, MAX_RAM);
      const sample = pservs[0];
      const cost = upgradeCost(sample, targetRAM);
      ns.tprint(
        `➡ Next fleet target: ${ns.format.ram(targetRAM)} (upgrade ~${ns.format.number(cost)} each)`,
      );
    }

    await ns.sleep(100);

    if (cycles !== undefined) {
      count++;
      if (count >= cycles) break;
    }
  }
}
