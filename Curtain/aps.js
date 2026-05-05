import { getPservs, stockPortfolio } from "./Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const home = "home";
  const pservs = getPservs(ns);
  const MAX_RAM = ns.cloud.getRamLimit();

  const trader = "diamond-hands.js";

  // Detect if we *really* have stock market access (WSE + TIX)
  const hasStocks =
    typeof ns.stock !== "undefined" &&
    (ns.stock.hasWSEAccount?.() ?? false) &&
    (ns.stock.hasTIXAPIAccess?.() ?? false);

  // Initial target: existing pserv-01 RAM or 2GB, clamped to MAX_RAM
  let baseRam = ns.serverExists("pserv-01")
    ? ns.getServerMaxRam("pserv-01")
    : 2;
  let targetRAM = Math.min(baseRam, MAX_RAM);

  // Optional: number of outer cycles (undefined = run forever)
  let cycles = ns.args[0];
  let count = 0;

  function cash() {
    return ns.getServerMoneyAvailable(home);
  }

  function totalWealth() {
    // If no stock market access, just use raw cash
    if (!hasStocks) return cash();
    // Only call stockPortfolio if we know stocks are usable
    return cash() + stockPortfolio(ns);
  }

  function canBuyNew(ram) {
    if (ram > MAX_RAM) return false;
    const cost = ns.getPurchasedServerCost(ram);
    return cash() >= cost; // new servers: cash only
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

  function liquidateStocks() {
    if (!hasStocks) return 0; // nothing to do, no WSE/TIX

    const symbols = ns.stock.getSymbols();
    let proceeds = 0;

    for (const sym of symbols) {
      const pos = ns.stock.getPosition(sym);
      const longShares = pos[0];
      const shortShares = pos[2];

      if (longShares > 0) {
        const gained = ns.stock.sellStock(sym, longShares);
        proceeds += gained;
      }
      if (shortShares > 0) {
        const gained = ns.stock.sellShort(sym, shortShares);
        proceeds += gained;
      }
    }

    return proceeds;
  }

  async function buyMissingServers() {
    for (const server of pservs) {
      if (!ns.serverExists(server)) {
        while (!canBuyNew(targetRAM)) {
          ns.print(
            `Waiting to buy ${server} @ ${ns.format.ram(
              targetRAM,
            )}. Cash: $${ns.format.number(cash())}`,
          );
          await ns.sleep(3000);
        }
        ns.purchaseServer(server, targetRAM);
        ns.tprint(`Purchased ${server} @ ${ns.format.ram(targetRAM)}`);
      }
    }
  }

  async function upgradeTier(desiredRam) {
    // Decide if it's even worth killing the trader.
    const serversToUpgrade = getServersNeedingUpgrade(desiredRam);
    if (serversToUpgrade.length === 0) return;

    const sample = serversToUpgrade[0];
    const costOne = upgradeCost(sample, desiredRam);

    // If we don't have enough wealth (cash + stocks if available)
    // to do at least *one* upgrade, don't touch the trader yet.
    const wealth = totalWealth();
    if (wealth < costOne) {
      ns.print(
        `Total wealth (${ns.format.number(
          wealth,
        )}) < cost of one upgrade (${ns.format.number(
          costOne,
        )}) @ ${ns.format.ram(desiredRam)}. Skipping liquidation this cycle.`,
      );
      return;
    }

    // 1️⃣ Kill trader if it's running (only really makes sense if hasStocks)
    if (hasStocks && ns.scriptRunning(trader, home)) {
      ns.scriptKill(trader, home);
    }

    // 2️⃣ Liquidate all stocks into cash, if we have stock access
    if (hasStocks) {
      const recovered = liquidateStocks();
      ns.print(
        `Liquidated portfolio, recovered ~${ns.format.number(recovered)} for upgrades.`,
      );
    }

    // 3️⃣ Upgrade as many servers as possible to desiredRam using pure cash
    for (const server of serversToUpgrade) {
      const currentRam = ns.getServerMaxRam(server);
      if (currentRam >= desiredRam) continue;

      const cost = upgradeCost(server, desiredRam);
      if (!Number.isFinite(cost)) continue;

      if (cash() >= cost) {
        ns.upgradePurchasedServer(server, desiredRam);
      } else {
        ns.print(
          `Not enough cash left to upgrade ${server} to ${ns.format.ram(
            desiredRam,
          )}. Cash: ${ns.format.number(cash())}, cost: ${ns.format.number(cost)}`,
        );
      }
    }

    // 4️⃣ Restart trader (only if stocks are a thing)
    if (hasStocks) {
      const pid = ns.exec(trader, home, 1);
      if (pid === 0)
        ns.print(`WARNING: Failed to restart ${trader} after upgrades!`);
    }
  }

  while (true) {
    await buyMissingServers();

    const desiredRam = Math.min(targetRAM, MAX_RAM);

    // Try to upgrade at this tier if we can afford at least one upgrade
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
      ns.tprint(
        `All purchased servers are at maximum RAM (${ns.format.ram(MAX_RAM)})`,
      );
      break;
    }

    // If all existing servers are at least at targetRAM, bump the tier
    let allAtTarget = true;
    for (const s of pservs) {
      if (!ns.serverExists(s)) {
        allAtTarget = false;
        break;
      }
      if (ns.getServerMaxRam(s) < targetRAM) {
        allAtTarget = false;
        break;
      }
    }

    if (allAtTarget && targetRAM < MAX_RAM) {
      targetRAM = Math.min(targetRAM * 2, MAX_RAM);
      const sample = pservs[0];
      const cost = upgradeCost(sample, targetRAM);
      ns.tprint(
        `Next fleet target: ${ns.format.ram(
          targetRAM,
        )} (upgrade ~${ns.format.number(cost)} each)`,
      );
    }

    await ns.sleep(3000);

    if (cycles !== undefined) {
      count++;
      if (count >= cycles) break;
    }
  }
}
