import { getPotentialTargets } from "./find-targets.js";

/** @param {NS} ns **/
export async function main(ns) {
	const compareType = ns.args[0];
	ns.disableLog("ALL");
	ns.ui.openTail();
	const waitTime = 2000;
	while (true) {
		ns.clearLog();
		const lines = [];
		// Build lines
		const targets = getPotentialTargets(ns, compareType);
		for (const target of targets) {
			const node = target.node;
			const strategy = target["strategy.type"];
			let variant = "INFO";
			let icon = "💵";
			if (strategy === "flog") {
				variant = "ERROR";
				icon = "☠️";
			} else if (strategy === "nourish") {
				variant = "SUCCESS";
				icon = "🌱";
			}
			ns.print(`${variant}\t${icon} ${strategy} @ ${node} (${target.reqHackLevel})`);
		}
		await ns.sleep(waitTime);
	}
}