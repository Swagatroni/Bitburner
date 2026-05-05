/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  if (ns.args.includes("--tail")) ns.ui.openTail();

  const bb = ns.bladeburner;

  // Ensure we’re in Bladeburner
  while (!bb.joinBladeburnerDivision()) await ns.sleep(5000);

  const CFG = {
    minSuccess: 0.8,
    minBlackOpSuccess: 0.9,

    staminaLow: 0.1,
    staminaRecoverTo: 0.9,

    idleMs: 300,
    actionBufferMs: 200,

    fillerWhenNoRuns: true,
    fillertask: ns.args[0] || "Field Analysis",

    bonusTimeLimit: 360000,

    // ---- AUTO SKILLS ----
    buySkills: true,
    minSkillPointsReserve: 0, // set to e.g. 10 to always keep 10 points
    skillPriority: [
      "Overclock",
      "Blade's Intuition",
      "Reaper",
      "Evasive System",
      "Digital Observer",
      "Cloak",
      "Hyperdrive",
      "Tracer",
      "Short-Circuit",
      "Datamancer",
      "Hands of Midas",
      // add "Hands of Midas" here if you want it always (or put it first)
    ],
  };

  // ---- PRIORITY LISTS (exact order you asked for) ----
  const OP_PRIORITY = [
    "Assassination",
    "Stealth Retirement Operation",
    "Raid",
    "Sting Operation",
    "Undercover Operation",
    "Investigation",
  ];

  const CT_PRIORITY = ["Retirement", "Bounty Hunter", "Tracking"];

  // ---- helpers ----
  function fmtPct(x) {
    const y = Math.max(0, Math.min(1, x));
    return `${(y * 100).toFixed(1)}%`;
  }

  function hasFormulas() {
    return !!ns.formulas?.bladeburner;
  }

  function getChance(type, name) {
    if (hasFormulas()) {
      try {
        const [min, max] = ns.formulas.bladeburner.getActionSuccessChance(
          ns,
          type,
          name,
        );
        return { min, max, avg: (min + max) / 2 };
      } catch {}
    }
    const [min, max] = bb.getActionEstimatedSuccessChance(type, name);
    return { min, max, avg: (min + max) / 2 };
  }

  function getTime(type, name) {
    const base = bb.getActionTime(type, name);
    return bb.getBonusTime() > CFG.bonusTimeLimit ? Math.floor(base / 5) : base;
  }

  function getStaminaFrac() {
    const [cur, max] = bb.getStamina();
    return max > 0 ? cur / max : 1;
  }

  function startAction(type, name) {
    try {
      bb.stopBladeburnerAction();
    } catch {}
    const ok = bb.startAction(type, name);
    if (!ok) ns.print(`Failed to start ${type}: ${name}`);
    return ok;
  }

  async function sleepForAction(type, name) {
    await ns.sleep(
      Math.max(CFG.idleMs, getTime(type, name) + CFG.actionBufferMs),
    );
  }

  // ---- AUTO SKILLS ----
  function buySkillsIfPossible() {
    if (!CFG.buySkills) return;

    // Buy as many as possible, restarting from top after each purchase
    while (true) {
      const points = bb.getSkillPoints();
      if (points <= CFG.minSkillPointsReserve) return;

      let bought = false;

      for (const skill of CFG.skillPriority) {
        let cost;
        try {
          cost = bb.getSkillUpgradeCost(skill);
        } catch {
          continue;
        }
        if (!Number.isFinite(cost) || cost <= 0) continue;

        if (points - cost < CFG.minSkillPointsReserve) continue;

        const ok = bb.upgradeSkill(skill, 1);
        if (ok) {
          ns.print(`Skill +1: ${skill}`);
          bought = true;
          break; // restart at top of priority list
        }
      }

      if (!bought) return;
    }
  }

  function qualifies(type, name, minChance) {
    // YOUR REQUIREMENT: “more than 1”
    const remaining = bb.getActionCountRemaining(type, name);
    if (remaining <= 1) return null;

    const ch = getChance(type, name);
    if (ch.min < minChance) return null;

    return { type, name, remaining, ch };
  }

  function pickFromPriority(type, priorityList, minChance) {
    const available = new Set(
      type === "Operation"
        ? bb.getOperationNames()
        : type === "Contract"
          ? bb.getContractNames()
          : [],
    );

    for (const name of priorityList) {
      if (!available.has(name)) continue; // skip if name doesn’t exist
      const q = qualifies(type, name, minChance);
      if (q) return q;
    }
    return null;
  }

  // BlackOp cooldown so it won’t spam a “won’t start” op
  const blackOpCooldownUntil = new Map();
  const onCooldown = (op) => (blackOpCooldownUntil.get(op) ?? 0) > Date.now();
  const setCooldown = (op, ms = 60_000) =>
    blackOpCooldownUntil.set(op, Date.now() + ms);

  function pickBlackOp() {
    if (typeof bb.getNextBlackOp !== "function") return null;

    const next = bb.getNextBlackOp();
    if (!next) return null;

    const opName = typeof next === "string" ? next : next.name;
    const reqRank =
      typeof next === "string" ? bb.getBlackOpRank(opName) : next.rank;

    if (!opName || onCooldown(opName)) return null;

    const remaining = bb.getActionCountRemaining("BlackOps", opName);
    if (remaining < 1) return null; // “more than 1”
    if (bb.getRank() < reqRank) return null;

    const ch = getChance("BlackOps", opName);
    if (ch.min < CFG.minBlackOpSuccess) return null;

    return { type: "BlackOps", name: opName, remaining, ch };
  }

  async function joinBladeburner() {
    while (!ns.bladeburner.inBladeburner()) {
      const joined = bb.joinBladeburnerDivision();
      if (!joined) {
        ns.print("Not in Bladeburner. Retrying...");
        await ns.sleep(10000);
      }
    }
  }

  // ---- loop ----
  while (true) {
    await joinBladeburner();

    // buy skills first each cycle
    buySkillsIfPossible();

    // stamina recovery
    let sp = getStaminaFrac();
    if (sp < CFG.staminaLow) {
      ns.print(`Stamina low (${fmtPct(sp)}). Recovering...`);
      startAction("General", "Hyperbolic Regeneration Chamber");
      while (true) {
        await sleepForAction("General", "Hyperbolic Regeneration Chamber");
        sp = getStaminaFrac();
        if (sp >= CFG.staminaRecoverTo) break;
      }
      continue;
    }

    // 1) BlackOps
    const bo = pickBlackOp();
    if (bo) {
      ns.print(
        `BLACKOP: ${bo.name} | ${fmtPct(bo.ch.min)} | rem ${ns.format.number(bo.remaining, 0)}`,
      );
      if (startAction(bo.type, bo.name)) {
        await sleepForAction(bo.type, bo.name);
        continue;
      } else {
        ns.print(`BlackOp failed to start -> cooldown: ${bo.name}`);
        setCooldown(bo.name, 60_000);
      }
    }

    // 2) Operations
    const op = pickFromPriority("Operation", OP_PRIORITY, CFG.minSuccess);
    if (op) {
      ns.print(
        `OP: ${op.name} | ${fmtPct(op.ch.min)} | rem ${ns.format.number(op.remaining, 0)}`,
      );
      startAction(op.type, op.name);
      await sleepForAction(op.type, op.name);
      continue;
    }

    // 3) Contracts
    const ct = pickFromPriority("Contract", CT_PRIORITY, CFG.minSuccess);
    if (ct) {
      ns.print(
        `CT: ${ct.name} | ${fmtPct(ct.ch.min)} | rem ${ns.format.number(ct.remaining, 0)}`,
      );
      startAction(ct.type, ct.name);
      await sleepForAction(ct.type, ct.name);
      continue;
    }

    // 4) filler
    if (CFG.fillerWhenNoRuns) {
      ns.print(`FILLER: ${CFG.fillertask}`);
      startAction("General", CFG.fillertask);
      await sleepForAction("General", CFG.fillertask);
      continue;
    }

    await ns.sleep(CFG.idleMs);
  }
}
