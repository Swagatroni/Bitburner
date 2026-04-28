import { getPservs } from "./Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const home = "home";

  // Arg0: mode (s|h|w|g|c|p)
  // Arg1: number of pservs to use (optional, default: all)
  // Arg2: target server (optional, default: n00dles)
  const mode = (ns.args[0] || "s").toString().toLowerCase();
  let servCount = ns.args[1];
  const target = ns.args[2] || "n00dles";

  let script;
  switch (mode) {
    case "s":
      script = "EXP/share.js";
      break;
    case "h":
      script = "EXP/hack.js";
      break;
    case "w":
      script = "EXP/weaken.js";
      break;
    case "g":
      script = "EXP/grow.js";
      break;
    case "c":
      script = "crime-auto.js";
      break;
    case "p":
      script = "Curtain/profit.js";
      break;
    default:
      ns.tprint(
        "Usage: run farmEXP.js [S|H|W|G|C|P] <# of pservs> <target server>"
      );
      return;
  }

  // Make sure script exists on home
  if (!ns.fileExists(script, home)) {
    ns.tprint(`ERROR: ${script} not found on ${home}.`);
    return;
  }

  // Get existing purchased servers
  let pservs = getPservs(ns).filter((s) => ns.serverExists(s));

  if (pservs.length === 0) {
    ns.tprint("No purchased servers found, using home only.");
  }

  // Default: use all pservs (+ home as extra slot)
  if (servCount === undefined) {
    servCount = pservs.length || 1;
  }

  // Ensure numeric
  servCount = Number(servCount);
  if (!Number.isFinite(servCount) || servCount <= 0) {
    ns.tprint("Second arg must be a positive number of servers to use.");
    return;
  }

  // We’ll allow using pservs + 1 extra slot for home
  const maxSlots = pservs.length + 1;
  servCount = Math.min(servCount, maxSlots);

  for (let i = 0; i < servCount; i++) {
    // First pservs.length slots → pservs, then home
    const server = i < pservs.length ? pservs[i] : home;

    if (server !== home) {
      // Copy script and wipe existing processes
      ns.scp(script, server, home);
      ns.killall(server);
    }

    const maxRam = ns.getServerMaxRam(server);
    const usedRam = ns.getServerUsedRam(server);
    const freeRam = maxRam - usedRam;
    const scriptRam = ns.getScriptRam(script);

    const threads = Math.floor(freeRam / scriptRam);

    if (threads <= 0) {
      ns.tprint(`No free RAM on ${server} for ${script}`);
      continue;
    }

    const pid = ns.exec(script, server, threads, target);
    if (pid === 0) {
      ns.tprint(
        `Failed to exec ${script} on ${server} (${threads} threads, target=${target})`
      );
    }
  }
}

export function autocomplete(data, args) {
  return [...data.servers, ...data.scripts];
}
