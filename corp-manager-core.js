/** @param {NS} ns **/
export async function runCorpManager(ns, mode = "floor") {
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
  const FLOOR_EMPLOYEES = 18;
  const FLOOR_WAREHOUSE_SIZE = 1000;
  const SCALE_EMPLOYEE_BASELINE = 60;
  const SCALE_WAREHOUSE_BASELINE = 10000;
  const SCALE_WAREHOUSE_STEP = 1000;
  const OFFICE_UPGRADE_STEP = 3;
  const OFFICE_UPGRADE_CASH_BUFFER = 0;
  const WAREHOUSE_UPGRADE_CASH_BUFFER = 0;
  const PRE_EXPANSION_OFFICE_CASH_BUFFER = 0;
  const PRE_EXPANSION_WAREHOUSE_CASH_BUFFER = 0;
  const WAREHOUSE_PURCHASE_CASH_BUFFER = 0;
  const CORP_CREATION_COST = 150e9;
  const LOG_EVERY_LOOPS = 5;
  const MATERIAL_RESERVE = 0.85;
  const MATERIAL_SIZE = {
    Hardware: 0.06,
    Robots: 0.5,
    "AI Cores": 0.1,
    "Real Estate": 0.005,
  };
  const INDUSTRY_BONUS_WEIGHTS = {
    Agriculture: [4, 5, 5, 14],
    Tobacco: [2, 4, 2, 2],
    Pharmaceutical: [2, 5, 4, 1],
  };

  if (mode !== "floor" && mode !== "scale") {
    throw new Error(`Unsupported corp manager mode: ${mode}`);
  }

  let loopCount = 0;

  function shouldLogThisLoop() {
    return loopCount % LOG_EVERY_LOOPS === 0;
  }

  function logPurchase(message) {
    ns.print(`[Buy] ${message}`);
  }

  function getDivisionRuntimeState(divisionName) {
    const info = CORP.getDivision(divisionName);
    let outputs = [];
    try {
      outputs = CORP.getIndustryData(info.type).producedMaterials || [];
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

  async function waitForCorpState(state) {
    while (CORP.getCorporation().nextState !== state) {
      await ns.sleep(100);
    }
  }

  async function waitForStartPhaseTransition() {
    while (CORP.getCorporation().nextState === "START") {
      await ns.sleep(50);
    }
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
        logPurchase(`Smart Supply unlock for ${ns.formatNumber(unlockCost)}`);
        return;
      }

      await ns.sleep(10000);
    }
  }

  function manageResearch(division) {
    const order = [
      "Hi-Tech R&D Laboratory",
      "Market-TA.I",
      "Market-TA.II",
      "AutoBrew",
      "AutoPartyManager",
    ];
    for (const research of order) {
      if (CORP.hasResearched(division.Name, research)) continue;

      const points = CORP.getDivision(division.Name).researchPoints;
      const cost = CORP.getResearchCost(division.Name, research);
      if (points >= cost) {
        CORP.research(division.Name, research);
        ns.print(`[${division.Name}] Researched: ${research}`);
      }
      break;
    }
  }

  function isCityAtFloor(division, city) {
    const office = CORP.getOffice(division.Name, city);
    if (office.numEmployees < FLOOR_EMPLOYEES) return false;
    if (!CORP.hasWarehouse(division.Name, city)) return false;

    return CORP.getWarehouse(division.Name, city).size >= FLOOR_WAREHOUSE_SIZE;
  }

  function areAllDivisionCitiesAtFloor(division) {
    const cities = CORP.getDivision(division.Name).cities;
    if (cities.length < CITIES.length) return false;

    return cities.every((city) => isCityAtFloor(division, city));
  }

  function getScaleTargets(divisions) {
    const officeSizes = [];
    const warehouseSizes = [];

    for (const division of divisions) {
      if (!areAllDivisionCitiesAtFloor(division)) {
        continue;
      }

      for (const city of CORP.getDivision(division.Name).cities) {
        officeSizes.push(
          Math.max(
            SCALE_EMPLOYEE_BASELINE,
            CORP.getOffice(division.Name, city).size,
          ),
        );
        if (CORP.hasWarehouse(division.Name, city)) {
          warehouseSizes.push(
            Math.max(
              SCALE_WAREHOUSE_BASELINE,
              CORP.getWarehouse(division.Name, city).size,
            ),
          );
        } else {
          warehouseSizes.push(SCALE_WAREHOUSE_BASELINE);
        }
      }
    }

    const minOffice = officeSizes.length
      ? Math.min(...officeSizes)
      : SCALE_EMPLOYEE_BASELINE;
    const minWarehouse = warehouseSizes.length
      ? Math.min(...warehouseSizes)
      : SCALE_WAREHOUSE_BASELINE;

    return {
      employees: Math.max(
        SCALE_EMPLOYEE_BASELINE,
        minOffice + OFFICE_UPGRADE_STEP,
      ),
      warehouseSize: Math.max(
        SCALE_WAREHOUSE_BASELINE,
        minWarehouse + SCALE_WAREHOUSE_STEP,
      ),
    };
  }

  function getTargets(divisions) {
    if (mode === "floor") {
      return {
        employees: FLOOR_EMPLOYEES,
        warehouseSize: FLOOR_WAREHOUSE_SIZE,
      };
    }
    return getScaleTargets(divisions);
  }

  function setEvenJobAssignments(divisionName, city, employeeCount) {
    const allPossibleJobs = [
      "Operations",
      "Engineer",
      "Business",
      "Management",
      "Research & Development",
      "Intern",
    ];
    const targetJobs = [
      "Operations",
      "Engineer",
      "Business",
      "Management",
      "Research & Development",
    ];
    const needsInterns =
      !CORP.hasResearched(divisionName, "AutoBrew") ||
      !CORP.hasResearched(divisionName, "AutoPartyManager");
    if (needsInterns) targetJobs.push("Intern");

    const base = Math.floor(employeeCount / targetJobs.length);
    let extra = employeeCount % targetJobs.length;

    for (const job of allPossibleJobs) {
      CORP.setAutoJobAssignment(divisionName, city, job, 0);
    }

    for (const job of targetJobs) {
      const assign = base + (extra > 0 ? 1 : 0);
      CORP.setAutoJobAssignment(divisionName, city, job, assign);
      if (extra > 0) extra -= 1;
    }
  }

  function getCityWeaknessScore(division, city, targets) {
    const office = CORP.getOffice(division.Name, city);
    const empRatio = Math.min(1, office.numEmployees / targets.employees);

    if (!CORP.hasWarehouse(division.Name, city)) {
      return 3 - empRatio;
    }

    const warehouse = CORP.getWarehouse(division.Name, city);
    const whRatio = Math.min(1, warehouse.size / targets.warehouseSize);
    return 1 - empRatio + (1 - whRatio);
  }

  function manageOfficeAndWarehouse(division, city, targets) {
    let office = CORP.getOffice(division.Name, city);
    const funds = CORP.getCorporation().funds;
    const desiredEmployees = targets.employees;
    const desiredWarehouseSize = targets.warehouseSize;
    const scaleBeyondFloor = mode === "scale";
    const officeBuffer = scaleBeyondFloor
      ? OFFICE_UPGRADE_CASH_BUFFER
      : PRE_EXPANSION_OFFICE_CASH_BUFFER;
    const warehouseBuffer = scaleBeyondFloor
      ? WAREHOUSE_UPGRADE_CASH_BUFFER
      : PRE_EXPANSION_WAREHOUSE_CASH_BUFFER;

    if (office.size < desiredEmployees) {
      const growBy = Math.min(
        OFFICE_UPGRADE_STEP,
        desiredEmployees - office.size,
      );
      const cost = CORP.getOfficeSizeUpgradeCost(division.Name, city, growBy);
      if (funds >= cost + officeBuffer) {
        CORP.upgradeOfficeSize(division.Name, city, growBy);
        logPurchase(
          `${division.Name} (${city}) office +${growBy} for ${ns.formatNumber(cost)}`,
        );
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
        CORP.getCorporation().funds >=
        whCost + WAREHOUSE_PURCHASE_CASH_BUFFER
      ) {
        CORP.purchaseWarehouse(division.Name, city);
        logPurchase(
          `${division.Name} (${city}) warehouse for ${ns.formatNumber(whCost)}`,
        );
      }
      return;
    }

    if (warehouse.size < desiredWarehouseSize) {
      const upCost = CORP.getUpgradeWarehouseCost(division.Name, city, 1);
      if (CORP.getCorporation().funds >= upCost + warehouseBuffer) {
        CORP.upgradeWarehouse(division.Name, city, 1);
        logPurchase(
          `${division.Name} (${city}) warehouse +1 for ${ns.formatNumber(upCost)}`,
        );
      }
    }
  }

  function setupSellingAndSmartSupply(division, city) {
    if (!CORP.hasWarehouse(division.Name, city)) return;

    const hasMarketTA1 = CORP.hasResearched(division.Name, "Market-TA.I");
    const hasMarketTA2 = CORP.hasResearched(division.Name, "Market-TA.II");

    if (CORP.hasUnlock("Smart Supply")) {
      const warehouse = CORP.getWarehouse(division.Name, city);
      if (!warehouse.smartSupplyEnabled) {
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

  function getMaterialTargets(division, city) {
    const warehouseSize = CORP.getWarehouse(division.Name, city).size;
    const storage = warehouseSize * MATERIAL_RESERVE;
    return {
      Hardware: Math.floor(
        (storage * division.HardwarePercent) / MATERIAL_SIZE.Hardware,
      ),
      Robots: Math.floor(
        (storage * division.RobotsPercent) / MATERIAL_SIZE.Robots,
      ),
      "AI Cores": Math.floor(
        (storage * division.AICoresPercent) / MATERIAL_SIZE["AI Cores"],
      ),
      "Real Estate": Math.floor(
        (storage * division.RealEstatePercent) / MATERIAL_SIZE["Real Estate"],
      ),
    };
  }

  async function buyMaterials(name, city, material, targetAmount) {
    CORP.sellMaterial(name, city, material, "0", "MP");
    const amount =
      Math.floor(targetAmount) - CORP.getMaterial(name, city, material).stored;
    if (amount > 0) {
      try {
        CORP.bulkPurchase(name, city, material, amount);
      } catch (_) {}
      return;
    }

    CORP.sellMaterial(name, city, material, -amount, "MP");
    while (CORP.getCorporation().prevState !== "START") {
      await ns.sleep(10);
    }
    CORP.sellMaterial(name, city, material, "0", "MP");
  }

  async function materialManagement(division, city) {
    const targets = getMaterialTargets(division, city);
    await buyMaterials(division.Name, city, "Hardware", targets.Hardware);
    await buyMaterials(division.Name, city, "Robots", targets.Robots);
    await buyMaterials(division.Name, city, "AI Cores", targets["AI Cores"]);
    await buyMaterials(
      division.Name,
      city,
      "Real Estate",
      targets["Real Estate"],
    );
  }

  function productManagement(division) {
    const designInvestment = 1e9;
    const marketingInvestment = 1e9;
    const divInfo = CORP.getDivision(division.Name);
    if (!divInfo.makesProducts) return;

    const city = divInfo.cities[0];
    const products = [...divInfo.products];

    const tryStartProduct = () => {
      const prefix = division.Name.slice(0, 2).toUpperCase();
      const existingNums = products
        .map((productName) => {
          const match = productName.match(new RegExp(`^${prefix}-(\\d+)$`));
          return match ? parseInt(match[1], 10) : -1;
        })
        .filter((num) => num >= 0);
      const nextNum =
        existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
      const productName = `${prefix}-${String(nextNum).padStart(3, "0")}`;
      if (products.includes(productName)) return false;

      try {
        CORP.makeProduct(
          division.Name,
          city,
          productName,
          designInvestment,
          marketingInvestment,
        );
        logPurchase(
          `${division.Name} started product ${productName} for ${ns.formatNumber(designInvestment + marketingInvestment)}`,
        );
        return true;
      } catch (_) {
        return false;
      }
    };

    const productStates = products
      .map((productName) => {
        try {
          return CORP.getProduct(division.Name, city, productName);
        } catch (_) {
          return null;
        }
      })
      .filter((product) => product !== null);

    const hasDevelopingProduct = productStates.some(
      (product) => product.developmentProgress < 100,
    );

    if (products.length < divInfo.maxProducts) {
      if (!hasDevelopingProduct) {
        tryStartProduct();
      }
      return;
    }

    if (!hasDevelopingProduct) {
      const completedStates = productStates.filter(
        (product) => product.developmentProgress >= 100,
      );
      const worst = completedStates.reduce(
        (min, product) => (product.rating < min.rating ? product : min),
        completedStates[0],
      );
      if (worst) {
        CORP.discontinueProduct(division.Name, worst.name);
        ns.print(
          `[Product] ${division.Name} retired ${worst.name} (rating ${ns.formatNumber(worst.rating, 3)}).`,
        );
        tryStartProduct();
      }
    }
  }

  function ensureStartCity(division) {
    const divInfo = CORP.getDivision(division.Name);
    if (!divInfo.cities.includes(START_CITY)) {
      CORP.expandCity(division.Name, START_CITY);
      logPurchase(`${division.Name} expanded to ${START_CITY}.`);
    }
    if (!CORP.hasWarehouse(division.Name, START_CITY)) {
      const whCost = CORP.getConstants().warehouseInitialCost;
      CORP.purchaseWarehouse(division.Name, START_CITY);
      logPurchase(
        `${division.Name} (${START_CITY}) warehouse for ${ns.formatNumber(whCost)}`,
      );
    }
  }

  function tryExpandToNextCity(division) {
    const divInfo = CORP.getDivision(division.Name);
    const nextCity = CITIES.find((city) => !divInfo.cities.includes(city));
    if (!nextCity) return;

    for (const city of divInfo.cities) {
      if (!isCityAtFloor(division, city)) {
        if (shouldLogThisLoop()) {
          const office = CORP.getOffice(division.Name, city);
          const whSize = CORP.hasWarehouse(division.Name, city)
            ? CORP.getWarehouse(division.Name, city).size
            : 0;
          ns.print(
            `[${division.Name}] Expansion blocked until ${city} reaches floor | emp ${office.numEmployees}/${FLOOR_EMPLOYEES} | wh ${ns.formatNumber(whSize, 3)}/${FLOOR_WAREHOUSE_SIZE}`,
          );
        }
        return;
      }
    }

    const expandCost = CORP.getConstants().officeInitialCost;
    const warehouseCost = CORP.getConstants().warehouseInitialCost;
    if (CORP.getCorporation().funds < expandCost + warehouseCost) {
      return;
    }

    CORP.expandCity(division.Name, nextCity);
    CORP.purchaseWarehouse(division.Name, nextCity);
    logPurchase(
      `${division.Name} expanded to ${nextCity} and bought warehouse for ${ns.formatNumber(expandCost + warehouseCost)}`,
    );
  }

  if (mode === "floor") {
    await waitForCorpCreationFunds();
    createCorporation();
    await buySmartSupplyOnceAtStartup();
  } else if (!CORP.hasCorporation()) {
    ns.tprint("No corporation found. Run corp-management.js first.");
    return;
  }

  while (true) {
    await waitForCorpState("START");

    loopCount += 1;
    const divisions = getManagedDivisions();
    const commonTargets = getTargets(divisions);
    const floorTargets = {
      employees: FLOOR_EMPLOYEES,
      warehouseSize: FLOOR_WAREHOUSE_SIZE,
    };

    if (shouldLogThisLoop()) {
      ns.print(
        `[${mode}] Loop ${loopCount} START | funds ${ns.formatNumber(CORP.getCorporation().funds)} | target ${commonTargets.employees} emp / ${ns.formatNumber(commonTargets.warehouseSize)} wh`,
      );
      if (divisions.length === 0) {
        ns.print("[Loop] No divisions to manage yet.");
      }
    }

    for (const division of divisions) {
      manageResearch(division);

      const divisionNeedsBootstrap = !areAllDivisionCitiesAtFloor(division);
      const divisionTargets =
        mode === "scale" && divisionNeedsBootstrap
          ? floorTargets
          : commonTargets;

      if (mode === "floor" || (mode === "scale" && divisionNeedsBootstrap)) {
        ensureStartCity(division);
      }

      const divInfo = CORP.getDivision(division.Name);
      const cities = [...divInfo.cities].sort(
        (a, b) =>
          getCityWeaknessScore(division, b, divisionTargets) -
          getCityWeaknessScore(division, a, divisionTargets),
      );

      for (const city of cities) {
        setupSellingAndSmartSupply(division, city);
        manageOfficeAndWarehouse(division, city, divisionTargets);
        if (CORP.hasWarehouse(division.Name, city)) {
          await materialManagement(division, city);
        }
      }

      if (mode === "scale" && !divisionNeedsBootstrap) {
        productManagement(division);
      } else {
        tryExpandToNextCity(division);
      }
    }

    await waitForStartPhaseTransition();
  }
}
