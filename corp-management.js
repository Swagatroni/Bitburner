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
  const EMPLOYEE_TARGET_PER_CITY = 40;
  const CITY_READY_EMPLOYEES = 40;
  const CITY_READY_WAREHOUSE_SIZE = 10000;
  const EXPANSION_FLOOR_EMPLOYEES = 18;
  const EXPANSION_FLOOR_WAREHOUSE_SIZE = 1000;
  const OFFICE_UPGRADE_STEP = 6;
  const OFFICE_UPGRADE_CASH_BUFFER = 5e9;
  const WAREHOUSE_UPGRADE_CASH_BUFFER = 2e9;
  const PRE_EXPANSION_OFFICE_CASH_BUFFER = 0;
  const PRE_EXPANSION_WAREHOUSE_CASH_BUFFER = 0;
  const CITY_EXPANSION_CASH_BUFFER = 5e9;
  const CORP_CREATION_COST = 150e9;
  const LOG_EVERY_LOOPS = 6;

  let loopCount = 0;

  const MATERIAL_RESERVE = 0.85;
  const MATERIAL_SIZE = {
    Hardware: 0.06,
    Robots: 0.5,
    "AI Cores": 0.1,
    "Real Estate": 0.005,
  };

  const INDUSTRY_BONUS_WEIGHTS = {
    Agriculture: [4, 5, 5, 14],
    Tobacco: [2, 2, 1, 3],
  };

  function getDivisionRuntimeState(divisionName) {
    const info = CORP.getDivision(divisionName);
    let outputs = [];
    try {
      const industryData = CORP.getIndustryData(info.type);
      outputs = industryData.producedMaterials || [];
    } catch (_) {
      outputs = info.producedMaterials || [];
    }
    const [hardware, robots, aiCores, realEstate] = INDUSTRY_BONUS_WEIGHTS[
      info.type
    ] || [2, 2, 1, 3];
    const sum = hardware + robots + aiCores + realEstate;

    return {
      Name: divisionName,
      Industry: info.type,
      Outputs: outputs,
      HardwarePercent: hardware / sum,
      RobotsPercent: robots / sum,
      AICoresPercent: aiCores / sum,
      RealEstatePercent: realEstate / sum,
    };
  }

  function getManagedDivisions() {
    return CORP.getCorporation().divisions.map(getDivisionRuntimeState);
  }

  // --- Setup ---

  function shouldLogThisLoop() {
    return loopCount % LOG_EVERY_LOOPS === 0;
  }

  async function waitForCorpCreationFunds() {
    if (CORP.hasCorporation()) {
      ns.print(
        "[Startup] Corporation already exists, skipping creation-funds wait.",
      );
      return;
    }

    let alertedReady = false;
    while (true) {
      if (!alertedReady && ns.getPlayer().money >= CORP_CREATION_COST) {
        ns.print("[Startup] Funds threshold reached for corporation creation.");
        alertedReady = true;
      }
      if (ns.getPlayer().money >= CORP_CREATION_COST) return;
      ns.print(
        `[Startup] Waiting for corp creation funds: ${ns.formatNumber(ns.getPlayer().money)} / ${ns.formatNumber(CORP_CREATION_COST)}`,
      );
      await ns.sleep(10000);
    }
  }

  function createCorporation() {
    if (!CORP.hasCorporation()) {
      CORP.createCorporation(CORP_NAME, true);
      ns.tprint(`Corporation created: ${CORP_NAME}`);
    }
  }

  async function buySmartSupplyOnceAtStartup() {
    if (CORP.hasUnlock("Smart Supply")) return;

    while (!CORP.hasUnlock("Smart Supply")) {
      const unlockCost = CORP.getUnlockUpgradeCost("Smart Supply");
      const funds = CORP.getCorporation().funds;
      if (funds >= unlockCost) {
        CORP.unlockUpgrade("Smart Supply");
        ns.tprint("Purchased unlock: Smart Supply");
        ns.print("[Corp] Purchased unlock: Smart Supply.");
        return;
      }

      ns.print(
        `[Corp] Waiting for Smart Supply funds: ${ns.formatNumber(funds)} / ${ns.formatNumber(unlockCost)}`,
      );
      await ns.sleep(10000);
    }
  }

  function getTargetEmployees(funds) {
    return EMPLOYEE_TARGET_PER_CITY;
  }

  function isDivisionFullyExpanded(division) {
    return CORP.getDivision(division.Name).cities.length >= CITIES.length;
  }

  function getCityTargetsForPhase(division, funds) {
    if (!isDivisionFullyExpanded(division)) {
      return {
        employees: EXPANSION_FLOOR_EMPLOYEES,
        warehouseSize: EXPANSION_FLOOR_WAREHOUSE_SIZE,
      };
    }

    return {
      employees: getTargetEmployees(funds),
      warehouseSize: CITY_READY_WAREHOUSE_SIZE,
    };
  }

  function manageResearch(division) {
    const order = ["Hi-Tech R&D Laboratory", "Market-TA.I", "Market-TA.II"];
    for (const research of order) {
      if (CORP.hasResearched(division.Name, research)) continue;

      const points = CORP.getDivision(division.Name).researchPoints;
      const cost = CORP.getResearchCost(division.Name, research);
      if (points >= cost) {
        CORP.research(division.Name, research);
        ns.print(`[${division.Name}] Researched: ${research}`);
      } else if (shouldLogThisLoop()) {
        ns.print(
          `[${division.Name}] Waiting on research points for ${research}: ${ns.formatNumber(points)} / ${ns.formatNumber(cost)}`,
        );
      }
      break;
    }
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

  function isCityAboveExpansionFloor(division, city) {
    const office = CORP.getOffice(division.Name, city);
    if (office.numEmployees < EXPANSION_FLOOR_EMPLOYEES) return false;
    if (!CORP.hasWarehouse(division.Name, city)) return false;

    const warehouse = CORP.getWarehouse(division.Name, city);
    if (warehouse.size < EXPANSION_FLOOR_WAREHOUSE_SIZE) return false;

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

  function getCityWeaknessScore(division, city) {
    const funds = CORP.getCorporation().funds;
    const targets = getCityTargetsForPhase(division, funds);
    const office = CORP.getOffice(division.Name, city);
    const empRatio = Math.min(1, office.numEmployees / targets.employees);

    if (!CORP.hasWarehouse(division.Name, city)) {
      return 3 - empRatio;
    }

    const warehouse = CORP.getWarehouse(division.Name, city);
    const whRatio = Math.min(1, warehouse.size / targets.warehouseSize);

    // Higher score means weaker city and should be prioritized first.
    return 1 - empRatio + (1 - whRatio);
  }

  function manageOfficeAndWarehouse(division, city) {
    let office = CORP.getOffice(division.Name, city);
    const funds = CORP.getCorporation().funds;
    const targets = getCityTargetsForPhase(division, funds);
    const desiredEmployees = targets.employees;
    const desiredWarehouseSize = targets.warehouseSize;
    const fullyExpanded = isDivisionFullyExpanded(division);
    const officeBuffer = fullyExpanded
      ? OFFICE_UPGRADE_CASH_BUFFER
      : PRE_EXPANSION_OFFICE_CASH_BUFFER;
    const warehouseBuffer = fullyExpanded
      ? WAREHOUSE_UPGRADE_CASH_BUFFER
      : PRE_EXPANSION_WAREHOUSE_CASH_BUFFER;

    if (office.size < desiredEmployees) {
      const growBy = Math.min(
        OFFICE_UPGRADE_STEP,
        desiredEmployees - office.size,
      );
      const cost = CORP.getOfficeSizeUpgradeCost(division.Name, city, growBy);
      if (funds > cost + officeBuffer) {
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
      if (CORP.getCorporation().funds > whCost + warehouseBuffer) {
        CORP.purchaseWarehouse(division.Name, city);
      }
      return;
    }

    if (fullyExpanded && warehouse.sizeUsed / warehouse.size > 0.9) {
      const upCost = CORP.getUpgradeWarehouseCost(division.Name, city, 1);
      if (CORP.getCorporation().funds > upCost + warehouseBuffer) {
        CORP.upgradeWarehouse(division.Name, city, 1);
      }
    }

    if (warehouse.size < desiredWarehouseSize) {
      const upCost = CORP.getUpgradeWarehouseCost(division.Name, city, 1);
      if (CORP.getCorporation().funds > upCost + warehouseBuffer) {
        CORP.upgradeWarehouse(division.Name, city, 1);
      }
    }
  }

  function setupSellingAndSmartSupply(division, city) {
    if (!CORP.hasWarehouse(division.Name, city)) return;

    const hasMarketTA1 = CORP.hasResearched(division.Name, "Market-TA.I");
    const hasMarketTA2 = CORP.hasResearched(division.Name, "Market-TA.II");

    if (CORP.hasUnlock("Smart Supply")) {
      const wh = CORP.getWarehouse(division.Name, city);
      if (!wh.smartSupplyEnabled) {
        ns.print(`[${division.Name}] Enabling Smart Supply in ${city}.`);
      }
      CORP.setSmartSupply(division.Name, city, true);
    }

    for (const material of division.Outputs) {
      CORP.sellMaterial(division.Name, city, material, "MAX", "MP");
      if (hasMarketTA1) {
        CORP.setMaterialMarketTA1(division.Name, city, material, true);
      }
      if (hasMarketTA2) {
        CORP.setMaterialMarketTA2(division.Name, city, material, true);
      }
    }

    if (shouldLogThisLoop() && division.Outputs.length > 0) {
      ns.print(
        `[${division.Name}] ${city} sell configured for: ${division.Outputs.join(", ")}`,
      );
    }

    const divInfo = CORP.getDivision(division.Name);
    if (divInfo.makesProducts) {
      for (const productName of divInfo.products) {
        try {
          CORP.sellProduct(division.Name, city, productName, "MAX", "MP", true);
          if (hasMarketTA1) {
            CORP.setProductMarketTA1(division.Name, productName, true);
          }
          if (hasMarketTA2) {
            CORP.setProductMarketTA2(division.Name, productName, true);
          }
        } catch (_) {}
      }
    }
  }

  function tryExpandIfOperational(division) {
    const divInfo = CORP.getDivision(division.Name);
    const nextCity = CITIES.find((city) => !divInfo.cities.includes(city));
    if (!nextCity) return;

    for (const city of divInfo.cities) {
      if (!isCityAboveExpansionFloor(division, city)) {
        if (shouldLogThisLoop()) {
          const office = CORP.getOffice(division.Name, city);
          const whSize = CORP.hasWarehouse(division.Name, city)
            ? CORP.getWarehouse(division.Name, city).size
            : 0;
          ns.print(
            `[${division.Name}] Expansion blocked until ${city} reaches floor | emp ${office.numEmployees}/${EXPANSION_FLOOR_EMPLOYEES} | wh ${ns.formatNumber(whSize, 3)}/${EXPANSION_FLOOR_WAREHOUSE_SIZE}`,
          );
        }
        return;
      }
    }

    const funds = CORP.getCorporation().funds;
    const expandCost = CORP.getConstants().officeInitialCost;
    const warehouseCost = CORP.getConstants().warehouseInitialCost;
    if (funds < expandCost + warehouseCost) {
      if (shouldLogThisLoop()) {
        const need = expandCost + warehouseCost;
        ns.print(
          `[${division.Name}] Expansion blocked by funds: ${ns.formatNumber(funds)} / ${ns.formatNumber(need)} needed.`,
        );
      }
      return;
    }

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

    ns.print(`City: ${city} || Size: ${ns.formatNumber(storage, 3)}`);

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
      try {
        CORP.makeProduct(
          division.Name,
          city,
          productName,
          designInvestment,
          marketingInvestment,
        );
      } catch (_) {
        if (shouldLogThisLoop()) {
          ns.print(
            `[${division.Name}] Not enough funds to start new product yet.`,
          );
        }
        break;
      }
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
  await buySmartSupplyOnceAtStartup();

  let divisions = getManagedDivisions();
  if (divisions.length === 0) {
    ns.print(
      "[Startup] No divisions found yet. Create one manually and this script will start managing it.",
    );
  }

  for (const div of divisions) {
    manageResearch(div);

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
    loopCount += 1;
    divisions = getManagedDivisions();

    if (shouldLogThisLoop()) {
      ns.print(
        `[Loop ${loopCount}] Active. Corp funds: ${ns.formatNumber(CORP.getCorporation().funds)}`,
      );
      if (divisions.length === 0) {
        ns.print("[Loop] No divisions to manage yet.");
      }
    }

    for (const div of divisions) {
      manageResearch(div);

      const divInfo = CORP.getDivision(div.Name);
      const cities = [...divInfo.cities].sort(
        (a, b) => getCityWeaknessScore(div, b) - getCityWeaknessScore(div, a),
      );

      if (shouldLogThisLoop() && cities.length > 0) {
        const weakest = cities[0];
        ns.print(`[${div.Name}] Prioritizing weakest city: ${weakest}`);
      }

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
