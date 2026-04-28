/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const mode = String(ns.args[0] ?? "help").toLowerCase();

  if (mode === "help") {
    printHelp(ns);
    return;
  }

  if (mode === "list") {
    listFragments(ns);
    return;
  }

  if (mode === "place") {
    placeHackingStarter(ns);
    return;
  }

  if (mode === "charge") {
    await chargeLoop(ns);
    return;
  }

  ns.tprint("Unknown mode. Use: run stanek.js help");
}

function printHelp(ns) {
  ns.tprint("Stanek helper modes:");
  ns.tprint("run stanek.js help   -> show commands");
  ns.tprint("run stanek.js list   -> list all fragment definitions");
  ns.tprint("run stanek.js place  -> place a hacking-first starter layout");
  ns.tprint("run stanek.js charge -> continuously charge all active fragments");
  ns.tprint(" ");
  ns.tprint(
    "Hacking-first priority: money > speed > growth > hacking > rep > boosters",
  );
}

function listFragments(ns) {
  const defs = ns.stanek.fragmentDefinitions();
  defs.sort((a, b) => a.type - b.type || b.power - a.power || a.id - b.id);

  for (const d of defs) {
    ns.print(
      `id=${d.id} type=${d.type} power=${d.power} limit=${d.limit} effect=${d.effect}`,
    );
  }

  ns.tprint(`Listed ${defs.length} fragments in tail.`);
}

function placeHackingStarter(ns) {
  const stanek = ns.stanek;
  const defs = stanek.fragmentDefinitions();
  const width = stanek.giftWidth();
  const height = stanek.giftHeight();

  const typePriority = [7, 6, 8, 5, 25, 0];
  const desiredByType = {
    7: 2, // hacking money
    6: 1, // hacking speed
    8: 1, // hacking grow
    5: 1, // hacking skill
    25: 1, // reputation gain
    0: 2, // boosters
  };

  const candidates = [];
  for (const type of typePriority) {
    const bestForType = defs
      .filter((d) => d.type === type)
      .sort((a, b) => b.power - a.power || a.id - b.id)[0];

    if (!bestForType) continue;

    const count = Math.min(bestForType.limit, desiredByType[type] ?? 1);
    for (let i = 0; i < count; i++) {
      candidates.push(bestForType.id);
    }
  }

  if (candidates.length === 0) {
    ns.tprint("No matching hacking fragments available yet.");
    return;
  }

  for (const f of stanek.activeFragments()) {
    stanek.removeFragment(f.x, f.y);
  }

  const positions = buildCenterFirstPositions(width, height);
  const placed = [];

  for (const id of candidates) {
    let didPlace = false;

    for (let rotation = 0; rotation < 4 && !didPlace; rotation++) {
      for (const pos of positions) {
        if (!stanek.canPlaceFragment(pos.x, pos.y, rotation, id)) continue;

        if (stanek.placeFragment(pos.x, pos.y, rotation, id)) {
          placed.push({ id, x: pos.x, y: pos.y, rotation });
          didPlace = true;
          break;
        }
      }
    }
  }

  ns.tprint(
    `Placed ${placed.length}/${candidates.length} requested fragments on ${width}x${height} board.`,
  );
  for (const p of placed) {
    ns.print(`Placed id=${p.id} at (${p.x}, ${p.y}) rot=${p.rotation}`);
  }
  ns.tprint("Next: run stanek.js charge");
}

function buildCenterFirstPositions(width, height) {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const positions = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.abs(x - cx) + Math.abs(y - cy);
      positions.push({ x, y, dist });
    }
  }

  positions.sort((a, b) => a.dist - b.dist || a.y - b.y || a.x - b.x);
  return positions;
}

async function chargeLoop(ns) {
  const stanek = ns.stanek;

  if (stanek.activeFragments().length === 0) {
    ns.tprint("No active fragments found. Run: run stanek.js place");
    return;
  }

  while (true) {
    for (const f of stanek.activeFragments()) {
      try {
        await stanek.chargeFragment(f.x, f.y);
      } catch (e) {}
    }
  }
}
