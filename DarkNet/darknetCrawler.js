/** @param {NS} ns */
export async function main(ns) {
  while (true) {
    // Get a list of all darknet hostnames directly connected to the current server
    const nearbyServers = ns.dnet.probe();

    // Attempt to authenticate with each of the nearby servers, and spread this script to them
    for (const hostname of nearbyServers) {
      const authenticationSuccessful = await serverSolver(ns, hostname);
      if (!authenticationSuccessful) continue;

      if (ns.dnet.getServerAuthDetails(hostname).modelId === "OctantVoxel")
        ns.tprint(
          `Successfully authenticated with ${hostname} using the OctantVoxel exploit!`,
        );

      ns.scp(ns.getScriptName(), hostname);
      ns.exec(ns.getScriptName(), hostname, {
        preventDuplicates: true,
      });
    }

    // TODO: free up blocked ram on this server using ns.dnet.memoryReallocation

    // TODO: look for .cache files on this server and open them with ns.dnet.openCache

    // TODO: take advantage of the extra ram on darknet servers to run ns.dnet.phishingAttack calls for money

    await ns.sleep(5000);
  }
}

/** Attempts to authenticate with the specified server using the Darknet API.
 * @param {NS} ns
 * @param {string} hostname - the name of the server to attempt to authorize on
 */
export const serverSolver = async (ns, hostname) => {
  const details = ns.dnet.getServerAuthDetails(hostname);

  if (details.hasSession) return true;
  if (!details.isConnectedToCurrentServer || !details.isOnline) return false;
  //   ns.tprint(details);

  switch (details.modelId) {
    case "ZeroLogon":
      return zeroLogon(ns, hostname, details);
    case "CloudBlare(tm)":
      return cloudBlare(ns, hostname, details);
    case "PHP 5.4":
      return PHP(ns, hostname, details);
    case "DeskMemo_3.1":
      return deskMemo(ns, hostname, details);
    case "FreshInstall_1.0":
      return freshInstall(ns, hostname, details);
    case "AccountsManager_4.2":
      return accountsManager(ns, hostname, details);
    case "OctantVoxel":
      return octantVoxel(ns, hostname, details);
    case "Pr0verFl0":
      return pr0verFl0(ns, hostname, details);
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
const deskMemo = async (ns, hostname, details) => {
  const hint = details.passwordHint;
  let password = hint.split(" ");

  const result = await ns.dnet.authenticate(hostname, password.at(-1));
  return result.success;
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
const PHP = async (ns, hostname, details) => {
  const shuffle = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  let num = details.data.split("");

  for (let i = 0; i < shuffle.length; i++) {
    let temp = "";
    for (let j = 0; j < shuffle[i].length; j++) {
      temp += num[shuffle[i][j]];
    }
    const result = await ns.dnet.authenticate(hostname, temp);
    if (result.success) return true;
  }
  return false;
};
const accountsManager = async (ns, hostname, details) => {
  for (let i = 0; i <= 100; i++) {
    if (i < 10) i = "0" + i;

    const result = await ns.dnet.authenticate(hostname, i.toString());
    if (result.success) return true;
  }

  return false;
};

const freshInstall = async (ns, hostname, details) => {
  return false;
};
const bellaCuore = async (ns, hostname, details) => {
  return false;
};
const pr0verFl0 = async (ns, hostname, details) => {
  return false;
};
