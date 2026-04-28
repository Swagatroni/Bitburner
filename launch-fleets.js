import { getPotentialTargets, getStrategy } from "./Curtain/find-targets.js";
import {
  getNetworkNodes,
  canPenetrate,
  getRootAccess,
  hasRam,
  getThresholds,
} from "./Curtain/utils.js";

export async function main(ns) {
  ns.disableLog("ALL");
  const useHacknet = ns.args[0] === "1";
  var homeServ = "home";
  var attackDelay = 10; // time (ms) between attacks

  var virus = "Curtain/pirate.js";
  var virusRam = ns.getScriptRam(virus);

  var actions = {
    w: "weaken",
    h: "hack",
    g: "grow",
  };

  var cracks = {
    "BruteSSH.exe": ns.brutessh,
    "FTPCrack.exe": ns.ftpcrack,
    "relaySMTP.exe": ns.relaysmtp,
    "HTTPWorm.exe": ns.httpworm,
    "SQLInject.exe": ns.sqlinject,
  };
  async function getShips() {
    const nodes = getNetworkNodes(ns);

    const servers = nodes.filter((node) => {
      if (node === homeServ) return false; // skip home & hacknet
      if (node.includes("SpareServer")) return false;
      if (useHacknet || node.includes("hacknet-server")) return false;

      // pservs are handled by canPenetrate: they require 0 ports there
      return canPenetrate(ns, node, cracks) && hasRam(ns, node, virusRam);
    });

    // Prepare the servers to have root access and scripts
    for (const serv of servers) {
      if (!ns.hasRootAccess(serv)) {
        getRootAccess(ns, serv, cracks);
      }
      if (!ns.fileExists(virus, serv)) {
        await ns.scp(virus, serv);
      }
    }

    // ships[server] = available THREADS
    return servers.reduce((acc, node) => {
      const maxRam = ns.getServerMaxRam(node);
      const usedRam = ns.getServerUsedRam(node);
      const freeRam = maxRam - usedRam;
      acc[node] = Math.floor(freeRam / virusRam);
      return acc;
    }, {});
  }

  function getDelayForActionSeq(seq, node) {
    const server = ns.getServer(node);
    const player = ns.getPlayer(); // refresh here

    const wTime = ns.formulas.hacking.weakenTime(server, player);
    const gTime = ns.formulas.hacking.growTime(server, player);
    const hTime = ns.formulas.hacking.hackTime(server, player);

    const timing = { w: wTime, g: gTime, h: hTime };

    const baseTimes = seq.map((_, i) => attackDelay * i);
    const actionStart = seq.map((action, i) => baseTimes[i] - timing[action]);
    const execStart = Math.min(...actionStart);
    const delays = seq.map((_, i) => Math.abs(execStart - actionStart[i]));

    return delays;
  }

  function getMaxThreads(node, strategy) {
    const { moneyThresh, secThresh } = getThresholds(ns, node);

    const maxMoney = ns.getServerMaxMoney(node);
    let currMoney = ns.getServerMoneyAvailable(node);
    const currSec = ns.getServerSecurityLevel(node);

    // avoid weirdness with 0 money
    if (currMoney < 1) currMoney = 1;

    const hackFraction = strategy.hackFraction || 0;

    // --- HACK THREADS ---
    const hackEffect = ns.hackAnalyze(node); // fraction of current money per thread
    let hackThreads = 0;

    if (hackFraction > 0 && hackEffect > 0) {
      const effectiveMoney = Math.min(moneyThresh, currMoney);
      const targetSteal = effectiveMoney * hackFraction; // how much cash we *want* to steal
      const perThread = hackEffect * currMoney; // expected steal per thread

      if (perThread > 0) {
        hackThreads = Math.floor(targetSteal / perThread);
      }
    }

    if (!Number.isFinite(hackThreads) || hackThreads < 0) hackThreads = 0;

    // Rough estimate of post-hack money for grow calc
    const expectedPostHack = Math.max(
      1,
      currMoney - hackThreads * hackEffect * currMoney,
    );

    // --- GROW THREADS ---
    let growThreads = 0;

    // If we're below thresh *or* we plan to hack, figure out how much growth we need
    if (expectedPostHack < moneyThresh) {
      const growMul = moneyThresh / expectedPostHack;
      if (growMul > 1) {
        growThreads = Math.ceil(ns.growthAnalyze(node, growMul));
      }
    } else if (ns.getServerMoneyAvailable(node) < 1 && hackThreads === 0) {
      // seed dead servers with at least 1 grow thread
      growThreads = 1;
    }

    if (!Number.isFinite(growThreads) || growThreads < 0) growThreads = 0;

    // --- WEAKEN THREADS ---
    const weakenEffect = ns.weakenAnalyze(1);
    const secDelta = currSec - secThresh;
    let weakenThreads = 0;

    if (secDelta > 0 && weakenEffect > 0) {
      weakenThreads = Math.ceil(secDelta / weakenEffect);
    }

    if (!Number.isFinite(weakenThreads) || weakenThreads < 0) weakenThreads = 0;

    return {
      grow: growThreads,
      weaken: weakenThreads,
      hack: hackThreads,
      total: growThreads + weakenThreads + hackThreads,
    };
  }

  function getRequirements(node) {
    const strategy = getStrategy(ns, node);
    const delays = getDelayForActionSeq(strategy.seq, node);
    const maxThreads = getMaxThreads(node, strategy);
    return {
      delays,
      maxThreads,
      strategy,
    };
  }

  // FLEET HELPER FUNCTIONS
  function getTotalThreads(servers) {
    return Object.values(servers).reduce((sum, threads) => sum + threads, 0);
  }

  function getAllocation(reqs, ships) {
    var totalThreads = getTotalThreads(ships);
    var { maxThreads, strategy } = reqs;
    var numWeaken = 0;
    var numGrow = 0;
    var numHack = 0;
    if (maxThreads.total < totalThreads) {
      numWeaken = maxThreads.weaken;
      numGrow = maxThreads.grow;
      numHack = maxThreads.hack;
    } else {
      var { seq, allocation } = strategy;
      for (var i = 0; i < seq.length; i++) {
        var action = seq[i];
        var portion = allocation[i];
        if (action === "w") {
          numWeaken = Math.floor(totalThreads * portion);
        } else if (action === "g") {
          numGrow = Math.floor(totalThreads * portion);
        } else {
          numHack = Math.floor(totalThreads * portion);
        }
      }
    }
    return {
      numWeaken,
      numGrow,
      numHack,
    };
  }

  function readyFleets(reqs, contract, ships) {
    const { strategy, delays } = reqs;
    const { seq } = strategy;

    // Allocate tasks to servers with the largest thread capacity first
    const sortedShips = Object.keys(ships).sort((a, b) => ships[b] - ships[a]);
    const assigned = {};
    const fleets = [];

    for (let i = 0; i < seq.length; i++) {
      const delay = delays[i];
      const sym = seq[i]; // 'w' | 'g' | 'h'
      const action = actions[sym];
      const maxThreads = contract[sym] || 0; // total threads for this action

      if (maxThreads <= 0) {
        // nothing to do for this action in this cycle
        continue;
      }

      const fleet = {
        action,
        ships: [],
      };

      let usedThreads = 0;

      for (const serv of sortedShips) {
        if (usedThreads >= maxThreads) break;
        if (assigned[serv]) continue; // skip already-assigned servers

        const capacity = ships[serv]; // capacity in THREADS
        if (capacity <= 0) continue;

        let threads = Math.min(capacity, maxThreads - usedThreads);
        if (threads <= 0) continue;

        usedThreads += threads;
        assigned[serv] = {
          used: threads,
          left: capacity - threads,
        };

        fleet.ships.push({
          serv,
          threads,
          delay,
        });
      }

      // Only push non-empty fleets
      if (fleet.ships.length > 0) {
        fleets.push(fleet);
      }
    }

    return {
      fleets,
      assigned,
    };
  }

  // Create a fleet of servers that can be launched to target
  function createFleets(reqs, ships) {
    var { numWeaken, numGrow, numHack } = getAllocation(reqs, ships);
    // specifies how many threads we will allocate per operation
    var contract = {
      w: numWeaken,
      g: numGrow,
      h: numHack,
    };
    // Assign fleets based on the contract
    return readyFleets(reqs, contract, ships);
  }

  var tick = 50; // Increased sleep time to reduce CPU load

  while (true) {
    var ships = await getShips();

    var availShips = Object.keys(ships).length;
    if (availShips === 0) {
      await ns.sleep(tick);
      continue;
    }
    var targets = getPotentialTargets(ns);
    for (var target of targets) {
      var targetNode = target.node;
      var reqs = getRequirements(targetNode);
      var { fleets, assigned } = createFleets(reqs, ships);
      // SET SAIL!
      for (var fleet of fleets) {
        var action = fleet.action;
        for (var ship of fleet.ships) {
          var pid = 0;
          var maxPidAttempts = 100; // Prevent infinite loop
          while (
            ns.exec(
              virus,
              ship.serv,
              ship.threads,
              action,
              targetNode,
              ship.delay,
              pid,
            ) === 0 &&
            pid < maxPidAttempts
          ) {
            pid++;
          }
          if (pid >= maxPidAttempts) {
            ns.print(
              `WARNING: Could not execute on ${ship.serv} after ${maxPidAttempts} attempts`,
            );
            continue;
          }
          await ns.sleep(10); // Small delay between executions
        }
      }
      // Delete assigned from list of fleets
      for (var ship of Object.keys(assigned)) {
        var usage = assigned[ship];
        if (usage.left <= 1) delete ships[ship];
        else ships[ship] = usage.left;
      }

      // Early exit if no more ships to assign
      if (Object.keys(ships).length <= 0) {
        break;
      }
    }
    await ns.sleep(tick);
  }
}

export function autocomplete(data, args) {
  return [...data.servers, ...data.scripts];
}
