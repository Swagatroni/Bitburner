import { getFactionsAugs } from "factionAugs.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  // ---- Flags ----
  // If multiple are passed, we'll use this priority:
  // blade > faction > training > hack
  const MODE =
    ns.args.includes("blade") || ns.args.includes("-b")
      ? "blade"
      : ns.args.includes("fac") || ns.args.includes("-f")
        ? "faction"
        : ns.args.includes("train") || ns.args.includes("-t")
          ? "training"
          : ns.args.includes("hack") || ns.args.includes("-h")
            ? "hack"
            : "idle";

  const TARGET_CITY = "Volhaven";
  const UNI = "ZB Institute of Technology";
  const COURSE = "Algorithms";

  const TARGET_GYM = "Millenium Fitness Gym";

  function buyAugs(sleeveIndex) {
    let money = ns.getServerMoneyAvailable("home");

    const augs = ns.sleeve
      .getSleevePurchasableAugs(sleeveIndex)
      .slice()
      .sort((a, b) => a.cost - b.cost);

    for (const aug of augs) {
      if (money < aug.cost) break;
      const ok = ns.sleeve.purchaseSleeveAug(sleeveIndex, aug.name);
      if (ok) {
        ns.print(
          `SLEEVE-${sleeveIndex} bought ${aug.name} for $${ns.formatNumber(aug.cost)}`,
        );
        money -= aug.cost;
      }
    }
  }

  function isOnTask(s, predicate) {
    const t = ns.sleeve.getTask(s);
    return t && predicate(t);
  }

  async function safeTravel(s, city) {
    try {
      ns.sleeve.travel(s, city);
    } catch {
      /* already in city or travel failed */
    }
  }

  while (true) {
    const numSleeves = ns.sleeve.getNumSleeves();
    let factionAssignments = [];

    if (MODE === "faction") {
      factionAssignments = getFactionsAugs(ns)
        .slice()
        .sort((a, b) => a.repGap - b.repGap || b.numAugs - a.numAugs);
    }

    const assignedFactions = new Set();

    for (let s = 0; s < numSleeves; s++) {
      const info = ns.sleeve.getSleeve(s);
      const currentTask = ns.sleeve.getTask(s);
      await safeTravel(s, TARGET_CITY);

      // 1) Shock recovery always wins
      if (info.shock > 0) {
        ns.sleeve.setToShockRecovery(s);
        continue;
      }

      // 2) Sync next
      if (info.sync < 100) {
        ns.sleeve.setToSynchronize(s);
        continue;
      }

      // 3) Mode behavior (only one mode will run)
      if (MODE === "hack") {
        const alreadyInClass = isOnTask(
          s,
          (t) =>
            t.type === "CLASS" && t.location === UNI && t.classType === COURSE,
        );

        if (!alreadyInClass) {
          ns.sleeve.setToUniversityCourse(s, UNI, COURSE);
        }

        continue;
      }

      if (MODE === "blade") {
        const plan = [
          "Field Analysis",
          "Hyperbolic Regeneration Chamber",
          "Training",
        ];
        const action = plan[Math.min(s, plan.length - 1)];

        const already = isOnTask(
          s,
          (t) => t.type === "BLADEBURNER" && t.actionName === action,
        );
        if (!already) ns.sleeve.setToBladeburnerAction(s, action);

        continue;
      }

      if (MODE === "training") {
        const stats = ["str", "def", "dex", "agi"];
        const stat = stats[s % stats.length];

        const already = isOnTask(
          s,
          (t) =>
            t.type === "GYM" &&
            t.location === TARGET_GYM &&
            t.gymStatType === stat,
        );
        if (!already) ns.sleeve.setToGymWorkout(s, TARGET_GYM, stat);

        continue;
      }

      if (MODE === "faction") {
        if (factionAssignments.length === 0) continue;

        let target = null;
        if (
          currentTask?.type === "FACTION" &&
          currentTask.factionWorkType === "Hacking"
        ) {
          const currentFaction = factionAssignments.find(
            (candidate) => candidate.name === currentTask.factionName,
          );
          if (currentFaction && !assignedFactions.has(currentFaction.name)) {
            target = currentFaction;
          }
        }

        if (!target) {
          target = factionAssignments.find(
            (candidate) => !assignedFactions.has(candidate.name),
          );
        }

        if (!target) continue;

        assignedFactions.add(target.name);

        const already =
          currentTask?.type === "FACTION" &&
          currentTask.factionName === target.name &&
          currentTask.factionWorkType === "Hacking";
        if (!already) ns.sleeve.setToFactionWork(s, target.name, "Hacking");

        continue;
      }
    }

    // Buy sleeve augs last (so you don’t interrupt shock/sync)
    for (let s = 0; s < numSleeves; s++) {
      const info = ns.sleeve.getSleeve(s);
      if (info.shock > 0) continue;
      buyAugs(s);
    }

    if (MODE != "idle") break;
    await ns.sleep(1000);
  }
}
