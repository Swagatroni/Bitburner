/** @param {NS} ns */
export async function main(ns) {
  // get all infiltration location names
  const getInfiltration = ns.infiltration.getInfiltration;
  const locations = ns.infiltration.getPossibleLocations().map((location) => ({
    name: location.name,
    city: location.city,
    difficulty: getInfiltration(location.name).difficulty,
    clearance: getInfiltration(location.name).maxClearanceLevel,
    soaRep: getInfiltration(location.name).reward.SoARep,
    cash: getInfiltration(location.name).reward.sellCash,
    facRep: getInfiltration(location.name).reward.tradeRep,
    seclevel: getInfiltration(location.name).startingSecurityLevel,
    score:
      getInfiltration(location.name).reward.SoARep /
      getInfiltration(location.name).maxClearanceLevel,
  }));

  locations.filter((loc) => loc.soaRep <= 1000);
  locations.filter((loc) => loc.difficulty > 1);

  // Sort locations by specified type
  let sortType = "difficulty";
  if (ns.args.includes("clearance")) sortType = "clearance";

  
  if (ns.args.includes("score")) sortType = "score";
  if (ns.args.includes("soarep")) sortType = "soarep";
  if (ns.args.includes("facrep")) sortType = "facrep";

  if (sortType === "difficulty" || sortType === "clearance") {
    locations.sort((a, b) => a[sortType] - b[sortType]);
  } else {
    locations.sort((a, b) => b[sortType] - a[sortType]);
  }

  // Print Top 10 Locations
  ns.ui.openTail();
  ns.print("Top 5 Infiltration Locations:");
  for (let i = 0; i < Math.min(5, locations.length); i++) {
    const loc = locations[i];
    ns.print(
      `\n${i + 1}. ${loc.name} (${ns.format.number(loc.score, 0)}):
    City: ${loc.city}
    Difficulty: ${loc.difficulty}
    Clearance: ${loc.clearance}
    SoA Rep: ${ns.format.number(loc.soaRep)}
    Fac Rep: ${ns.format.number(loc.facRep)} `,
    );
  }
}
