/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const invites = ns.singularity.checkFactionInvitations();
  invites.forEach((f) => {
    try {
      if (ns.singularity.getFactionEnemies(f).length === 0) {
        ns.singularity.joinFaction(f);
      }
    } catch (e) {}
  });
}
