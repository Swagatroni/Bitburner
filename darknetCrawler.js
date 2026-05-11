/** @param {NS} ns */
const port = 1;

export async function main(ns) {
  ns.disableLog("ALL");

  while (true) {
    const scriptName = ns.getScriptName();
    const nearbyServers = ns.dnet.probe();
    let passwordKnown = false;
    let passwordChanged = false;

    for (const hostname of nearbyServers) {
      const raw = ns.read("passwords.json");
      const passwords = JSON.parse(raw);

      const serverData = passwords.known.find(
        (entry) => entry.server === hostname,
      );

      if (serverData) {
        passwordKnown = true;
        ns.print(`Known password for ${hostname}. Attempting to connect...`);
        const result = ns.dnet.connectToSession(hostname, serverData.password);

        if (!result.success) passwordChanged = true;
      }

      if (!passwordKnown || passwordChanged) {
        const authenticationSuccessful = await serverSolver(ns, hostname);
        if (!authenticationSuccessful) continue;
      }

      const deployed = await deployCrawler(ns, hostname, scriptName);
      if (!deployed) ns.print(`Deploy failed on ${hostname}`);
    }

    const isHomeServer = ns.getServer().hostname === "home";

    if (isHomeServer) await homeServer(ns, ns.getHostname());
    else await darknetServer(ns, ns.getHostname());

    await ns.sleep(1000);
  }
}

async function homeServer(ns, hostname) {
  while (true) {
    const receiverPort = ns.getPortHandle(port);
    if (!receiverPort.empty()) {
      try {
        const msg = receiverPort.read();
        const data = JSON.parse(msg);

        const filePath = "passwords.json";
        const raw = ns.read(filePath, "home");
        const passwords = JSON.parse(raw);

        if (!Array.isArray(passwords.known)) passwords.known = [];

        const serverData = passwords.known.find(
          (entry) => entry.server === hostname,
        );

        if (!serverData) {
          passwords.known.push(data);
          ns.write(filePath, JSON.stringify(passwords, null, 4), "w", "home");
          ns.print(`New password added (${hostname})`);
        } else if (serverData.password !== data.password) {
          serverData.password = data.password;
          ns.write(filePath, JSON.stringify(passwords, null, 4), "w", "home");
          ns.print(`Password Updated (${hostname})`);
        }
      } catch (e) {
        ns.print(`ERROR:\t ${e.message}`);
      }
    }

    await ns.sleep(100);
  }
}
async function darknetServer(ns, hostname) {
  const myFiles = ns.ls("home");
  const files = ns.ls(hostname);

  for (const file of files) {
    if (file.endsWith(".cache")) {
      ns.dnet.openCache(file);
      continue;
    }

    if (
      !myFiles.includes(file) &&
      !file.endsWith(".exe") &&
      !file.endsWith(".cct")
    ) {
      if (ns.scp(file, "home")) ns.tprint(`Transferred: ${file}`);
    }
  }

  await ns.dnet.memoryReallocation();
  await ns.dnet.phishingAttack();
}

/**
 * @param {NS} ns
 * @param {string} hostname
 * @param {string} scriptName
 */
const deployCrawler = async (ns, hostname, scriptName) => {
  const copied = await ns.scp([scriptName, "passwords.json"], hostname);
  if (!copied) return false;

  const pid = ns.exec(scriptName, hostname, {
    preventDuplicates: true,
  });
  return pid !== 0;
};
export const serverSolver = async (ns, hostname) => {
  const details = ns.dnet.getServerAuthDetails(hostname);

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
// HELPERS
const getCharset = (passwordFormat) => {
  switch (passwordFormat) {
    case "numeric":
      return "0123456789";
    case "alphabetic":
      return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    case "alphanumeric":
      return "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    default:
      return "";
  }
};
const parseFeedback = (logs, attemptedPassword, parser) => {
  if (!Array.isArray(logs)) return null;

  for (const line of logs) {
    if (typeof line !== "string") continue;

    try {
      const parsed = JSON.parse(line);
      if (!parsed || parsed.passwordAttempted !== attemptedPassword) continue;

      const feedback = parser(parsed.data, parsed);
      if (feedback) return feedback;
    } catch (e) {}
  }

  return null;
};
const getFeedback = async (
  ns,
  hostname,
  attemptedPassword,
  parser,
  successFactory,
) => {
  for (let i = 0; i < 3; i++) {
    const result = await ns.dnet.authenticate(hostname, attemptedPassword);
    if (result.success)
      return {
        success: true,
        ...(successFactory ? successFactory(attemptedPassword) : {}),
      };

    const heartbleed = await ns.dnet.heartbleed(hostname, { logsToCapture: 6 });
    const feedback = parseFeedback(heartbleed.logs, attemptedPassword, parser);
    if (feedback) return { success: false, ...feedback };
  }

  return null;
};
const tryPassword = async (ns, hostname, password) => {
  const result = await ns.dnet.authenticate(hostname, password);
  if (result.success) {
    const data = {
      server: hostname,
      password: password,
      model: ns.dnet.getServerAuthDetails(hostname).modelId,
    };

    pushDataToPort(ns, data, ns.getPortHandle(port));
    return true;
  }
  return false;
};
const pushDataToPort = (ns, data, handle) => {
  if (handle.full()) {
    ns.print("ERROR\tUnable to push data. Port is full!");
    return;
  }

  const dataStr = JSON.stringify(data);
  ns.print(`INFO\tPUSHED data to port: ${dataStr}.`);
  handle.write(dataStr);
};

// Model Specific Parsers
const parseDeepGreenFeedbackData = (data) => {
  const [exactRaw, misplacedRaw] = String(data ?? "").split(",");
  const exact = Number(exactRaw);
  const misplaced = Number(misplacedRaw);
  if (!Number.isFinite(exact) || !Number.isFinite(misplaced)) return null;
  return { exact, misplaced };
};
const parseNilFeedbackData = (data) => {
  const matches = String(data ?? "")
    .split(",")
    .map((value) => value.trim() === "yes");
  if (matches.length === 0) return null;
  return { matches };
};

// Model Specific Solvers
const zeroLogon = async (ns, hostname, details) => {
  return await tryPassword(ns, hostname, "");
};
const cloudBlare = async (ns, hostname, details) => {
  let password = "";
  const data = details.data;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    if (char >= "0" && char <= "9") password += char;
  }

  return await tryPassword(ns, hostname, password);
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
    if (await tryPassword(ns, hostname, temp)) return true;
  }
  return false;
};
const deskMemo = async (ns, hostname, details) => {
  const hint = details.passwordHint;
  let password = hint.split(" ");

  return await tryPassword(ns, hostname, password.at(-1));
};
const octantVoxel = async (ns, hostname, details) => {
  const base = details.data.split(",")[0];
  let num = details.data.split(",")[1].split("").reverse();
  let password = 0;

  for (let i = 0; i < num.length; i++) {
    password += parseInt(num[i]) * Math.pow(base, i);
  }
  return await tryPassword(ns, hostname, password.toString());
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
  return await tryPassword(ns, hostname, password.toString());
};
const freshInstall = async (ns, hostname, details) => {
  const passwords = [`admin`, `password`, `0000`, `12345`];

  for (const key in passwords) {
    if (await tryPassword(ns, hostname, passwords[key])) return true;
  }
  return false;
};
const laika4 = async (ns, hostname, details) => {
  const dogNames = ["fido", "spot", "rover", "max"];

  for (const key in dogNames) {
    if (await tryPassword(ns, hostname, dogNames[key])) return true;
  }
  return false;
};
const deepGreen = async (ns, hostname, details) => {
  const length = details.passwordLength;
  const alphabet = getCharset(details.passwordFormat);

  const counts = new Map();
  for (const char of alphabet) {
    const guess = char.repeat(length);
    const feedback = await getFeedback(
      ns,
      hostname,
      guess,
      parseDeepGreenFeedbackData,
      (effort) => ({ exact: effort.length, misplaced: 0 }),
    );
    if (!feedback) continue;
    if (feedback.success) return true;

    const count = feedback.exact + feedback.misplaced;
    if (count > 0) counts.set(char, count);
  }

  const totalKnown = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (totalKnown !== length) return false;

  let filler = null;
  for (const char of alphabet) {
    if (!counts.has(char)) {
      filler = char;
      break;
    }
  }
  if (filler === null) return false;

  const solved = Array(length).fill(null);
  let exactFixed = 0;

  for (const [char, count] of counts.entries()) {
    let remaining = count;

    for (let i = 0; i < length && remaining > 0; i++) {
      if (solved[i] !== null) continue;

      const guess = solved.map((value) => value ?? filler);
      guess[i] = char;

      const feedback = await getFeedback(
        ns,
        hostname,
        guess.join(""),
        parseDeepGreenFeedbackData,
        (effort) => ({ exact: effort.length, misplaced: 0 }),
      );
      if (!feedback) continue;
      if (feedback.success) return true;

      if (feedback.exact > exactFixed) {
        solved[i] = char;
        exactFixed += 1;
        remaining -= 1;
      }
    }
  }

  if (solved.some((char) => char === null)) return false;

  const password = solved.join("");
  return await ns.dnet.authenticate(hostname, password);
};
const nil = async (ns, hostname, details) => {
  const length = details.passwordLength;
  const alphabet = getCharset(details.passwordFormat);

  if (!Number.isFinite(length) || length <= 0 || !alphabet) return false;

  const solved = Array(length).fill(null);
  let solvedCount = 0;

  for (const char of alphabet) {
    const guess = solved
      .map((value) => (value === null ? char : value))
      .join("");

    const feedback = await getFeedback(
      ns,
      hostname,
      guess,
      parseNilFeedbackData,
      (effort) => ({ matches: Array(effort.length).fill(true) }),
    );

    if (!feedback) continue;
    if (feedback.success) return true;

    for (let i = 0; i < Math.min(feedback.matches.length, length); i++) {
      if (feedback.matches[i] && solved[i] === null) {
        solved[i] = char;
        solvedCount += 1;
      }
    }

    if (solvedCount === length) break;
  }

  if (solvedCount !== length) return false;
  return await tryPassword(ns, hostname, solved.join(""));
};

// Unfinished Solvers
const accountsManager = async (ns, hostname, details) => {
  return false;
};
const factoriOs = async (ns, hostname, details) => {
  return false;
};
const pr0verFl0 = async (ns, hostname, details) => {
  return false;
};
const openWebAccessPoint = async (ns, hostname, details) => {
  return false;
};
