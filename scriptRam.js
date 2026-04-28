/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  class Script {
    constructor(name) {
      this.name = name;
      this.ram = ns.getScriptRam(name);
    }
  }

  const scripts = [];
  let lessthan10 = 0;
  for (const script of ns.ls("home", "js")) {
    const s = new Script(script);
    if (s.ram < 10) {
      lessthan10++;
      continue;
    }

    if (s.name.includes("Curtain")) continue;

    scripts.push(s);
  }

  scripts.sort((a, b) => b.ram - a.ram);

  for (const s of scripts) {
    ns.tprint(`Script: ${s.name} || RAM: ${s.ram}`);
  }

  ns.tprint(`Scripts with less than 10GB RAM: ${lessthan10}`);
}
