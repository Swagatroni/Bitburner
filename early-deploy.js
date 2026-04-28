import {
	getNetworkNodes,
	canPenetrate,
	hasRam,
	getRootAccess,
} from "./Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
	var target = ns.args[0] || "n00dles";
	var cracks = {
		"BruteSSH.exe": ns.brutessh,
		"FTPCrack.exe": ns.ftpcrack,
		"relaySMTP.exe": ns.relaysmtp,
		"HTTPWorm.exe": ns.httpworm,
		"SQLInject.exe": ns.sqlinject
	};

	var virus = "Curtain/profit.js";
	var virusRam = ns.getScriptRam(virus);

	async function copyAndRunVirus(server) {
		ns.print("Copying virus to server: " + server);
		ns.scp(virus, server);
		ns.killall(server);
		var maxThreads = Math.floor(ns.getServerMaxRam(server) / virusRam);
		ns.exec(virus, server, maxThreads, target);
	}

	function getTargetServers() {
		var networkNodes = getNetworkNodes(ns);
		var hackableNodes = networkNodes.filter(function (node) {
			if (node === ns.getHostname()) {
				return false;
			}
			return canPenetrate(ns, node, cracks);
		});

		// Get root access if they can be penetrated
		for (const node of hackableNodes) {
			if (!ns.hasRootAccess(node)) {
				getRootAccess(ns, node, cracks);
			}
		}

		// Filter ones we can run scripts on
		var targets = hackableNodes.filter(function (node) {
			return hasRam(ns, node, virusRam, true);
		});

		return targets;
	}

	async function deployHacks(targets) {
		for (var serv of targets) {
			await copyAndRunVirus(serv);
		}
	}

	var curTargets = [];
	var waitTime = 2000;

	while (true) {
		var newTargets = getTargetServers();
		if (newTargets.length !== curTargets.length) {
			await deployHacks(newTargets);
			ns.tprint(`Deploying to ${newTargets.length - curTargets.length} New Servers!`)
			curTargets = newTargets;
		}
		await ns.sleep(waitTime);
	}
}

export function autocomplete(data, args) {
	return [...data.servers, ...data.scripts];
}