/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  while (true) {
    const myFiles = ns.ls("home");
    const nearbyServers = ns.dnet.probe();

    for (const hostname of nearbyServers) {
      const authenticationSuccessful = await serverSolver(ns, hostname);
      if (!authenticationSuccessful) continue;

      ns.print(
        `Authenticated: ${ns.dnet.getServerAuthDetails(hostname).modelId}`,
      );

      ns.scp(ns.getScriptName(), hostname);
      ns.exec(ns.getScriptName(), hostname, {
        preventDuplicates: true,
      });
    }

    const hostname = ns.getServer().hostname;
    if (hostname === "home") {
      await ns.sleep(1000);
      continue;
    }

    const files = ns.ls(hostname);

    for (const file of files) {
      if (file.endsWith(".cache")) {
        ns.dnet.openCache(file, true);
        continue;
      }

      if (!myFiles.includes(file) && !file.endsWith(".exe")) {
        if (ns.scp(file, "home")) ns.tprint(`Transferred: ${file}`);
      }
    }

    await ns.dnet.memoryReallocation();
    await ns.dnet.phishingAttack();
    await ns.sleep(5000);
  }
}

/**
 * @param {NS} ns
 * @param {string} hostname
 */
export const serverSolver = async (ns, hostname) => {
  const details = ns.dnet.getServerAuthDetails(hostname);
  ns.scp("passwords.json", hostname);

  if (details.hasSession) return true;
  if (!details.isConnectedToCurrentServer || !details.isOnline) return false;

  switch (details.modelId) {
    case "ZeroLogon":
      return zeroLogon(ns, hostname, details);
    case "CloudBlare(tm)":
      return cloudBlare(ns, hostname, details);
    case "PHP 5.4":
      return PHP(ns, hostname, details);
    case "DeskMemo_3.1":
      return deskMemo(ns, hostname, details);
    case "AccountsManager_4.2":
      return accountsManager(ns, hostname, details);
    case "OctantVoxel":
      return octantVoxel(ns, hostname, details);
    case "BellaCuore":
      return bellaCuore(ns, hostname, details);
    case "Pr0verFl0":
      return pr0verFl0(ns, hostname, details);
    case "FreshInstall_1.0":
      return freshInstall(ns, hostname, details);
    case "NIL":
      return nil(ns, hostname, details);
    case "Factori-Os":
      return factoriOs(ns, hostname, details);
    case "Laika4":
      return laika4(ns, hostname, details);
    case "OpenWebAccessPoint":
      return openWebAccessPoint(ns, hostname, details);
    case "DeepGreen":
      return deepGreen(ns, hostname, details);
    default:
      ns.tprint(`Unrecognized modelId: ${details.modelId}`);
      ns.tprint(details);
      return false;
  }
};

/**
 *  @param {NS} ns
 * @param {string} hostname
 * @param {object} details
 */
const zeroLogon = async (ns, hostname, details) => {
  const result = await ns.dnet.authenticate(hostname, "");
  // TODO: store discovered passwords somewhere safe, in case we need them later
  return result.success;
};
const cloudBlare = async (ns, hostname, details) => {
  let password = "";
  const data = details.data;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    if (char >= "0" && char <= "9") password += char;
  }

  const result = await ns.dnet.authenticate(hostname, password);
  return result.success;
};
const PHP = async (ns, hostname, details) => {
  const permutations = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  let num = details.data.split("");

  for (let i = 0; i < permutations.length; i++) {
    let temp = "";
    for (let j = 0; j < permutations[i].length; j++) {
      temp += num[permutations[i][j]];
    }
    const result = await ns.dnet.authenticate(hostname, temp);
    if (result.success) return true;
  }
  return false;
};
const deskMemo = async (ns, hostname, details) => {
  const hint = details.passwordHint;
  let password = hint.split(" ");

  const result = await ns.dnet.authenticate(hostname, password.at(-1));
  return result.success;
};
const accountsManager = async (ns, hostname, details) => {
  for (let i = 0; i <= 100; i++) {
    const result = await ns.dnet.authenticate(hostname, i.toString());
    if (result.success) return true;
  }

  return false;
};
const octantVoxel = async (ns, hostname, details) => {
  const base = details.data.split(",")[0];
  let num = details.data.split(",")[1].split("").reverse();
  let password = 0;

  for (let i = 0; i < num.length; i++) {
    password += parseInt(num[i]) * Math.pow(base, i);
  }
  const result = await ns.dnet.authenticate(hostname, password.toString());
  return result.success;
};
const bellaCuore = async (ns, hostname, details) => {
  const numerals = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  const arr = details.data.split("");
  let password = 0;

  for (let i = 0; i < arr.length; i++) {
    const char = arr[i];
    const value = numerals[char];

    if (i < arr.length - 1 && value < numerals[arr[i + 1]]) {
      password -= value;
    } else {
      password += value;
    }
  }
  const result = await ns.dnet.authenticate(hostname, password.toString());
  return result.success;
};
const freshInstall = async (ns, hostname, details) => {
  const rawData = ns.read("passwords.json");
  if (rawData) {
    const data = JSON.parse(rawData);
    for (const key in data.default) {
      const result = await ns.dnet.authenticate(hostname, data.default[key]);
      if (result.success) return result.success;
    }
  }
  return false;
};
const laika4 = async (ns, hostname, details) => {
  const rawData = ns.read("passwords.json");
  if (rawData) {
    const data = JSON.parse(rawData);
    for (const key in data.dogNames) {
      const result = await ns.dnet.authenticate(hostname, data.dogNames[key]);
      if (result.success) return result.success;
    }
  }
  return false;
};

const factoriOs = async (ns, hostname, details) => {
  for (let i = 10; i < 100; i++) {
    await ns.dnet.authenticate(hostname, i.toString());
    const heartbleed = await ns.dnet.heartbleed(hostname);
  }
  try {
    const data = JSON.parse(heartbleed.logs).data.split(",");
    if (!result.success) {
      if (data[0] || data[1]) arr.push(i);
    } else return true;
  } catch (e) {}
  return false;
};
const pr0verFl0 = async (ns, hostname, details) => {
  return false;
};
const nil = async (ns, hostname, details) => {
  return false;
};
const openWebAccessPoint = async (ns, hostname, details) => {
  return false;
};
const deepGreen = async (ns, hostname, details) => {
  const heartbleed = await ns.dnet.heartbleed(hostname, { logsToCapture: 3 });
  try {
    let arr = [];
    for (let i = 0; i < 10; i++) {
      let password = i.toString().repeat(details.passwordLength);
      const result = await ns.dnet.authenticate(hostname, password);
      if (!result.success) {
        const data = JSON.parse(heartbleed.logs).data.split(",");
        // ns.tprint(`Attempted: ${password}`);
        // ns.tprint(`Data: ${data}`);
        if (data[0] || data[1]) arr.push(i);
      } else return true;
    }
    // ns.tprint(hostname);
    // ns.tprint(`DATA: ${arr}`);
  } catch (e) {}
  return false;
};
