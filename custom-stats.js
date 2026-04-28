import { getPservs, stockPortfolio, serverUpgrades } from "./Curtain/utils.js";
import { getPortfolioValue } from "diamond-hands.js";

/** @param {NS} ns **/
export async function main(ns) {
  const doc = document;

  // Hook into game's overview
  const hook0 = doc.getElementById("overview-extra-hook-0");
  const hook1 = doc.getElementById("overview-extra-hook-1");

  while (true) {
    try {
      const headers = [];
      const values = [];

      let hacknetTotalProduction = 0;
      let hacknetTotalProfit = 0;

      // Calculate total hacknet income & profit
      for (let index = 0; index <= ns.hacknet.numNodes() - 1; index++) {
        hacknetTotalProduction += ns.hacknet.getNodeStats(index).production;
        hacknetTotalProfit += ns.hacknet.getNodeStats(index).totalProduction;
      }

      // Calculate purchased server upgrades

      try {
        const pservs = getPservs(ns);
        if (ns.serverExists(pservs[0])) {
          let size = ns.getServerMaxRam(pservs[0]);
          if (size < ns.getPurchasedServerMaxRam()) {
            headers.push(`PServs (${ns.formatRam(size, 0)}):`);
            values.push(serverUpgrades(ns));
          }
        }
      } catch (error) {}

      // Calculate script income
      headers.push("Scripts: ");
      values.push(
        ns.formatNumber(ns.getTotalScriptIncome()[0].toPrecision(5), 2) + "/s",
      );

      // Calculate stock portfolio
      if (ns.scriptRunning("diamond-hands.js", "home")) {
        headers.push("Portfolio: ");
        values.push(getPortfolioValue(ns));
      }

      // Share Power
      let sharePower = ns.getSharePower().toPrecision(2) * 100 - 100;
      if (sharePower > 0) {
        headers.push("Share %:");
        values.push(`+${sharePower}%`);
      }

      // Karma
      let karma = ns.formatNumber(ns.heart.break());

      if (!ns.gang.inGang()) {
        headers.push("Karma: ");
        values.push(karma);
      } else {
        let info = ns.gang.getGangInformation();
        if (ns.gang.inGang() && info.territory < 1) {
          headers.push("Gang: ");
          values.push(ns.formatNumber(info.territory * 100, 2) + "%");
        }
      }

      // headers.push("Hacknet Income: ");
      // values.push(ns.formatNumber(hacknetTotalProduction.toPrecision(5)) + '/s');

      // headers.push("Hacknet Profit: ");
      // values.push(ns.nFormat(hacknetTotalProfit.toPrecision(5), "$0.0a"));

      // headers.push("Script Experience: ");
      // values.push(ns.nFormat(ns.getTotalScriptExpGain().toPrecision(5), "0.00a") + '/s');

      headers.push("Time: ");
      values.push(new Date().toLocaleTimeString());

      hook0.innerText = headers.join(" \n");
      hook1.innerText = values.join("\n");
    } catch (error) {
      ns.tprint("ERROR- Update Skipped: " + String(error));
    }

    await ns.sleep(1000);
  }
}
