import { handleDarkWeb, handleBackdoors } from "./Curtain/utils.js";

const CORP_SCRIPTS = ["corp-management.js", "corp-scale.js"];

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  if (ns.args[0] === 1) ns.ui.openTail();

  try {
    ns.singularity.upgradeHomeRam();
  } catch (e) {}

  const SPARE_SERVERS = [
    {
      name: "1-SpareServer",
      totalRam: 0,
      ram: false,
      scripts: [
        { name: "launch-fleets.js", threads: 1, args: [] },
        { name: "gang-management.js", threads: 1, args: [] },
        { name: "bladeburner.js", threads: 1, args: [] },
        { name: "Curtain/sleeve-management.js", threads: 1, args: [] },
        { name: "watchtower.js", threads: 1, args: [] },
        { name: "custom-stats.js", threads: 1, args: [] },
      ],
    },
    {
      name: "2-SpareServer",
      totalRam: 0,
      ram: false,
      scripts: [],
    },
  ];

  const HOME = {
    name: "home",
    totalRam: 0,
    ram: false,
    scripts: [
      { name: "purchaseSpareServer.js", threads: 1, args: [] },
      { name: "purchaseSpareServer.js", threads: 1, args: [] },
      { name: "train.js", threads: 1, args: [] },
      { name: "sleeves.js", threads: 1, args: ["-b"] },
      { name: "hacknet.js", threads: 1, args: [] },
      { name: "darknetCrawler.js", threads: 1, args: [] },
      // { name: "diamond-hands.js", threads: 1, args: [] },
      // { name: "aps.js", threads: 1, args: [] },
    ],
  };

  SPARE_SERVERS.forEach((s) => (s.totalRam = getTotalRam(ns, s)));
  SPARE_SERVERS.forEach((s) => (s.ram = hasEnoughRam(ns, s)));

  HOME.totalRam = getTotalRam(ns, HOME);
  HOME.ram = hasEnoughRam(ns, HOME);
  HOME.scripts[0].args = [SPARE_SERVERS[0].name, SPARE_SERVERS[0].totalRam];
  HOME.scripts[1].args = [SPARE_SERVERS[1].name, SPARE_SERVERS[1].totalRam];

  ns.tprint("GOD-EYE initializing...");

  const done = {
    torPurchased: false,
    darkWeb: false,
    backdoors: false,
    homeScripts: false,
    spareScripts: false,
  };

  function money() {
    return ns.getServerMoneyAvailable("home");
  }

  while (true) {
    if (torPurchased(ns, money())) done.torPurchased = true;
    if (handleDarkWeb(ns, money())) done.darkWeb = true;
    if (await handleBackdoors(ns)) done.backdoors = true;

    // Start "Home" scripts
    if (!done.homeScripts && HOME.ram) {
      for (const script of HOME.scripts) {
        await runscript(ns, script, HOME);
      }
      done.homeScripts = true;
    }

    // Start Spare Servers; keep retrying until all required scripts are active.
    if (!done.spareScripts) {
      done.spareScripts = await startServerScripts(ns, SPARE_SERVERS);
    }

    if (SPARE_SERVERS[1].ram) {
      await manageCorpScripts(ns, SPARE_SERVERS[1]);
    }

    if (Object.values(done).every((v) => v)) {
      ns.tprint("GOD-EYE is fully operational.");
      break;
    }

    await ns.sleep(5000);
  }
}

function torPurchased(ns, money) {
  const TOR_COST = 200_000;
  const hasTor = ns.hasTorRouter?.() ?? false;

  if (hasTor) return true;

  if (money >= TOR_COST) {
    const ok = ns.singularity.purchaseTor();
    if (ok) {
      ns.tprint("Purchased TOR router.");
      return true;
    }
  }

  return false;
}

async function runscript(ns, script, server) {
  if (ns.isRunning(script.name, server.name)) return true;

  // Copy main script + shared dependency files from home
  const filesToCopy = [
    script.name,
    "Curtain/utils.js",
    "Curtain/pirate.js",
    "Curtain/find-targets.js",
    "factionAugs.js",
    "diamond-hands.js",
    "corp-manager-core.js",
    "corp-scale.js",
    "corp-floor.js",
  ];

  const copied = await ns.scp(filesToCopy, server.name, "home");
  if (!copied) {
    ns.tprint(`SCP failed for ${script.name} -> ${server.name}`);
    return false;
  }

  const pid = ns.exec(script.name, server.name, script.threads, ...script.args);
  if (pid === 0) {
    ns.tprint(`Exec failed for ${script.name} on ${server.name}`);
    return false;
  }

  ns.tprint(`Started ${script.name} on ${server.name}`);
  return true;
}

async function manageCorpScripts(ns, server) {
  const hasCorp = ns.corporation.hasCorporation();
  const desiredScript = hasCorp ? "corp-scale.js" : "corp-floor.js";
  const otherScript = hasCorp ? "corp-floor.js" : "corp-scale.js";

  if (ns.isRunning(otherScript, server.name)) {
    ns.scriptKill(otherScript, server.name);
    ns.tprint(`Stopped ${otherScript} on ${server.name}`);
  }

  if (!ns.isRunning(desiredScript, server.name)) {
    await runscript(ns, { name: desiredScript, threads: 1, args: [] }, server);
  }
}

function getTotalRam(ns, grouping) {
  if (grouping.name === "2-SpareServer") {
    return Math.max(
      ...CORP_SCRIPTS.map((scriptName) => ns.getScriptRam(scriptName)),
    );
  }

  let total = 0;
  for (const script of grouping.scripts) {
    total += ns.getScriptRam(script.name) * script.threads;
  }
  return total;
}

function hasEnoughRam(ns, grouping) {
  return (
    ns.serverExists(grouping.name) &&
    ns.getServerMaxRam(grouping.name) >= grouping.totalRam
  );
}

async function startServerScripts(ns, servers) {
  let allStarted = true;

  for (const server of servers) {
    server.ram = hasEnoughRam(ns, server);
    if (!server.ram) {
      allStarted = false;
      continue;
    }

    for (const script of server.scripts) {
      if (!(await runscript(ns, script, server))) allStarted = false;
    }
  }

  return allStarted;
}
