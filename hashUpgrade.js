/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  let upg = "Sell for Money";

  const money = ns.args.includes("money");
  const rank = ns.args.includes("rank");
  const skill = ns.args.includes("skill");
  const gym = ns.args.includes("gym");
  const res = ns.args.includes("research" || "res");
  const corp = ns.args.includes("corp");

  if (money) upg = "Sell for Money";
  if (rank) upg = "Exchange for Bladeburner Rank";
  if (skill) upg = "Exchange for Bladeburner SP";
  if (gym) upg = "Improve Gym Training";
  if (res) upg = "Exchange for Corporation Research";
  if (corp) upg = "Sell for Corporation Funds";

  const hn = ns.hacknet;

  while (1) {
    let num;
    num = hn.numHashes() / hn.hashCost(upg);

    hn.spendHashes(upg, num);

    await ns.sleep(10);
  }
}
