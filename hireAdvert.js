/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const CORP = ns.corporation;
  const delay = 100;

  class Division {
    constructor(name) {
      this.name = name;
      this.adverts = CORP.getHireAdVertCount(name);
    }
  }

  async function hireAdverts(division, count) {
    while (CORP.getHireAdVertCount(division) < count) {
      if (CORP.getCorporation().funds > CORP.getHireAdVertCost(division)) {
        CORP.hireAdVert(division);
      }
      await ns.sleep(10);
    }
  }

  function inStep(divisions) {
    let allSame = true;
    let i = divisions[0].adverts;

    for (const division of divisions) {
      let count = division.adverts;
      if (count !== i) {
        allSame = false;
        break;
      }
    }
    return allSame;
  }

  function getDivivions() {
    const divisions = [];

    for (const div of CORP.getCorporation().divisions)
      divisions.push(new Division(div));

    divisions.sort((a, b) => b.adverts - a.adverts);
    return divisions;
  }

  while (true) {
    const divs = getDivivions();
    let count = divs[0].adverts + 1;

    if (inStep(divs)) {
      for (const division of divs) {
        await hireAdverts(division.name, count);
      }
      ns.print(`Hired adverts for all divisions. Count: ${count}`);
    } else {
      for (const division of divs) {
        await hireAdverts(division.name, count - 1);
      }
    }

    await ns.sleep(delay);
  }
}
