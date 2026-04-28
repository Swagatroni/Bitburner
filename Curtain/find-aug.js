/** @param {NS} ns */
export async function main(ns) {
  // Combine all args into a single augmentation name
  const aug = ns.args.join(" ");

  if (!aug) {
    ns.tprint("Usage: run findAug.js <augment name>");
    return;
  }

  const factions = ns.singularity.getAugmentationFactions(aug);

  if (!factions || factions.length === 0) {
    ns.alert(`No factions sell: ${aug}`);
    return;
  }

  const output = factions.join("\n");

  ns.alert(`Factions that sell:\n"${aug}"\n\n${output}`);
}
