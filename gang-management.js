import { bonusMsToRealHMS } from "./Curtain/utils.js";

// Task constants
const MUG = "Mug People";
const TRAFFICKING = "Human Trafficking";
const TERRORISM = "Terrorism";
const VIGILANTE = "Vigilante Justice";
const COMBAT = "Train Combat";
const WARFARE = "Territory Warfare";

// Configuration
const ASC_THRESHOLD = 3;
const ASC_MIN_THRESHOLD = 1.1;
const ASC_TERRITORY_CURVE_POWER = 2;
const AVG_RESPECT_THRESHOLD = 10e6;
const TERRITORY_MID_THRESHOLD = 0.5;
const TERRITORY_DONE_THRESHOLD = 0.99;
const WANTED_PENALTY_THRESHOLD = 0.95;
const WANTED_PENALTY_VIGILANTE = 0.9;
const SLEEP_DURATION = 19700;

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  if (ns.args.includes("--tail") || ns.args.includes("-t")) ns.ui.openTail();

  await createGang(ns);

  // Track last known members so we can detect deaths
  let lastMembers = ns.gang.getMemberNames();
  // Used in endgame to flip between money tasks
  let endgameFlip = false;

  while (true) {
    const info = ns.gang.getGangInformation();
    const memberNames = ns.gang.getMemberNames();
    const memberCount = memberNames.length || 1;

    const territoryDone = info.territory >= TERRITORY_DONE_THRESHOLD;
    const fullGang = memberCount >= 12;
    const avgRespect = info.respect / memberCount >= AVG_RESPECT_THRESHOLD;
    const endgame = territoryDone && fullGang && avgRespect;

    // Print gang overview stats
    printGangStats(ns, info, memberCount);

    // 1. Handle deaths (may disable warfare)
    const hadDeaths = handleDeaths(ns, lastMembers);
    lastMembers = ns.gang.getMemberNames();

    // 2. Check for bonus time first - it overrides everything
    // if (ns.gang.getBonusTime() > 0) {
    // await bonusTime(ns);
    //   continue;
    // }

    // 3. Normal maintenance that should always run
    recruit(ns);
    await autoAscend(ns, endgame);
    autoPurchaseEquipment(ns, info);

    // 4. Pure money endgame: flip between TERRORISM and TRAFFICKING
    if (endgame) {
      await handleMode(ns, endgameFlip, hadDeaths, 1);
      endgameFlip = !endgameFlip;
      continue;
    }

    // 5. Mid-game money mode: territory > 50%
    if (info.territory > TERRITORY_MID_THRESHOLD) {
      await handleMode(ns, endgameFlip, hadDeaths, 0);
      endgameFlip = !endgameFlip;
      continue;
    }

    // 6. Early-game growth behavior
    await generatePower(ns);
    training(ns);
    if (!hadDeaths) manageClashes(ns);

    await ns.sleep(SLEEP_DURATION);
  }
}

async function handleMode(ns, endgameFlip, hadDeaths, bool) {
  if (bool < 0) {
  }
  if (bool === 0) {
    await generatePower(ns);
    if (!hadDeaths) manageClashes(ns);
  }
  if (bool > 0) {
    printMoneyRate(ns);
  }

  const task1 = endgameFlip ? TRAFFICKING : TERRORISM;
  const task2 = endgameFlip ? TERRORISM : TRAFFICKING;

  const members = ns.gang.getMemberNames();
  const halfPoint = Math.floor(members.length / 2);

  for (let i = 0; i < members.length; i++) {
    const task = i < halfPoint ? task1 : task2;
    assignTask(ns, members[i], task);
  }

  await ns.sleep(SLEEP_DURATION);
}

function printGangStats(ns, info, memberCount) {
  ns.print(
    `Members: ${memberCount}/12 | Territory: ${(info.territory * 100).toFixed(
      2,
    )}%`,
  );
}

function printMoneyRate(ns) {
  const info = ns.gang.getGangInformation();
  const totalMoney = ns.formatNumber(info.moneyGainRate * 5, 2);
  ns.print(`Money Rate: $${totalMoney}/sec`);
}

async function createGang(ns) {
  while (!ns.gang.inGang()) {
    const created = ns.gang.createGang("Slum Snakes");
    if (!created) {
      ns.print(`Karma: ${ns.formatNumber(ns.heart.break())}`);
      await ns.sleep(10000);
    }
  }
}

function recruit(ns) {
  if (!ns.gang.canRecruitMember()) return false;

  while (ns.gang.canRecruitMember()) {
    let idx = 1;
    let name = idx < 10 ? `THUG-0${idx}` : `THUG-${idx}`;

    while (!ns.gang.recruitMember(name)) {
      name = idx < 10 ? `THUG-0${idx}` : `THUG-${idx}`;
      idx++;
    }

    ns.print(`✓ Recruited: ${name}`);
  }

  return true;
}

async function generatePower(ns) {
  const startPower = ns.gang.getGangInformation().power;
  const members = ns.gang.getMemberNames();

  for (const name of members) assignTask(ns, name, WARFARE);

  let elapsed = 0;
  const timeout = 60000;

  while (
    ns.gang.getGangInformation().power === startPower &&
    elapsed < timeout
  ) {
    await ns.sleep(100);
    elapsed += 100;
  }
}

async function autoAscend(ns, isEndgame = false) {
  const members = ns.gang.getMemberNames();
  let ascensionCount = 0;

  const gangInfo = ns.gang.getGangInformation();
  const threshold = getAscensionThreshold(gangInfo.territory);

  ns.print(
    `Asc threshold: ${threshold.toFixed(3)}x at ${(gangInfo.territory * 100).toFixed(1)}% territory`,
  );

  for (const name of members) {
    const ascensionResult = ns.gang.getAscensionResult(name);
    if (!ascensionResult) continue;

    const avgMult =
      ((ascensionResult.str ?? 1) +
        (ascensionResult.def ?? 1) +
        (ascensionResult.dex ?? 1) +
        (ascensionResult.agi ?? 1)) /
      4;

    if (avgMult < threshold) continue;

    // Clean wanted level before ascension
    while (true) {
      const info = ns.gang.getGangInformation();
      if (
        info.wantedPenalty >= WANTED_PENALTY_THRESHOLD ||
        info.wantedLevel <= 1
      )
        break;
      setAllTasks(ns, VIGILANTE);
      await ns.sleep(1000);
    }

    const res = ns.gang.ascendMember(name);
    if (res) {
      ns.print(`⬆ Ascended: ${name} (${avgMult.toFixed(2)}x multiplier)`);
      ascensionCount++;
    }
  }

  return ascensionCount;
}

function getAscensionThreshold(territory) {
  const t = Math.max(0, Math.min(1, territory));

  // Starts at ASC_THRESHOLD when territory is 0
  // Approaches ASC_MIN_THRESHOLD as territory approaches 1
  const dynamicThreshold =
    ASC_MIN_THRESHOLD +
    (ASC_THRESHOLD - ASC_MIN_THRESHOLD) *
      Math.pow(1 - t, ASC_TERRITORY_CURVE_POWER);

  return dynamicThreshold;
}

function training(ns) {
  const info = ns.gang.getGangInformation();
  const members = ns.gang.getMemberNames();
  if (members.length === 0) return;

  // High wanted penalty: clean it up
  if (info.wantedPenalty < WANTED_PENALTY_VIGILANTE && info.wantedLevel > 2) {
    ns.print(`⚠ High Wanted Level - Vigilante Justice`);
    setAllTasks(ns, VIGILANTE);

    const chief = ns.gang.getMemberInformation(members[0]);
    const chiefTask = chief.earnedRespect > 1000 ? TERRORISM : MUG;
    assignTask(ns, members[0], chiefTask);
    return;
  }

  // General growth mode
  for (const name of members) {
    const member = ns.gang.getMemberInformation(name);
    const avgCombat = averageCombatStat(member);
    const task = avgCombat > 250 ? TERRORISM : COMBAT;

    assignTask(ns, name, task);
  }
}

function assignTask(ns, name, task) {
  const info = ns.gang.getMemberInformation(name);
  if (info.task === task) return;
  ns.gang.setMemberTask(name, task);
}

function setAllTasks(ns, task) {
  const members = ns.gang.getMemberNames();
  for (const name of members) {
    assignTask(ns, name, task);
  }
}

function handleDeaths(ns, lastMembers) {
  const current = ns.gang.getMemberNames();
  const setNow = new Set(current);
  const dead = lastMembers.filter((m) => !setNow.has(m));

  if (dead.length > 0) {
    ns.tprint(`⚠ Gang member(s) killed in clashes: ${dead.join(", ")}`);
    // Turn off warfare so we can rebuild
    ns.gang.setTerritoryWarfare(false);
  }

  return dead.length > 0;
}

function manageClashes(ns) {
  const info = ns.gang.getGangInformation();
  const members = ns.gang.getMemberNames();

  const knownGangs = [
    "Slum Snakes",
    "Tetrads",
    "The Syndicate",
    "The Dark Army",
    "Speakers for the Dead",
    "NiteSec",
    "The Black Hand",
  ];

  const others = ns.gang.getOtherGangInformation();
  const enemies = knownGangs
    .filter((g) => g !== info.faction)
    .filter((g) => others[g]?.power > 10)
    .filter((g) => others[g]?.territory > 0);

  if (enemies.length === 0) {
    ns.gang.setTerritoryWarfare(false);
    return;
  }

  let sumChance = 0;
  for (const g of enemies) {
    if (g.territory <= 0) continue;
    sumChance += ns.gang.getChanceToWinClash(g);
  }
  const avgChance = sumChance / enemies.length;

  if (avgChance >= 0.75) {
    ns.gang.setTerritoryWarfare(true);
    ns.print(`Warfare: ENABLED (${(avgChance * 100).toFixed(1)}% avg)`);
  } else {
    ns.gang.setTerritoryWarfare(false);
    ns.print(`Warfare: DISABLED (${(avgChance * 100).toFixed(1)}% avg)`);
  }
}

function averageCombatStat(member) {
  return (member.str + member.def + member.dex + member.agi) / 4;
}

function autoPurchaseEquipment(ns, gangInfo) {
  const allEquip = ns.gang.getEquipmentNames();
  const rawItems = allEquip
    .map((name) => ({
      name,
      type: ns.gang.getEquipmentType(name),
      cost: ns.gang.getEquipmentCost(name),
    }))
    .filter((e) => e.cost > 0 && Number.isFinite(e.cost));

  if (rawItems.length === 0) {
    ns.print("⚠ No equipment available for purchase");
    return 0;
  }

  const typePriority = gangInfo.isHacking
    ? ["Rootkit", "Weapon", "Armor", "Augmentation"]
    : ["Vehicle", "Armor", "Weapon", "Augmentation"];

  const typeRank = (t) => {
    const idx = typePriority.indexOf(t);
    return idx === -1 ? typePriority.length : idx;
  };

  rawItems.sort((a, b) => {
    const pa = typeRank(a.type);
    const pb = typeRank(b.type);
    if (pa !== pb) return pa - pb;
    return a.cost - b.cost;
  });

  const members = ns.gang.getMemberNames();
  let purchaseCount = 0;
  let totalSpent = 0;
  const maxPurchasesPerCycle = 50;

  // Round-robin purchase until no one needs anything
  for (let round = 0; round < maxPurchasesPerCycle; round++) {
    let purchasedThisRound = false;

    for (const member of members) {
      const mi = ns.gang.getMemberInformation(member);
      const owned = new Set([
        ...(mi.upgrades || []),
        ...(mi.augmentations || []),
      ]);

      // Find cheapest missing item
      let cheapestMissing = null;
      for (const item of rawItems) {
        if (owned.has(item.name)) continue;
        cheapestMissing = item;
        break;
      }

      if (cheapestMissing) {
        if (ns.gang.purchaseEquipment(member, cheapestMissing.name)) {
          ns.print(
            `💰 ${member}: ${cheapestMissing.name} ($${ns.formatNumber(
              cheapestMissing.cost,
            )})`,
          );
          purchaseCount++;
          totalSpent += cheapestMissing.cost;
          purchasedThisRound = true;
        }
        // If we can't afford it, this member is done but continue with other members
      }
    }

    // If no one bought anything this round, everyone has everything they can get
    if (!purchasedThisRound) break;
  }

  if (purchaseCount > 0) {
    ns.print(`Total: ${purchaseCount} items, $${ns.formatNumber(totalSpent)}`);
  }

  return purchaseCount;
}

async function bonusTime(ns) {
  let bonusMs = ns.gang.getBonusTime();
  if (bonusMs < 5000) return;

  // Calculate the bonus time ratio
  const startBonusMs = bonusMs;
  await ns.sleep(1000);
  const afterOneSec = ns.gang.getBonusTime();
  const bonusDecreaseMs = startBonusMs - afterOneSec;
  const ratio = bonusDecreaseMs / 1000; // How much bonus time (in seconds) per real second

  ns.print(`⏱ BONUS TIME: All members on Territory Warfare`);
  ns.print(`   Ratio: ${ratio.toFixed(1)}x bonus time per real second`);

  let printCounter = 1; // Start at 1 since we already slept once
  const PRINT_INTERVAL = 5; // Print every 30 seconds

  bonusMs = afterOneSec;
  while (bonusMs > 2000) {
    // Keep all members on territory warfare during bonus time
    setAllTasks(ns, WARFARE);

    // Only print status every 30 seconds to reduce log spam
    if (printCounter % PRINT_INTERVAL === 0) {
      const human = bonusMsToRealHMS(bonusMs);
      ns.print(`⏱ Bonus time remaining (real): ${human}`);
    }

    autoPurchaseEquipment(ns, ns.gang.getGangInformation());

    printCounter++;
    await ns.sleep(1000);
    bonusMs = ns.gang.getBonusTime();
  }

  ns.print(`✓ Bonus time complete`);
}
