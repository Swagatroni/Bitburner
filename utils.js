var homeServer = "home";

export function getNetworkNodes(ns) {
  var visited = {};
  var stack = [];
  var origin = ns.getHostname();
  stack.push(origin);

  while (stack.length > 0) {
    var node = stack.pop();
    if (!visited[node]) {
      visited[node] = node;
      var neighbours = ns.scan(node);
      for (var i = 0; i < neighbours.length; i++) {
        var child = neighbours[i];
        if (visited[child]) {
          continue;
        }
        stack.push(child);
      }
    }
  }

  // Add purchased servers
  let pservs = getPservs(ns);
  for (let i = 0; i < pservs.length; i++)
    if (ns.serverExists(pservs[i])) visited[pservs[i]] = pservs[i];

  return Object.keys(visited);
}

export function penetrate(ns, server, cracks) {
  ns.print("Penetrating " + server);
  for (var file of Object.keys(cracks)) {
    if (ns.fileExists(file, homeServer)) {
      var runScript = cracks[file];
      runScript(server);
    }
  }
}

function getNumCracks(ns, cracks) {
  return Object.keys(cracks).filter(function (file) {
    return ns.fileExists(file, homeServer);
  }).length;
}

export function canPenetrate(ns, server, cracks) {
  var numCracks = getNumCracks(ns, cracks);
  var reqPorts = ns.getServerNumPortsRequired(server);
  if (server.startsWith("pserv-")) reqPorts = 0;
  return numCracks >= reqPorts;
}

export function hasRam(ns, server, scriptRam, useMax = false) {
  var maxRam = ns.getServerMaxRam(server);
  var usedRam = ns.getServerUsedRam(server);
  var ramAvail = useMax ? maxRam : maxRam - usedRam;
  return ramAvail > scriptRam;
}

export function canHack(ns, server) {
  var pHackLvl = ns.getHackingLevel(); // player
  var sHackLvl = ns.getServerRequiredHackingLevel(server);
  return pHackLvl >= sHackLvl;
}

export function getTotalScriptRam(ns, scripts) {
  return scripts.reduce((sum, script) => {
    sum += ns.getScriptRam(script);
    return sum;
  }, 0);
}

export function getRootAccess(ns, server, cracks) {
  var requiredPorts = ns.getServerNumPortsRequired(server);
  if (requiredPorts > 0) {
    penetrate(ns, server, cracks);
  }
  ns.print("Gaining root access on " + server);
  ns.nuke(server);
}

export function getThresholds(ns, node) {
  var moneyThresh = ns.getServerMaxMoney(node) * 0.75;
  var secThresh = ns.getServerMinSecurityLevel(node) + 5;
  return {
    moneyThresh,
    secThresh,
  };
}

export function getPservs(ns) {
  let maxServers = ns.cloud.getServerLimit();
  if (maxServers === 0) return [];
  let pservs = [];

  for (let i = 1; i <= maxServers; i++) {
    if (i <= 9) pservs.push(`pserv-0${i}`);
    else pservs.push(`pserv-${i}`);
  }
  return pservs;
}

// Stock Portfolio
export function stockPortfolio(ns) {
  var portfolio = "stock-management.js";

  if (!ns.scriptRunning(portfolio, "home")) {
    ns.print("-------------------------------------");
    return 0;
  }

  // Get an array of all stock symbols
  const stockSymbols = ns.stock.getSymbols();
  let totalStockValue = 0;

  // Loop through each symbol to get and calculate the value of your position
  for (const symbol of stockSymbols) {
    // The getPosition() function returns an array with information about your long and short positions
    const position = ns.stock.getPosition(symbol);
    const numSharesLong = position[0];
    const numSharesShort = position[2];

    // Calculate the value of long positions
    if (numSharesLong > 0) {
      const bidPrice = ns.stock.getBidPrice(symbol);
      totalStockValue += numSharesLong * bidPrice;
    }

    // Calculate the value of short positions
    if (numSharesShort > 0) {
      const askPrice = ns.stock.getAskPrice(symbol);
      totalStockValue += numSharesShort * askPrice;
    }
  }

  // Print the final value to the terminal
  ns.print("Stock Portfolio Value: " + ns.format.number(totalStockValue));

  return totalStockValue;
}

// Server Upgrades
export function serverUpgrades(ns) {
  const pservs = getPservs(ns);

  if (pservs.length === 0) {
    return "0/0";
  }

  // Determine the lowest RAM tier in your fleet (the one you want to upgrade next)
  const ramList = pservs
    .filter((s) => ns.serverExists(s))
    .map((s) => ns.getServerMaxRam(s));

  if (ramList.length === 0) return `0/${pservs.length}`;

  const minRam = Math.min(...ramList); // the current tier
  const maxRam = Math.max(...ramList); // only used for debugging

  // Count how many are on the current upgrade tier
  const onTier = pservs.length - ramList.filter((r) => r === minRam).length;

  // Display format: "13/25"
  const upgradeText = `${onTier}/${pservs.length}`;

  return upgradeText;
}

export function stockApi(ns) {
  if (typeof ns.stock === "undefined") return null;

  if (!ns.stock.hasWSEAccount()) {
    return { key: "wse", api: "WSE Account", apiCost: 200_000_000 };
  }
  if (!ns.stock.hasTIXAPIAccess()) {
    return { key: "tix", api: "TIX API", apiCost: 5_000_000_000 };
  }
  if (!ns.stock.has4SData()) {
    return { key: "4s", api: "4S Market Data", apiCost: 1_000_000_000_000 };
  }
  if (!ns.stock.has4SDataTIXAPI()) {
    return {
      key: "4s-tix",
      api: "4S Market Data TIX API",
      apiCost: 25_000_000_000_000,
    };
  }

  return null;
}

export function bonusMsToRealHMS(bonusMs, speedMultiplier = 24) {
  // Convert milliseconds to seconds, then divide by speed multiplier for real time
  const realSeconds = Math.floor(bonusMs / 1000 / speedMultiplier);

  const hours = Math.floor(realSeconds / 3600);
  const minutes = Math.floor((realSeconds % 3600) / 60);
  const seconds = realSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

export function autocomplete(data, args) {
  return [...data.servers, ...data.scripts]; // This script    autocompletes the list of servers.
}

export function handleDarkWeb(ns, money) {
  const list = ns.singularity
    .getDarkwebPrograms()
    .map((program) => ({
      program,
      progCost: ns.singularity.getDarkwebProgramCost(program),
    }))
    .filter((p) => p.progCost > 0);

  if (list.length === 0) return true;

  list.sort((a, b) => a.progCost - b.progCost);

  const next = list[0];
  if (money >= next.progCost) {
    const ok = ns.singularity.purchaseProgram(next.program);
    if (ok) ns.tprint(`Purchased program ${next.program}.`);
  }

  return false;
}

export async function handleBackdoors(ns) {
  const hlevel = ns.getHackingLevel();
  const owned = ns.singularity.getOwnedAugmentations(true);

  const targets = [
    { server: "CSEC", faction: "CyberSec" },
    { server: "avmnite-02h", faction: "NiteSec" },
    { server: "I.I.I.I", faction: "The Black Hand" },
    { server: "run4theh111z", faction: "BitRunners" },
  ];

  for (const { server, faction } of targets) {
    if (!ns.serverExists(server)) continue;

    const s = ns.getServer(server);
    if (s.backdoorInstalled) continue;
    if (hlevel < s.requiredHackingSkill) continue;

    const factionAugs = ns.singularity.getAugmentationsFromFaction(faction);
    const missing = factionAugs.filter((aug) => !owned.includes(aug));
    if (missing.length === 0) continue;

    if (!ns.isRunning("Curtain/search.js", "home", server)) {
      ns.tprint(
        `Backdooring ${server} (${faction})... (Missing ${missing.length} aug(s))`,
      );
      await ns.exec("Curtain/search.js", "home", 1, server);
      await ns.sleep(2000);
    }
  }

  return false;
}
