/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  // Optional: force a specific crime for everyone
  const fixedCrime = ns.args[0] || null;

  const crimes = [
    "Homicide",
    "Traffick Arms",
    "Bond Forgery",
    "Deal Drugs",
    "Larceny",
    "Mug",
    "Rob Store",
    "Shoplift",
  ];

  function chooseBestCrime() {
    let bestCrime = crimes[0];

    for (const crime of crimes) {
      const chance = ns.singularity.getCrimeChance(crime) < 0.8;
      if (chance) continue;

      return crime;
    }
  }

  while (true) {
    // 1) Which crime should the main body do?
    const mainCrime = fixedCrime || chooseBestCrime();

    const crimeTime = ns.singularity.commitCrime(mainCrime, false);
    ns.print(
      `Main body committing: ${mainCrime}, duration: ${crimeTime / 1000}s`,
    );

    if (mainCrime === "Homicide") ns.kill(ns.pid);

    // Sleep until the main crime finishes (+ small buffer)
    await ns.sleep(crimeTime + 20);
  }
}
