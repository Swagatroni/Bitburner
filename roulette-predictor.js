#!/usr/bin/env node

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

function parseArgs(argv) {
  const out = {
    sleep: 3000,
    count: 20,
    window: 500,
    bet: 1,
    observed: "",
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const val = argv[i + 1];
    if (typeof val === "undefined" || val.startsWith("--")) continue;

    if (key === "sleep") out.sleep = Number(val);
    else if (key === "count") out.count = Number(val);
    else if (key === "window") out.window = Number(val);
    else if (key === "bet") out.bet = Number(val);
    else if (key === "observed") out.observed = val;

    i++;
  }

  out.sleep = Math.max(0, Math.floor(Number(out.sleep) || 0));
  out.count = Math.max(1, Math.floor(Number(out.count) || 20));
  out.window = Math.max(0, Math.floor(Number(out.window) || 500));
  out.bet = Math.floor(Number(out.bet));
  return out;
}

function makeState(seedMs) {
  const v = (seedMs / 1000) % 30000;
  return { seedMs, s1: v, s2: v, s3: v };
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

function predictSequenceFromSeed(seedMs, count) {
  let state = makeState(seedMs);
  const result = [];
  for (let i = 0; i < count; i++) {
    const next = nextRouletteNumber(state);
    result.push(next.number);
    state = next.state;
  }
  return result;
}

function parseObserved(text) {
  if (!text || !text.trim()) return [];
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 36);
}

function expandObservedState(state, observed, calibrationBet) {
  const results = [];
  const first = nextRouletteNumber(state);

  if (calibrationBet < 0) {
    if (first.number === observed) results.push(first.state);
    return results;
  }

  if (first.number !== calibrationBet) {
    if (first.number === observed) results.push(first.state);
    return results;
  }

  if (observed === calibrationBet) {
    results.push(first.state);
  }

  // Cheat branch: reroll until result is not the calibration bet.
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
    const states = expandObservedState(
      candidate.state,
      observed,
      calibrationBet,
    );
    for (const state of states) {
      next.push({ seedMs: candidate.seedMs, state });
    }
  }
  return next;
}

function buildCandidates(estimate, windowMs) {
  const start = estimate - windowMs;
  const end = estimate + windowMs;
  const out = [];
  for (let seedMs = start; seedMs <= end; seedMs++) {
    out.push({ seedMs, state: makeState(seedMs) });
  }
  return out;
}

function summarizeNextNumbers(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    const next = nextRouletteNumber(candidate.state);
    counts.set(next.number, (counts.get(next.number) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number);
}

function usage() {
  console.log("Roulette Predictor (Node CLI)");
  console.log("");
  console.log("Usage:");
  console.log(
    "  node roulette-predictor.js [--sleep 3000] [--count 20] [--window 500] [--bet 1] [--observed 17,24]",
  );
  console.log("");
  console.log("Flags:");
  console.log(
    "  --sleep     Milliseconds to wait before prompting for roulette-open timestamp",
  );
  console.log("  --count     Number of future spins to print");
  console.log("  --window    Seed search window in ms (+/- around timestamp)");
  console.log(
    "  --bet       Calibration single-number bet (use -1 to disable cheat-aware filtering)",
  );
  console.log(
    "  --observed  Optional observed results (comma-separated), e.g. 17,24,6",
  );
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    usage();
    return;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log("Paste this in browser console before clicking Play roulette:");
    console.log(
      "new MutationObserver((_,o)=>{const b=document.querySelector('input[type=\"number\"]');if(b){const t=Date.now();console.log('ROULETTE_OPEN',t);copy(String(t));o.disconnect();}}).observe(document.body,{childList:true,subtree:true});",
    );
    console.log("");

    if (flags.sleep > 0) {
      console.log(`Sleeping ${flags.sleep}ms. Open roulette now...`);
      await new Promise((resolve) => setTimeout(resolve, flags.sleep));
    }

    const inputTs = (
      await rl.question("Paste roulette-open timestamp (Date.now): ")
    ).trim();
    const estimate = Math.floor(Number(inputTs));
    if (!Number.isFinite(estimate) || estimate <= 0) {
      console.error("Invalid timestamp.");
      return;
    }

    const observedText =
      flags.observed && flags.observed.trim().length > 0
        ? flags.observed
        : (
            await rl.question(
              "Optional observed results (comma-separated, Enter to skip): ",
            )
          ).trim();

    const observed = parseObserved(observedText);
    if (observedText && observedText.length > 0 && observed.length === 0) {
      console.error(
        "Could not parse observed values. Use format like: 17,24,6",
      );
      return;
    }

    let candidates = buildCandidates(estimate, flags.window);
    for (const n of observed) {
      candidates = narrowCandidates(candidates, n, flags.bet);
      if (candidates.length === 0) break;
    }

    console.log("");
    console.log(`Checked ${flags.window * 2 + 1} seeds around ${estimate}.`);
    console.log(
      `Observed values used: ${observed.length}. Remaining candidates: ${candidates.length}.`,
    );

    if (candidates.length === 0) {
      console.log(
        "No candidates matched. Try larger --window or verify observed values.",
      );
      return;
    }

    const ranked = summarizeNextNumbers(candidates);
    console.log("");
    console.log("Top next-spin bets:");
    for (const row of ranked.slice(0, 5)) {
      const pct = ((row.count / candidates.length) * 100).toFixed(2);
      console.log(
        `  ${String(row.number).padStart(2)} -> ${row.count}/${candidates.length} (${pct}%)`,
      );
    }

    console.log("");
    if (candidates.length === 1) {
      const seq = predictSequenceFromSeed(candidates[0].seedMs, flags.count);
      console.log(`Exact next ${flags.count}: ${seq.join(", ")}`);
    } else {
      console.log(
        `Best-guess sequences from first ${Math.min(5, candidates.length)} candidates:`,
      );
      for (const candidate of candidates.slice(0, 5)) {
        const seq = predictSequenceFromSeed(
          candidate.seedMs,
          Math.min(flags.count, 10),
        );
        console.log(`  seed=${candidate.seedMs} -> ${seq.join(", ")}`);
      }
      console.log(
        "Collect 1-2 more observed spins to collapse to a single seed.",
      );
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
