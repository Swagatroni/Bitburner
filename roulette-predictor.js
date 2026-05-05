// roulette-predictor.js — standalone Node.js script
// Usage: node roulette-predictor.js

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q) => new Promise((r) => rl.question(q, r));

// --- RNG core (mirrors Casino/RNG.ts WHRNG) ---

function makeState(seedMs) {
  const value = (seedMs / 1000) % 30000;
  return { s1: value, s2: value, s3: value };
}

function nextRouletteNumber(state) {
  const s1 = (171 * state.s1) % 30269;
  const s2 = (172 * state.s2) % 30307;
  const s3 = (170 * state.s3) % 30323;
  const roll = (s1 / 30269 + s2 / 30307 + s3 / 30323) % 1;
  return { state: { s1, s2, s3 }, number: Math.floor(roll * 37) };
}

// --- Candidate filtering ---

function narrowCandidates(candidates, observed, calibrationBet) {
  const next = [];
  for (const c of candidates) {
    const first = nextRouletteNumber(c.state);

    if (calibrationBet < 0 || first.number !== calibrationBet) {
      if (first.number === observed)
        next.push({ seedMs: c.seedMs, state: first.state });
      continue;
    }

    // First roll matched our bet — two branches: cheat or no-cheat
    if (observed === calibrationBet) {
      next.push({ seedMs: c.seedMs, state: first.state });
    }

    // Cheat path: house rerolls until off our bet
    let cs = first.state;
    while (true) {
      const reroll = nextRouletteNumber(cs);
      cs = reroll.state;
      if (reroll.number !== calibrationBet) {
        if (reroll.number === observed)
          next.push({ seedMs: c.seedMs, state: cs });
        break;
      }
    }
  }
  return next;
}

// --- Prediction ---

function predictNext(state, count) {
  const nums = [];
  let cur = state;
  for (let i = 0; i < count; i++) {
    const r = nextRouletteNumber(cur);
    nums.push(r.number);
    cur = r.state;
  }
  return nums;
}

function bestGuessSequence(candidates, count) {
  const states = candidates.map((c) => ({ ...c.state }));
  const seq = [];
  for (let i = 0; i < count; i++) {
    const freq = new Map();
    for (let j = 0; j < states.length; j++) {
      const r = nextRouletteNumber(states[j]);
      states[j] = r.state;
      freq.set(r.number, (freq.get(r.number) || 0) + 1);
    }
    let best = -1,
      bestF = -1;
    for (const [n, f] of freq) {
      if (f > bestF || (f === bestF && n < best)) {
        best = n;
        bestF = f;
      }
    }
    seq.push(best);
  }
  return seq;
}

// --- Main ---

(async () => {
  const CALIBRATION_BET = 1;
  const WINDOW_MS = 500;
  const PREDICT_COUNT = 50;

  console.log(
    'new MutationObserver(function(_,o){const b=document.querySelector(\'input[type="number"]\');if(b){const t=Date.now();console.log("ROULETTE_OPEN",t);copy(String(t));o.disconnect();}}).observe(document.body,{childList:true,subtree:true});',
  );
  console.log("\n");
  console.log("=== Roulette Predictor ===");

  // 1. Timestamp
  const tsRaw = (await ask("Timestamp: ")).trim();
  const estimate = Math.floor(Number(tsRaw));
  if (!Number.isFinite(estimate) || estimate <= 0) {
    console.log("Invalid timestamp.");
    rl.close();
    return;
  }

  // 2. Observed numbers
  const obsRaw = (await ask("Numbers it rolled so far: ")).trim();
  const observed =
    obsRaw === ""
      ? []
      : obsRaw
          .split(",")
          .map((v) => Number(v.trim()))
          .filter((v) => Number.isInteger(v) && v >= 0 && v <= 36);

  if (obsRaw !== "" && observed.length === 0) {
    console.log("Could not parse observed numbers. Use format: 17,4,31,9");
    rl.close();
    return;
  }

  rl.close();

  // 3. Build + narrow candidates
  let candidates = [];
  for (let ms = estimate - WINDOW_MS; ms <= estimate + WINDOW_MS; ms++) {
    candidates.push({ seedMs: ms, state: makeState(ms) });
  }

  for (const n of observed) {
    candidates = narrowCandidates(candidates, n, CALIBRATION_BET);
    if (candidates.length === 0) break;
  }

  // 4. Output
  console.log(
    "\nCandidates: " +
      candidates.length +
      " (from " +
      observed.length +
      " observations)\n",
  );

  if (candidates.length === 0) {
    console.log(
      "No seeds matched. Try a wider window or check your observed numbers.",
    );
    return;
  }

  if (candidates.length === 1) {
    const seq = predictNext(candidates[0].state, PREDICT_COUNT);
    console.log("Exact prediction (seed " + candidates[0].seedMs + "):");
    console.log(seq.join(", "));
  } else {
    const seq = bestGuessSequence(candidates, PREDICT_COUNT);
    console.log(
      "Best-guess next " +
        PREDICT_COUNT +
        " numbers (across " +
        candidates.length +
        " candidates):",
    );
    console.log(seq.join(", "));
    console.log(
      "\nTip: add more observed numbers to narrow down to a single seed.",
    );
  }
})();
