import { getPservs, serverUpgrades } from "./Curtain/utils.js";
/** watchtower.js
 * Monitors all actively running scripts and displays their ns.print() updates
 *
 * Usage:
 *   run watchtower.js
 *   run watchtower.js --tail
 */

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const CFG = {
    updateIntervalMs: 1000, // How often to check for updates
    maxLogsDefault: 3, // Fallback if script is not listed below
    maxLogsByScript: {
      "gang-management.js": 2,
      "bladeburner.js": 3,
      // "some-script.js": 5,
    },
    showInactive: false, // Show scripts with no recent output
  };

  const getMaxLogsForScript = (filename) =>
    CFG.maxLogsByScript[filename] ?? CFG.maxLogsDefault;

  // Track what we've already shown to avoid duplicates
  const shownLogs = new Map(); // scriptKey -> lastLogIndex

  while (true) {
    ns.clearLog();

    const allScripts = ns.ps();
    const activeScripts = allScripts.filter(
      (s) =>
        s.filename !== "watchtower.js" &&
        s.filename !== "aps.js" &&
        s.filename !== "custom-stats.js" &&
        s.filename !== "GOD-EYE.js" &&
        s.filename !== "launch-fleets.js" &&
        s.filename !== "hacknet.js" &&
        s.filename !== "sleeves.js",
    );
    if (activeScripts.length === 0) {
      ns.print("═══════════════════════════════════════════════════");
      ns.print("    WATCHTOWER - No Active Scripts");
      ns.print("═══════════════════════════════════════════════════");
      await ns.sleep(CFG.updateIntervalMs);
      continue;
    }

    ns.print("═══════════════════════════════════════════════════");
    ns.print("    WATCHTOWER - Active Monitoring");
    ns.print(`    Money: $${ns.formatNumber(ns.getPlayer().money)}`);

    try {
      const pservs = getPservs(ns);
      let size = ns.getServerMaxRam(pservs[0]) || null;
      ns.print(`    PServs (${ns.formatRam(size, 0)}):  ${serverUpgrades(ns)}`);
    } catch (error) {}
    ns.print(` `);
    ns.print(`    ${new Date().toLocaleTimeString()}`);
    ns.print("═══════════════════════════════════════════════════");
    ns.print("");

    for (const script of activeScripts) {
      const scriptKey = `${script.filename}_${script.pid}`;
      const logs = ns.getScriptLogs(
        script.filename,
        script.server,
        ...script.args,
      );

      if (logs.length === 0 && !CFG.showInactive) continue;

      // Determine which logs are new
      const lastShownIndex = shownLogs.get(scriptKey) || -1;
      const newLogs = logs.slice(Math.max(0, lastShownIndex + 1));

      // Update tracking
      shownLogs.set(scriptKey, logs.length - 1);

      // Display script header
      ns.print(`┌─ ${script.filename} (PID: ${script.pid})`);
      if (script.args.length > 0) {
        ns.print(`│  Args: ${script.args.join(" ")}`);
      }

      // Show most recent logs (limited per script)
      const maxLogs = getMaxLogsForScript(script.filename);
      const displayLogs = logs.slice(-maxLogs);

      if (displayLogs.length > 0) {
        for (const log of displayLogs) {
          // Check if this is a new log since last check
          const isNew = false; // newLogs.includes(log);
          const prefix = isNew ? "│ ➤ " : "│   ";
          ns.print(`${prefix}${log}`);
        }
      } else {
        ns.print("│   (no output)");
      }

      ns.print("└──────────────────────────────────────────────────");
      ns.print("");
    }

    // Clean up tracking for scripts that are no longer running
    const activeKeys = new Set(
      activeScripts.map((s) => `${s.filename}_${s.pid}`),
    );
    for (const key of shownLogs.keys()) {
      if (!activeKeys.has(key)) {
        shownLogs.delete(key);
      }
    }

    await ns.sleep(CFG.updateIntervalMs);
  }
}
