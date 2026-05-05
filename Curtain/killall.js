import { getNetworkNodes } from "./utils.js";

/** @param {NS} ns */
export async function main(ns) {
  let nodes = getNetworkNodes(ns);
  nodes = nodes.filter((node) => node != "home");

  for (let node of nodes) ns.killall(node);
  ns.killall("home");

  ns.toast("Killed all scripts.");
}
