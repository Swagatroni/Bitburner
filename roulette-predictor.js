/** @param {NS} ns **/

// --- RNG core (mirrors Casino/RNG.ts WHRNG) ---

function makeState(seedMs) {
  const value = (seedMs / 1000) % 30000;
  return { seedMs, s1: value, s2: value, s3: value };
}

function cloneState(state) {
  return { seedMs: state.seedMs, s1: state.s1, s2: state.s2, s3: state.s3 };
}

function nextRouletteNumber(state) {
  const next = cloneState(state);
  next.s1 = (171 * next.s1) % 30269;
  next.s2 = (172 * next.s2) % 30307;
  next.s3 = (170 * next.s3) % 30323;
  const roll = (next.s1 / 30269 + next.s2 / 30307 + next.s3 / 30323) % 1;
  return { state: next, number: Math.floor(roll * 37) };
}

// --- Candidate filtering ---

function expandObservedState(state, observed, calibrationBet) {
  const results = [];
  const first = nextRouletteNumber(state);

  // No cheat-aware tracking — treat raw result only.
  if (calibrationBet < 0) {
    if (first.number === observed) results.push(first.state);
    return results;
  }

  // If the first roll is not the calibration bet, the house did not cheat.
  if (first.number !== calibrationBet) {
    if (first.number === observed) results.push(first.state);
    return results;
  }

  // First roll matched the calibration bet.
  // House may or may not cheat (10% chance). Both branches are valid.
  if (observed === calibrationBet) results.push(first.state); // no cheat

  // Cheat path: house keeps rerolling until it lands off the bet.
  let cheatState = cloneState(first.state);
  while (true) {
    const reroll = nextRouletteNumber(cheatState);
    cheatState = reroll.state;
    if (reroll.number !== calibrationBet) {
      if (reroll.number === observed) results.push(cheatState);
      break;
    }
  }

  return results;
}

function narrowCandidates(candidates, observed, calibrationBet) {
  const next = [];
  for (const candidate of candidates) {
    for (const state of expandObservedState(
      candidate.state,
      observed,
      calibrationBet,
    )) {
      next.push({ seedMs: candidate.seedMs, state });
    }
  }
  return next;
}

function buildInitialCandidates(estimate, windowMs) {
  const start = estimate - windowMs;
  const end = estimate + windowMs;
  const candidates = [];
  for (let seedMs = start; seedMs <= end; seedMs++) {
    candidates.push({ seedMs, state: makeState(seedMs) });
  }
  return candidates;
}

// --- Prediction helpers ---

function predictSequence(state, count) {
  const values = [];
  let cursor = cloneState(state);
  for (let i = 0; i < count; i++) {
    const next = nextRouletteNumber(cursor);
    values.push(next.number);
    cursor = next.state;
  }
  return values;
}

function summarizeNextNumbers(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    const n = nextRouletteNumber(candidate.state).number;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number);
}

function printPrediction(ns, candidates) {
  const total = candidates.length;
  const ranked = summarizeNextNumbers(candidates);
  ns.tprint("─── Next spin prediction ───────────────────");
  for (const entry of ranked.slice(0, 5)) {
    const pct = ((entry.count / total) * 100).toFixed(1);
    const bar = "█".repeat(Math.round((entry.count / total) * 20));
    ns.tprint(
      `  Bet ${String(entry.number).padStart(2)}  ${bar.padEnd(20)}  ${pct}%  (${entry.count}/${total})`,
    );
  }
  if (candidates.length === 1) {
    ns.tprint(
      `  Full sequence: ${predictSequence(candidates[0].state, 15).join(", ")}`,
    );
  }
  ns.tprint("────────────────────────────────────────────");
}

function buildNextSequenceSummary(candidates, count) {
  if (candidates.length === 0) {
    return { sequence: [], exact: false };
  }

  if (candidates.length === 1) {
    return {
      sequence: predictSequence(candidates[0].state, count),
      exact: true,
    };
  }

  const candidateStates = candidates.map((c) => cloneState(c.state));
  const sequence = [];

  for (let i = 0; i < count; i++) {
    const counts = new Map();
    for (let j = 0; j < candidateStates.length; j++) {
      const next = nextRouletteNumber(candidateStates[j]);
      candidateStates[j] = next.state;
      counts.set(next.number, (counts.get(next.number) || 0) + 1);
    }

    let bestNumber = -1;
    let bestCount = -1;
    for (const [number, freq] of counts.entries()) {
      if (freq > bestCount || (freq === bestCount && number < bestNumber)) {
        bestNumber = number;
        bestCount = freq;
      }
    }
    sequence.push(bestNumber);
  }

  return { sequence, exact: false };
}

// --- Interactive mode ---

async function interactiveMode(ns, sleepMs) {
  const numberChoices = Array.from({ length: 37 }, (_, i) => String(i));
  const sleepSec = (sleepMs / 1000).toFixed(0);

  // Step 1: capture open timestamp
  ns.tprint("=== Roulette Predictor — Interactive Mode ===");
  ns.tprint("Before opening roulette, run this in the browser console:");
  ns.tprint(
    '  new MutationObserver(function(_,o){const b=document.querySelector(\'input[type="number"]\');if(b){const t=Date.now();console.log("ROULETTE_OPEN",t);copy(String(t));o.disconnect();}}).observe(document.body,{childList:true,subtree:true});',
  );
  ns.tprint("It copies the timestamp to your clipboard when roulette opens.");

  const tsInput = await ns.prompt(
    "Paste the roulette open timestamp (Date.now() from browser console):",
    { type: "text" },
  );
  const estimate = Math.floor(Number(String(tsInput).trim()));
  if (!Number.isFinite(estimate) || estimate <= 0) {
    ns.tprint("Invalid timestamp — exiting.");
    return;
  }

  // Step 2: choose calibration number
  const betInput = await ns.prompt(
    "Pick a single number you will ALWAYS bet during calibration spins.\n(Minimum wager each time — just to observe the result.)",
    { type: "select", choices: numberChoices },
  );
  const calibrationBet = Number(betInput);

  // Step 3: choose search window
  const windowChoices = ["500", "1000", "2000", "5000", "10000", "30000"];
  const windowInput = await ns.prompt(
    "How precise was your timestamp?\n500ms = very precise (console observer)\n5000ms = rough manual estimate\n30000ms = very rough",
    { type: "select", choices: windowChoices },
  );
  const windowMs = Number(windowInput);

  let candidates = buildInitialCandidates(estimate, windowMs);
  ns.tprint(
    `Built ${candidates.length} initial candidates over ±${windowMs}ms.`,
  );

  if (candidates.length === 0) {
    ns.tprint("No candidates. Check your timestamp.");
    return;
  }

  let spinCount = 0;

  // Calibration loop
  while (candidates.length > 1) {
    spinCount++;
    ns.tprint(`[Spin ${spinCount}] ${candidates.length} candidates remaining.`);
    ns.alert(
      `  → Switch to roulette. Bet number ${calibrationBet} with the MINIMUM wager and spin now.`,
    );
    ns.tprint(`  Sleeping ${sleepSec}s — go spin, then come back...`);
    await ns.sleep(sleepMs);

    const resultInput = await ns.prompt(
      `Spin ${spinCount}: What number did the wheel show?\n(You bet ${calibrationBet} — record whatever the wheel displayed, win or lose.)`,
      { type: "select", choices: numberChoices },
    );
    const observed = Number(resultInput);

    candidates = narrowCandidates(candidates, observed, calibrationBet);
    ns.tprint(
      `  Observed ${observed} → ${candidates.length} candidates remaining.`,
    );

    if (candidates.length === 0) {
      ns.tprint(
        "No candidates left. One value may be wrong, or the time window is too narrow.",
      );
      const retry = await ns.prompt("Widen search window ×6 and restart?", {
        type: "boolean",
      });
      if (retry) {
        candidates = buildInitialCandidates(estimate, windowMs * 6);
        ns.tprint(
          `Widened to ±${windowMs * 6}ms — ${candidates.length} candidates. Restarting calibration.`,
        );
        spinCount = 0;
      } else {
        return;
      }
    }

    printPrediction(ns, candidates);

    if (candidates.length <= 3) {
      const goLive = await ns.prompt(
        `${candidates.length} candidate(s) left. Ready to start betting for real?`,
        { type: "boolean" },
      );
      if (goLive) break;
    }
  }

  const nextTen = buildNextSequenceSummary(candidates, 10);
  if (nextTen.sequence.length > 0) {
    const label = nextTen.exact
      ? "Next 10 numbers (exact):"
      : `Next 10 numbers (best guess across ${candidates.length} candidates):`;
    ns.alert(`${label}\n${nextTen.sequence.join(", ")}`);
  }

  // Live betting loop
  ns.tprint(
    "=== LIVE MODE — Bet exact number shown, max wager ($10,000,000) ===",
  );
  while (true) {
    if (candidates.length === 0) {
      ns.tprint("No candidates — seed tracking lost. Restart the script.");
      break;
    }

    printPrediction(ns, candidates);
    const topBet = summarizeNextNumbers(candidates)[0]?.number ?? -1;
    ns.tprint(`  >>> Bet number ${topBet} with MAX wager. Spinning now... <<<`);
    ns.tprint(`  Sleeping ${sleepSec}s — go spin, then come back...`);
    await ns.sleep(sleepMs);

    const liveResult = await ns.prompt("What number did the wheel show?", {
      type: "select",
      choices: numberChoices,
    });
    const liveObserved = Number(liveResult);

    candidates = narrowCandidates(candidates, liveObserved, topBet);
    ns.tprint(
      `  Observed ${liveObserved} → ${candidates.length} candidates remaining.`,
    );

    const keepGoing = await ns.prompt("Continue?", { type: "boolean" });
    if (!keepGoing) break;
  }

  ns.tprint("Session ended.");
}

// --- Flag-based batch mode (original) ---

function parseObserved(observed) {
  if (!observed || observed.trim() === "") return [];
  return observed
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 36);
}

async function batchMode(ns, flags) {
  const estimate = Math.floor(Number(flags.estimate));
  const windowMs = Math.max(0, Math.floor(Number(flags.window)));
  const count = Math.max(1, Math.floor(Number(flags.count)));
  const limit = Math.max(1, Math.floor(Number(flags.limit)));
  const calibrationBet = Math.floor(Number(flags.bet));
  const observations = parseObserved(String(flags.observed || ""));

  if (String(flags.observed || "").trim() !== "" && observations.length === 0) {
    ns.tprint(
      "No valid observed numbers parsed. Use comma-separated 0-36 values.",
    );
    return;
  }
  if (calibrationBet > 36) {
    ns.tprint("--bet must be 0-36 or -1 to disable cheat-aware filtering.");
    return;
  }

  let candidates = buildInitialCandidates(estimate, windowMs);
  for (const observed of observations) {
    candidates = narrowCandidates(candidates, observed, calibrationBet);
    if (candidates.length === 0) break;
  }

  ns.tprint(
    `Checked ${windowMs * 2 + 1} seeds. Observations: ${observations.length}. Candidates: ${candidates.length}.`,
  );

  if (candidates.length === 0) {
    ns.tprint("No seeds matched. Widen --window or verify --observed values.");
    return;
  }

  printPrediction(ns, candidates);

  ns.tprint("Top candidate sequences:");
  for (const candidate of candidates.slice(0, limit)) {
    const seq = predictSequence(candidate.state, count).join(", ");
    ns.tprint(`  seed=${candidate.seedMs} next=[${seq}]`);
  }
  if (candidates.length > limit)
    ns.tprint(`  ... ${candidates.length - limit} more omitted.`);

  if (observations.length === 0) {
    ns.tprint("Tip: add --observed 17,24,6 --bet 1 to narrow the list.");
  } else if (candidates.length > 1) {
    ns.tprint(
      "Tip: do one more calibration spin and append the result to --observed.",
    );
  } else {
    ns.tprint("Single candidate — bet the first number in the sequence above.");
  }
}

// --- Entry point ---

export function autocomplete(data, args) {
  return [];
}

export async function main(ns) {
  const flags = ns.flags([
    ["estimate", 0],
    ["window", 5000],
    ["count", 10],
    ["observed", ""],
    ["bet", -1],
    ["limit", 20],
    ["sleep", 5000],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Run without flags for interactive guided mode.");
    ns.tprint(
      "  --sleep <ms>  How long to sleep before asking for each result (default 5000).",
    );
    ns.tprint(
      "Batch: run roulette-predictor.js --estimate <ts> [--window 5000] [--observed 17,24,6] [--bet 1] [--count 10]",
    );
    return;
  }

  const sleepMs = Math.max(1000, Math.floor(Number(flags.sleep)));
  const hasEstimate =
    Number.isFinite(Number(flags.estimate)) && Number(flags.estimate) > 0;

  if (!hasEstimate) {
    await interactiveMode(ns, sleepMs);
  } else {
    await batchMode(ns, flags);
  }
}
