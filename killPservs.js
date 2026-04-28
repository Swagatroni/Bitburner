import { getPservs } from "./Curtain/utils.js";

/** @param {NS} ns */
export async function main(ns) {
  let pservs = getPservs(ns);
  for (let i = 0; i < pservs.length; i++) {
    ns.killall(pservs[i]);
  }

  ns.toast("All purchased servers killed.")
}