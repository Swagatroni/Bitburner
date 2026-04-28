import {
  getNetworkNodes,
  canHack,
  getThresholds,
  getRootAccess,
  canPenetrate,
} from "./utils.js";

function getComparator(compareField) {
  return (a, b) => {
    if (a[compareField] > b[compareField]) {
      return -1;
    } else if (a[compareField] < b[compareField]) {
      return 1;
    } else {
      return 0;
    }
  };
}

function getNodeInfo(ns, node) {
  const maxMoney = ns.getServerMaxMoney(node);
  const curMoney = ns.getServerMoneyAvailable(node);
  const reqHackLevel = ns.getServerRequiredHackingLevel(node);
  const security = ns.getServerSecurityLevel(node);
  const minSecurity = ns.getServerMinSecurityLevel(node);
  const moneyThresh = maxMoney * 0.75;
  const secThresh = minSecurity + 5;
  const reqPorts = ns.getServerNumPortsRequired(node);
  const hasRoot = ns.hasRootAccess(node);
  const maxRam = ns.getServerMaxRam(node);

  const server = ns.getServer(node);
  const player = ns.getPlayer();

  const hackChance = ns.formulas.hacking.hackChance(server, player);
  const revYield = maxMoney * hackChance;
  const strategy = getStrategy(ns, node);

  const nodeDetails = {
    node,
    maxMoney,
    maxRam,
    curMoney,
    reqHackLevel,
    security,
    minSecurity,
    secThresh,
    moneyThresh,
    reqPorts,
    hasRoot,
    hackChance,
    revYield,
  };

  for (const key of Object.keys(strategy)) {
    nodeDetails["strategy." + key] = strategy[key];
  }
  return nodeDetails;
}

// Strategy for thread allocation
export function getStrategy(ns, node) {
  const { moneyThresh, secThresh } = getThresholds(ns, node);

  const maxMoney = ns.getServerMaxMoney(node);
  const rawMoney = ns.getServerMoneyAvailable(node);
  const curMoney = Math.max(1, rawMoney);
  const curSec = ns.getServerSecurityLevel(node);

  const moneyRatio = curMoney / moneyThresh;
  const secDelta = curSec - secThresh;

  const server = ns.getServer(node);
  const player = ns.getPlayer();

  const hackChance = ns.formulas.hacking.hackChance(server, player);

  let type = "";
  let seq = [];
  let allocation = [];
  let hackFraction = 0;

  if (secDelta > 15) {
    type = "flog";
    seq = ["w"];
    allocation = [1.0];

  } else if (moneyRatio < 0.6) {
    type = "nourish";
    seq = ["g", "w"];
    allocation = [0.7, 0.3];

  } else if (hackChance < 0.5) {
    type = "flog";
    seq = ["w"];
    allocation = [1.0];

  } else {
    type = "plunder";
    seq = ["h", "g", "w"];

    let hackWeight = 0.5 + 0.3 * (hackChance - 0.5);
    hackWeight = Math.min(0.7, Math.max(0.4, hackWeight));

    const growWeight = 0.3;
    const weakenWeight = 1 - hackWeight - growWeight;

    allocation = [hackWeight, growWeight, weakenWeight];
    hackFraction = 0.5; // steal ~50% of thresh money per cycle (tweak this)
  }

  return {
    type,
    seq,
    allocation,
    secDelta,
    moneyRatio,
    hackChance,
    hackFraction,
  };
}

/** @param {NS} ns **/
export function getPotentialTargets(ns, compareField = "revYield") {
  const cracks = {
    "BruteSSH.exe": ns.brutessh,
    "FTPCrack.exe": ns.ftpcrack,
    "relaySMTP.exe": ns.relaysmtp,
    "HTTPWorm.exe": ns.httpworm,
    "SQLInject.exe": ns.sqlinject,
  };

  var networkNodes = getNetworkNodes(ns);
  var hackableNodes = networkNodes.filter((node) => {
    return (
      (canHack(ns, node) && canPenetrate(ns, node, cracks)) ||
      // ns.hackAnalyzeChance(node) > 0.75) ||
      node.includes("pserv")
    );
  });

  // Prepare the servers to have root access
  for (var serv of hackableNodes) {
    if (!ns.hasRootAccess(serv)) {
      getRootAccess(ns, serv, cracks);
    }
  }

  var nodeDetails = hackableNodes.map((node) => getNodeInfo(ns, node));
  var nodesDesc = nodeDetails
    .filter((node) => node.maxMoney > 0)
    .sort(getComparator(compareField));
  return nodesDesc;
}

/** @param {NS} ns **/
export async function main(ns) {
  var compareField = ns.args[0]; // maxMoney | hackChance
  if (compareField === undefined) {
    compareField = "revYield";
  }
  var filename = "network-report.txt";

  async function writeNodesToFile(nodes) {
    var lines = [];
    for (var node of nodes) {
      for (var field of Object.keys(node)) {
        var value = node[field];
        lines.push(field + ": " + value);
      }
      lines.push("");
    }
    var fileContent = lines.join("\n");
    ns.write(filename, fileContent, "w");
    ns.alert(fileContent);
    ns.toast("Wrote targets to " + filename, "info", 3000);
  }
  var potentialTargets = getPotentialTargets(ns, compareField);
  await writeNodesToFile(potentialTargets);
}
