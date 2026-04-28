/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const CORP = ns.corporation;
  const CITIES = [
    "Sector-12",
    "Aevum",
    "Volhaven",
    "Chongqing",
    "New Tokyo",
    "Ishima",
  ];
  const START_CITY = "Sector-12";
  const CORP_NAME = "Wayne Enterprises";
  const MIN_EMPLOYEES_PER_CITY = 6;
  const CITY_READY_EMPLOYEES = 18;
  const CITY_READY_WAREHOUSE_SIZE = 500;
  const OFFICE_UPGRADE_STEP = 6;
  const OFFICE_UPGRADE_CASH_BUFFER = 5e9;
  const WAREHOUSE_UPGRADE_CASH_BUFFER = 2e9;
  const CITY_EXPANSION_CASH_BUFFER = 5e9;
  const CORP_CREATION_COST = 150e9;

  const MATERIAL_RESERVE = 0.85;
  const MATERIAL_SIZE = {
    Hardware: 0.06,
    Robots: 0.5,
    "AI Cores": 0.1,
    "Real Estate": 0.005,
  };

  class Division {
    constructor(
      Name,
      Industry,
      Outputs,
      Hardware,
      Robots,
      AICores,
      RealEstate,
    ) {
      const sum = Hardware + Robots + AICores + RealEstate;
      this.Name = Name;
      this.Industry = Industry;
      this.Outputs = Outputs;
      this.HardwarePercent = Hardware / sum;
      this.RobotsPercent = Robots / sum;
      this.AICoresPercent = AICores / sum;
      this.RealEstatePercent = RealEstate / sum;
    }
  }

  // Add more divisions to this array as needed
  const DIVISIONS = [
    new Division("Aggie", "Agriculture", ["Food", "Plants"], 4, 5, 5, 14),
    new Division("Marlboro1", "Tobacco", [], 2, 2, 1, 3),
    new Division("Marlboro2", "Tobacco", [], 2, 2, 1, 3),
    new Division("Marlboro3", "Tobacco", [], 2, 2, 1, 3),
  ];

  // --- Setup ---

  async function waitForCorpCreationFunds() {
    let alertedReady = false;
    while (true) {
      if (!alertedReady && ns.getPlayer().money >= CORP_CREATION_COST) {
        alertedReady = true;
      }
      if (ns.getPlayer().money >= CORP_CREATION_COST) return;
      await ns.sleep(10000);
    }
  }

  function createCorporation() {
    if (!CORP.hasCorporation()) {
      CORP.createCorporation(CORP_NAME, true);
      ns.tprint(`Corporation created: ${CORP_NAME}`);
    }
  }

  function createDivisionIfMissing(division) {
    const corp = CORP.getCorporation();
    if (corp.divisions.includes(division.Name)) return true;

    try {
      CORP.expandIndustry(division.Industry, division.Name);
      ns.tprint(`Division '${division.Name}' created.`);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function waitAndBuySmartSupply() {
    while (!CORP.hasUnlock("Smart Supply")) {
      const unlockCost = CORP.getUnlockUpgradeCost("Smart Supply");
      if (CORP.getCorporation().funds >= unlockCost) {
        CORP.unlockUpgrade("Smart Supply");
        ns.tprint("Purchased unlock: Smart Supply");
        return;
      }
      await ns.sleep(10000);
    }
  }

  function getTargetEmployees(funds) {
    if (funds >= 1e12) return 30;
    if (funds >= 2e11) return 24;
    return CITY_READY_EMPLOYEES;
  }

  function getMaterialTargets(division, city) {
    const warehouseSize = CORP.getWarehouse(division.Name, city).size;
    const storage = warehouseSize * MATERIAL_RESERVE;
    return {
      hardware: Math.floor(
        (storage * division.HardwarePercent) / MATERIAL_SIZE.Hardware,
      ),
      robots: Math.floor(
        (storage * division.RobotsPercent) / MATERIAL_SIZE.Robots,
      ),
      aiCores: Math.floor(
        (storage * division.AICoresPercent) / MATERIAL_SIZE["AI Cores"],
      ),
      realEstate: Math.floor(
        (storage * division.RealEstatePercent) / MATERIAL_SIZE["Real Estate"],
      ),
    };
  }

  function isSellingConfigured(division, city) {
    for (const material of division.Outputs) {
      const mat = CORP.getMaterial(division.Name, city, material);
      if (String(mat.desiredSellAmount) !== "MAX") return false;
      if (String(mat.desiredSellPrice) !== "MP") return false;
    }
    return true;
  }

  function isSmartSupplyEnabled(division, city) {
    if (!CORP.hasUnlock("Smart Supply")) return false;
    try {
      const wh = CORP.getWarehouse(division.Name, city);
      return Boolean(wh.smartSupplyEnabled);
    } catch (_) {
      return false;
    }
  }

  function areBonusMaterialsAllocated(division, city) {
    const targets = getMaterialTargets(division, city);
    const hw = CORP.getMaterial(division.Name, city, "Hardware").stored;
    const rb = CORP.getMaterial(division.Name, city, "Robots").stored;
    const ai = CORP.getMaterial(division.Name, city, "AI Cores").stored;
    const re = CORP.getMaterial(division.Name, city, "Real Estate").stored;

    // Allow small drift because storage target shifts as warehouse size changes.
    return (
      hw >= targets.hardware * 0.85 &&
      rb >= targets.robots * 0.85 &&
      ai >= targets.aiCores * 0.85 &&
      re >= targets.realEstate * 0.85
    );
  }

  function isCityOperational(division, city) {
    const office = CORP.getOffice(division.Name, city);
    if (office.numEmployees < CITY_READY_EMPLOYEES) return false;
    if (!CORP.hasWarehouse(division.Name, city)) return false;

    const warehouse = CORP.getWarehouse(division.Name, city);
    if (warehouse.size < CITY_READY_WAREHOUSE_SIZE) return false;
    if (!isSmartSupplyEnabled(division, city)) return false;
    if (!isSellingConfigured(division, city)) return false;
    if (!areBonusMaterialsAllocated(division, city)) return false;

    return true;
  }

  function setEvenJobAssignments(divisionName, city, employeeCount) {
    const allJobs = [
      "Operations",
      "Engineer",
      "Business",
      "Management",
      "Research & Development",
      "Intern",
    ];
    const base = Math.floor(employeeCount / allJobs.length);
    let extra = employeeCount % allJobs.length;

    for (const job of allJobs) {
      CORP.setAutoJobAssignment(divisionName, city, job, 0);
    }

    for (const job of allJobs) {
      const assign = base + (extra > 0 ? 1 : 0);
      CORP.setAutoJobAssignment(divisionName, city, job, assign);
      if (extra > 0) extra -= 1;
    }
  }

  function manageOfficeAndWarehouse(division, city) {
    let office = CORP.getOffice(division.Name, city);
    const funds = CORP.getCorporation().funds;
    const desiredEmployees = getTargetEmployees(funds);

    if (office.size < desiredEmployees) {
      const growBy = Math.min(
        OFFICE_UPGRADE_STEP,
        desiredEmployees - office.size,
      );
      const cost = CORP.getOfficeSizeUpgradeCost(division.Name, city, growBy);
      if (funds > cost + OFFICE_UPGRADE_CASH_BUFFER) {
        CORP.upgradeOfficeSize(division.Name, city, growBy);
        office = CORP.getOffice(division.Name, city);
      }
    }

    while (office.numEmployees < Math.min(office.size, desiredEmployees)) {
      CORP.hireEmployee(division.Name, city);
      office = CORP.getOffice(division.Name, city);
    }

    setEvenJobAssignments(division.Name, city, office.numEmployees);

    const warehouse = CORP.hasWarehouse(division.Name, city)
      ? CORP.getWarehouse(division.Name, city)
      : null;
    if (!warehouse) {
      const whCost = CORP.getConstants().warehouseInitialCost;
      if (
        CORP.getCorporation().funds >
        whCost + WAREHOUSE_UPGRADE_CASH_BUFFER
      ) {
        CORP.purchaseWarehouse(division.Name, city);
      }
      return;
    }

    if (warehouse.sizeUsed / warehouse.size > 0.9) {
      const upCost = CORP.getUpgradeWarehouseCost(division.Name, city, 1);
      if (
        CORP.getCorporation().funds >
        upCost + WAREHOUSE_UPGRADE_CASH_BUFFER
      ) {
        CORP.upgradeWarehouse(division.Name, city, 1);
      }
    }

    if (warehouse.size < CITY_READY_WAREHOUSE_SIZE) {
      const upCost = CORP.getUpgradeWarehouseCost(division.Name, city, 1);
      if (
        CORP.getCorporation().funds >
        upCost + WAREHOUSE_UPGRADE_CASH_BUFFER
      ) {
        CORP.upgradeWarehouse(division.Name, city, 1);
      }
    }
  }

  function setupSellingAndSmartSupply(division, city) {
    if (!CORP.hasWarehouse(division.Name, city)) return;

    if (CORP.hasUnlock("Smart Supply")) {
      CORP.setSmartSupply(division.Name, city, true);
    }

    for (const material of division.Outputs) {
      CORP.sellMaterial(division.Name, city, material, "MAX", "MP");
    }

    const divInfo = CORP.getDivision(division.Name);
    if (divInfo.makesProducts) {
      for (const productName of divInfo.products) {
        try {
          CORP.sellProduct(division.Name, city, productName, "MAX", "MP", true);
        } catch (_) {}
      }
    }
  }

  function tryExpandIfOperational(division) {
    const divInfo = CORP.getDivision(division.Name);
    const nextCity = CITIES.find((city) => !divInfo.cities.includes(city));
    if (!nextCity) return;

    for (const city of divInfo.cities) {
      if (!isCityOperational(division, city)) return;
    }

    const funds = CORP.getCorporation().funds;
    const expandCost = CORP.getConstants().officeInitialCost;
    const warehouseCost = CORP.getConstants().warehouseInitialCost;
    if (funds < expandCost + warehouseCost + CITY_EXPANSION_CASH_BUFFER) return;

    CORP.expandCity(division.Name, nextCity);
    CORP.purchaseWarehouse(division.Name, nextCity);
    ns.print(`Expanded ${division.Name} to ${nextCity}.`);
  }

  async function materialManagement(division, city) {
    const storage =
      CORP.getWarehouse(division.Name, city).size * MATERIAL_RESERVE;
    const hardwareAmt = Math.floor(
      (storage * division.HardwarePercent) / MATERIAL_SIZE.Hardware,
    );
    const robotsAmt = Math.floor(
      (storage * division.RobotsPercent) / MATERIAL_SIZE.Robots,
    );
    const aiCoresAmt = Math.floor(
      (storage * division.AICoresPercent) / MATERIAL_SIZE["AI Cores"],
    );
    const realEstateAmt = Math.floor(
      (storage * division.RealEstatePercent) / MATERIAL_SIZE["Real Estate"],
    );

    ns.print(
      `City: ${city} || Size: ${storage}\n Hardware: ${hardwareAmt}\n Robots: ${robotsAmt}\n AI Cores: ${aiCoresAmt}\n Real Estate: ${realEstateAmt}`,
    );

    await buyMaterials(division.Name, city, "Hardware", hardwareAmt);
    await buyMaterials(division.Name, city, "Robots", robotsAmt);
    await buyMaterials(division.Name, city, "AI Cores", aiCoresAmt);
    await buyMaterials(division.Name, city, "Real Estate", realEstateAmt);
  }

  async function buyMaterials(name, city, material, targetAmount) {
    CORP.sellMaterial(name, city, material, "0", "MP");
    const amount =
      Math.floor(targetAmount) - CORP.getMaterial(name, city, material).stored;
    if (amount > 0) {
      try {
        CORP.bulkPurchase(name, city, material, amount);
      } catch (e) {
        ns.print(
          `Failed to purchase ${amount} of ${material} in ${city}: ${e}`,
        );
      }
    } else {
      CORP.sellMaterial(name, city, material, -amount, "MP");
      while (CORP.getCorporation().prevState !== "START") await ns.sleep(10);
      CORP.sellMaterial(name, city, material, "0", "MP");
    }
  }

  function productManagement(division) {
    const designInvestment = 1e9;
    const marketingInvestment = 1e9;
    const divInfo = CORP.getDivision(division.Name);
    if (!divInfo.makesProducts) return;

    const city = divInfo.cities[0];
    let products = divInfo.products;

    while (products.length < divInfo.maxProducts) {
      const randomNum = Math.floor(Math.random() * 100);
      const productName = `${division.Name}-${randomNum}`;
      if (products.includes(productName)) continue;
      CORP.makeProduct(
        division.Name,
        city,
        productName,
        designInvestment,
        marketingInvestment,
      );
      products = CORP.getDivision(division.Name).products;
    }

    products.sort((a, b) => {
      const productA = CORP.getProduct(division.Name, city, a);
      const productB = CORP.getProduct(division.Name, city, b);
      return productB.developmentProgress - productA.developmentProgress;
    });

    const leastDeveloped = products.at(-1);
    if (
      leastDeveloped &&
      CORP.getProduct(division.Name, city, leastDeveloped)
        .developmentProgress >= 100
    ) {
      CORP.discontinueProduct(division.Name, products.shift());
    }
  }

  // --- Main ---

  await waitForCorpCreationFunds();
  createCorporation();

  for (const div of DIVISIONS) {
    createDivisionIfMissing(div);
  }

  await waitAndBuySmartSupply();

  for (const div of DIVISIONS) {
    if (!createDivisionIfMissing(div)) continue;

    const divInfo = CORP.getDivision(div.Name);
    if (!divInfo.cities.includes(START_CITY)) {
      CORP.expandCity(div.Name, START_CITY);
    }
    if (!CORP.hasWarehouse(div.Name, START_CITY)) {
      CORP.purchaseWarehouse(div.Name, START_CITY);
    }
    manageOfficeAndWarehouse(div, START_CITY);
    setupSellingAndSmartSupply(div, START_CITY);
  }

  while (true) {
    for (const div of DIVISIONS) {
      if (!createDivisionIfMissing(div)) continue;

      const divInfo = CORP.getDivision(div.Name);
      const cities = divInfo.cities.sort((a, b) =>
        a === START_CITY ? -1 : b === START_CITY ? 1 : 0,
      );
      for (const city of cities) {
        setupSellingAndSmartSupply(div, city);
        manageOfficeAndWarehouse(div, city);
        if (CORP.hasWarehouse(div.Name, city)) {
          await materialManagement(div, city);
        }
      }
      productManagement(div);
      tryExpandIfOperational(div);
    }
    await ns.sleep(10000);
  }
}
