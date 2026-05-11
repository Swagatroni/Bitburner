import { runCorpManager } from "./corp-manager-core.js";

/** @param {NS} ns **/
export async function main(ns) {
  await runCorpManager(ns, "floor");
}
