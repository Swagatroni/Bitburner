import { canPenetrate, canHack, getRootAccess } from "Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const target = ns.args[0];
  const origin = "home";
  if (!target) return ns.tprint("Usage: run Curtain/search.js <server>");

  // Programs map (same style you use elsewhere)
  const cracks = {
    "BruteSSH.exe": ns.brutessh,
    "FTPCrack.exe": ns.ftpcrack,
    "relaySMTP.exe": ns.relaysmtp,
    "HTTPWorm.exe": ns.httpworm,
    "SQLInject.exe": ns.sqlinject,
  };

  // Start from home so connect chain is valid
  ns.singularity.connect(origin);

  // Skip if already backdoored
  if (ns.getServer(target).backdoorInstalled) {
    ns.tprint(`${target} already backdoored.`);
    return;
  }

  // -------- pathfind (your DFS parent-map version) --------
  const ignored = ["pserv"];
  const hasIgnoredString = (text) => ignored.some((x) => text.includes(x));

  function findParentMap() {
    const visited = new Set();
    const stack = [origin];
    const parent = {};

    while (stack.length > 0) {
      const node = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node);

      if (node === target) break;

      for (const child of ns.scan(node)) {
        if (visited.has(child)) continue;
        if (hasIgnoredString(child)) continue;

        if (parent[child] === undefined) parent[child] = node;
        stack.push(child);
      }
    }
    return parent;
  }

  function reconstructPath(parentMap) {
    const path = [];
    let cur = target;

    while (cur !== origin) {
      path.push(cur);
      cur = parentMap[cur];
      if (!cur) return null;
    }
    path.reverse();
    return path;
  }

  const parentMap = findParentMap();
  const path = reconstructPath(parentMap);

  if (!path) {
    ns.tprint(`No path found from ${origin} to ${target}.`);
    return;
  }

  // Connect along the path to the target
  for (const node of path) ns.singularity.connect(node);

  // -------- ensure hacking level first --------
  if (!canHack(ns, target)) {
    ns.tprint(
      `Too low to hack/backdoor ${target}. ` +
      `Need ${ns.getServerRequiredHackingLevel(target)}, have ${ns.getHackingLevel()}.`
    );
    ns.singularity.connect(origin);
    return;
  }

  // -------- ensure root access --------
  if (!ns.hasRootAccess(target)) {
    if (!canPenetrate(ns, target, cracks)) {
      ns.tprint(
        `No root on ${target}. Need ${ns.getServerNumPortsRequired(target)} port openers.`
      );
      ns.singularity.connect(origin);
      return;
    }

    const rooted = getRootAccess(ns, target, cracks);
    if (!rooted) {
      ns.tprint(`Failed to gain root on ${target} (nuke/ports issue).`);
      ns.singularity.connect(origin);
      return;
    }
  }

  // -------- backdoor --------
  try {
    await ns.singularity.installBackdoor();
    ns.tprint(`Backdoor installed on ${target}.`);
  } catch (e) {
    ns.tprint(`Backdoor failed on ${target}: ${String(e)}`);
  }

  ns.singularity.connect(origin);
}

export function autocomplete(data, args) {
  return [...data.servers, ...data.scripts]; // This script    autocompletes the list of servers.
}
