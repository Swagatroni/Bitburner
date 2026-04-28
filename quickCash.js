import { stockPortfolio } from "./Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const homeServ = "home";
  const trader = "diamond-hands.js";

  // Arg 0:
  //  - number => pause seconds before restarting trader
  //  - "k"    => kill trader and DO NOT restart
  const arg0 = ns.args[0];
  const killOnly = arg0 === "k";
  const pause = killOnly ? 0 : (Number(arg0) || 30);

  function getOwnedStocks() {
    const stockSymbols = ns.stock.getSymbols();
    const stocks = [];
    for (const sym of stockSymbols) {
      const pos = ns.stock.getPosition(sym);
      stocks.push({
        sym,
        longShares: pos[0],
        shortShares: pos[2],
      });
    }
    return stocks;
  }

  // Actually sell all positions and track how much CASH we got
  function sellAllStocks(stocks) {
    let proceeds = 0;

    for (const stock of stocks) {
      const { sym, longShares, shortShares } = stock;

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

  // 1️⃣ Stop trader if it's running
  if (ns.scriptRunning(trader, homeServ)) ns.scriptKill(trader, homeServ);

  // 2️⃣ Liquidate everything
  const stocks = getOwnedStocks();
  const proceeds = sellAllStocks(stocks);

  // 3️⃣ Either kill permanently or pause + restart trader
  if (killOnly) {
    ns.tprint("Trader will remain stopped (kill mode).");
    return;
  }

  ns.tprint(`Pausing trader for ${pause} seconds...`);
  await ns.sleep(pause * 1000);

  const pid = ns.exec(trader, homeServ, 1);
  if (pid === 0) ns.tprint(`Failed to restart ${trader} on ${homeServ}`);
  else ns.tprint(`Restarted ${trader}`);

}
