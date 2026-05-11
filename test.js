/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  while (1) {
    const data1 = ns.readPort(1);
    const data2 = ns.readPort(2);

    if (data1) ns.tprint(`Port 1 (Write): ${data1}`);
    if (data2) ns.tprint(`Port 2 (TryWrite): ${data2}`);

    await ns.sleep(1000);
  }
}
