import { getNetworkNodes } from "/Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  const nodes = getNetworkNodes(ns).filter(
    (node) => !node.startsWith("pserv-")
  );
  const contracts = [];
  //remove home from nodes

  for (const node of nodes) {
    let files = ns.ls(node);
    files = files.filter((file) => file !== "profit.js");
    if (files.length > 0) {
      for (const file of files) {
        if (file.endsWith(".cct")) contracts.push({ server: node, file: file });
      }
    }
  }
  for (const contract of contracts)
    ns.tprint(`${contract.server}: ${contract.file}`);
}
