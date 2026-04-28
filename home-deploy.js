import { getPotentialTargets, getStrategy } from "./Curtain/find-targets.js";
import { getThresholds } from "./Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const home = "home";
  const virus = "Curtain/pirate.js";
  const virusRam = ns.getScriptRam(virus);
  const attackDelay = 10; // ms spacing between actions
  const cores = ns.getServer(home).cpuCores;


  // Arg0: GB of RAM to reserve on home (default 32GB)
  const reserveRam = Number(ns.args[0]) || 32;
  // Arg1: priority field for getPotentialTargets (default "revYield")
  const priority = ns.args[1] || "revYield";

  const actions = {
    w: "weaken",
    g: "grow",
    h: "hack",
  };

  function getFreeThreads() {
    const maxRam = ns.getServerMaxRam(home);
    const usedRam = ns.getServerUsedRam(home);
    const freeRam = Math.max(0, maxRam - usedRam - reserveRam);
    return Math.floor(freeRam / virusRam);
  }

  function getDelayForActionSeq(seq, node) {
    const server = ns.getServer(node);
    const player = ns.getPlayer();

    const wTime = ns.formulas.hacking.weakenTime(server, player);
    const gTime = ns.formulas.hacking.growTime(server, player);
    const hTime = ns.formulas.hacking.hackTime(server, player);

    const timing = { w: wTime, g: gTime, h: hTime };

    const baseTimes = seq.map((_, i) => attackDelay * i);
    const actionStart = seq.map((sym, i) => baseTimes[i] - timing[sym]);
    const execStart = Math.min(...actionStart);
    const delays = seq.map((_, i) => Math.abs(execStart - actionStart[i]));
    return delays;
  }

  function getMaxThreads(node, strategy) {
    const { moneyThresh, secThresh } = getThresholds(ns, node);

    const maxMoney = ns.getServerMaxMoney(node);
    let currMoney = ns.getServerMoneyAvailable(node);
    const currSec = ns.getServerSecurityLevel(node);

    if (currMoney < 1) currMoney = 1;

    const hackFraction = strategy.hackFraction || 0;

    // HACK threads
    const hackEffect = ns.hackAnalyze(node);
    let hackThreads = 0;
    if (hackFraction > 0 && hackEffect > 0) {
      const effectiveMoney = Math.min(moneyThresh, currMoney);
      const targetSteal = effectiveMoney * hackFraction;
      const perThread = hackEffect * currMoney;
      if (perThread > 0) {
        hackThreads = Math.floor(targetSteal / perThread);
      }
    }
    if (!Number.isFinite(hackThreads) || hackThreads < 0) hackThreads = 0;

    // Expected post-hack money for grow calc
    const expectedPostHack = Math.max(
      1,
      currMoney - hackThreads * hackEffect * currMoney
    );

    // GROW threads
    let growThreads = 0;
    if (expectedPostHack < moneyThresh) {
      const growMul = moneyThresh / expectedPostHack;
      if (growMul > 1) {
        growThreads = Math.ceil(ns.growthAnalyze(node, growMul, cores));
      }
    } else if (ns.getServerMoneyAvailable(node) < 1 && hackThreads === 0) {
      // seed dead servers
      growThreads = 1;
    }
    if (!Number.isFinite(growThreads) || growThreads < 0) growThreads = 0;

    // WEAKEN threads
    const weakenEffect = ns.weakenAnalyze(1, cores);
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
    return { strategy, delays, maxThreads };
  }

  while (true) {
    const freeThreads = getFreeThreads();
    if (freeThreads <= 0) {
      await ns.sleep(10);
      continue;
    }

    const targets = getPotentialTargets(ns, priority);
    if (!targets || targets.length === 0) {
      await ns.sleep(50);
      continue;
    }

    const targetNode = targets[0].node; // best target
    const { strategy, delays, maxThreads } = getRequirements(targetNode);
    const { seq, allocation } = strategy;

    // --- Efficient scaling of ideal threads -------------------------
    function scaleThreads(maxThreads, freeThreads) {
      const { weaken, grow, hack, total } = maxThreads;

      if (freeThreads <= 0 || total <= 0) {
        return { w: 0, g: 0, h: 0 };
      }

      // If home can run a full “proper” batch — do it
      if (total <= freeThreads) {
        return { w: weaken, g: grow, h: hack };
      }

      // Otherwise scale ideal ratios proportionally
      const scale = freeThreads / total;

      let w = Math.floor(weaken * scale);
      let g = Math.floor(grow * scale);
      let h = Math.floor(hack * scale);

      // Use any leftover threads (because of floor()) on most valuable action
      let used = w + g + h;
      let leftover = freeThreads - used;

      while (leftover > 0) {
        // priority: hack → grow → weaken
        if (hack > 0) h++;
        else if (grow > 0) g++;
        else w++;
        leftover--;
      }

      return { w, g, h };
    }

    const contract = scaleThreads(maxThreads, freeThreads);


    // Launch from home only
    for (let i = 0; i < seq.length; i++) {
      const sym = seq[i];
      const delay = delays[i];
      const action = actions[sym];
      const threads = contract[sym] || 0;
      if (threads <= 0) continue;

      const pidTag = i; // just a tag for logs in pirate.js
      const pid = ns.exec(
        virus,
        home,
        threads,
        action,
        targetNode,
        delay,
        pidTag
      );
      if (pid === 0) {
        ns.print(
          `home-deploy: Failed to exec ${virus} (${action}) on ${targetNode} with ${threads} threads.`
        );
      }
      await ns.sleep(10);
    }

    // small delay before next cycle
    await ns.sleep(10);
  }
}

export function autocomplete(data, args) {
  return [...data.scripts];
}
