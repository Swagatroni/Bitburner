/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  let task = ns.args[0];

  if (!task) {
    ns.tprint("Usage: run gang-management.js <task>");
    return;
  }

  if (task === "warfare") task = "Territory Warfare";
  else if (task === "terror") task = "Terrorism";
  else if (task === "train" || task === "combat") task = "Train Combat";
  else if (task === "human") task = "Human Trafficking";
  else if (task === "mug") task = "Mug People";
  else if (task === "vigilante" || task === "justice")
    task = "Vigilante Justice";

  while (1) {
    const members = ns.gang.getMemberNames();
    for (const name of members) ns.gang.setMemberTask(name, task);

    await ns.sleep(5000);
  }
}
