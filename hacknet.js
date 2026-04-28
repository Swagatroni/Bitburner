/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  if (ns.args.includes("--tail") || ns.args.includes("-t")) ns.ui.openTail();

  const hn = ns.hacknet;
  const delay = 10;
  const debug = true;
  const log = (msg) => {
    if (debug) ns.print(msg);
  };

  ns.tprint("Starting Hacknet");

  while (1) {
    try {
      if (hn.purchaseNode() != -1) log("Purchased new node");
    } catch (e) {}

    let numNodes = hn.numNodes();
    const nodes = [];

    for (let i = 0; i < numNodes; i++) {
      const node = {
        index: i,
        level: hn.getNodeStats(i).level,
        ram: hn.getNodeStats(i).ram,
        cores: hn.getNodeStats(i).cores,
        cache: hn.getNodeStats(i).cache,
      };
      nodes.push(node);
    }

    if (nodes.length === 0) {
      log("No Hacknet nodes yet. Waiting for funds to buy first node...");
      await ns.sleep(delay);
      continue;
    }

    // Sort nodes by cache, cores, ram, level
    nodes.sort((a, b) => {
      if (a.cache !== b.cache) return a.cache - b.cache;
      if (a.cores !== b.cores) return a.cores - b.cores;
      if (a.ram !== b.ram) return a.ram - b.ram;
      return a.level - b.level;
    });

    let cheapest = hn.getLevelUpgradeCost(nodes[0].index);
    let upgradeType = "level";

    if (hn.getRamUpgradeCost(nodes[0].index) < cheapest) {
      cheapest = hn.getRamUpgradeCost(nodes[0].index);
      upgradeType = "ram";
    }

    if (hn.getCoreUpgradeCost(nodes[0].index) < cheapest) {
      cheapest = hn.getCoreUpgradeCost(nodes[0].index);
      upgradeType = "core";
    }

    if (hn.getCacheUpgradeCost(nodes[0].index) < cheapest) {
      cheapest = hn.getCacheUpgradeCost(nodes[0].index);
      upgradeType = "cache";
    }

    log(
      `Cheapest Upgrade: ${nodes[0].index}, ${upgradeType}, ${ns.formatNumber(cheapest)}`,
    );

    await upgradeNode(upgradeType, nodes);

    // ns.tprint(`Current Hacknet Nodes: ${numNodes}`);
    // for (const node of nodes) {
    //   ns.tprint(
    //     `Node ${node.index}: Level ${node.level}, RAM ${node.ram}GB, Cores ${node.cores}, Cache ${node.cache}`,
    //   );
    // }

    await ns.sleep(delay);
  }

  async function upgradeNode(type, nodes) {
    while (type === "level") {
      if (hn.upgradeLevel(nodes[0].index)) break;
      else await ns.sleep(delay);
    }

    while (type === "ram") {
      if (hn.upgradeRam(nodes[0].index)) break;
      else await ns.sleep(delay);
    }

    while (type === "core") {
      if (hn.upgradeCore(nodes[0].index)) break;
      else await ns.sleep(delay);
    }

    while (type === "cache") {
      if (hn.upgradeCache(nodes[0].index)) break;
      else await ns.sleep(delay);
    }
  }
}
