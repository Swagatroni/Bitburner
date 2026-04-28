/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const TIX = ns.stock;
  const LOG_PREFIX = "[STOCK]";

  // Tuning knobs
  const COMMISSION = 100_000;
  const MIN_CASH_BUFFER = 100e6;
  const MAX_POSITION_PCT = 0.2;
  const LONG_THRESHOLD = 0.56;
  const SHORT_THRESHOLD = 0.44;
  const EXIT_LONG_THRESHOLD = 0.52;
  const EXIT_SHORT_THRESHOLD = 0.48;
  const LOOP_MS = 6_000;

  // No-4S probability estimator settings
  const WINDOW_SIZE = 75;
  const MIN_SAMPLES = 20;
  const MIN_TRADE_VALUE = 5 * COMMISSION;

  if (!TIX.hasWSEAccount() || !TIX.hasTIXAPIAccess()) {
    ns.tprint(`${LOG_PREFIX} Need WSE + TIX API access.`);
    return;
  }

  const symbols = TIX.getSymbols();
  const has4SAPI = TIX.has4SDataTIXAPI();
  let canShort = true;

  // Tracks per-symbol price moves. move=1 for up, -1 for down.
  const history = new Map();
  for (const sym of symbols) {
    history.set(sym, { lastPrice: null, moves: [] });
  }

  const updateHistory = (symbol, price) => {
    const h = history.get(symbol);
    if (h.lastPrice !== null) {
      if (price > h.lastPrice) h.moves.push(1);
      else if (price < h.lastPrice) h.moves.push(-1);
    }
    h.lastPrice = price;
    if (h.moves.length > WINDOW_SIZE) h.moves.shift();
  };

  const estimateForecast = (symbol) => {
    if (has4SAPI) return TIX.getForecast(symbol);

    const moves = history.get(symbol).moves;
    let up = 0;
    let down = 0;
    for (const m of moves) {
      if (m > 0) up++;
      else if (m < 0) down++;
    }

    const total = up + down;
    if (total < MIN_SAMPLES) return 0.5;
    return up / total;
  };

  const getStockData = (symbol) => {
    const price = TIX.getPrice(symbol);
    const ask = TIX.getAskPrice(symbol);
    const bid = TIX.getBidPrice(symbol);
    const maxShares = TIX.getMaxShares(symbol);
    const [longShares, longAvgPrice, shortShares, shortAvgPrice] =
      TIX.getPosition(symbol);

    updateHistory(symbol, price);
    const forecast = estimateForecast(symbol);

    return {
      symbol,
      price,
      ask,
      bid,
      maxShares,
      longShares,
      longAvgPrice,
      shortShares,
      shortAvgPrice,
      forecast,
    };
  };

  const getPortfolioValue = (states) => {
    let value = ns.getServerMoneyAvailable("home");
    for (const s of states) {
      value += s.longShares * s.bid;
      value += s.shortShares * s.ask;
    }
    return value;
  };

  const getMaxBuyShares = (state, availableCash, portfolioValue, forShort) => {
    const price = forShort ? state.bid : state.ask;
    if (price <= 0) return 0;

    const maxSymbolValue = portfolioValue * MAX_POSITION_PCT;
    const currentExposure =
      (state.longShares + state.shortShares) * state.price;
    const remainingValueByCap = Math.max(0, maxSymbolValue - currentExposure);
    const remainingByCapShares = Math.floor(remainingValueByCap / price);
    const affordableShares = Math.floor(availableCash / price);
    const freeShares = Math.max(
      0,
      state.maxShares - state.longShares - state.shortShares,
    );

    return Math.max(
      0,
      Math.min(remainingByCapShares, affordableShares, freeShares),
    );
  };

  while (true) {
    const states = symbols.map(getStockData);
    let soldLongCount = 0;
    let soldShortCount = 0;
    let boughtLongCount = 0;
    let boughtShortCount = 0;

    // 1) Close weak positions first.
    for (const s of states) {
      // Exit longs either on weak bullish signal or when a clear short signal appears.
      if (
        s.longShares > 0 &&
        (s.forecast < EXIT_LONG_THRESHOLD || s.forecast <= SHORT_THRESHOLD)
      ) {
        const px = TIX.sellStock(s.symbol, s.longShares);
        if (px > 0) soldLongCount++;
      }

      // Exit shorts either on weak bearish signal or when a clear long signal appears.
      if (
        canShort &&
        s.shortShares > 0 &&
        (s.forecast > EXIT_SHORT_THRESHOLD || s.forecast >= LONG_THRESHOLD)
      ) {
        try {
          const px = TIX.sellShort(s.symbol, s.shortShares);
          if (px > 0) soldShortCount++;
        } catch {
          canShort = false;
          ns.print(
            `${LOG_PREFIX} Shorting unavailable, disabling short logic.`,
          );
        }
      }
    }

    // Refresh states after exits.
    const refreshed = symbols.map(getStockData);
    let cash = Math.max(
      0,
      ns.getServerMoneyAvailable("home") - MIN_CASH_BUFFER,
    );
    const portfolioValue = getPortfolioValue(refreshed);

    // 2) Open new long positions from strongest bullish signal.
    const longCandidates = refreshed
      .filter((s) => s.forecast >= LONG_THRESHOLD && s.longShares === 0)
      .sort((a, b) => b.forecast - a.forecast);

    for (const s of longCandidates) {
      if (cash <= MIN_TRADE_VALUE + COMMISSION) break;

      const shares = getMaxBuyShares(s, cash, portfolioValue, false);
      if (shares <= 0) continue;

      const tradeValue = shares * s.ask;
      if (tradeValue < MIN_TRADE_VALUE) continue;

      const px = TIX.buyStock(s.symbol, shares);
      if (px > 0) {
        cash -= tradeValue + COMMISSION;
        boughtLongCount++;
      }
    }

    // 3) Open new short positions from strongest bearish signal.
    let shortCandidatesCount = 0;
    if (canShort) {
      const shortCandidates = refreshed
        .filter(
          (s) =>
            s.forecast <= SHORT_THRESHOLD &&
            s.shortShares === 0 &&
            s.longShares === 0,
        )
        .sort((a, b) => a.forecast - b.forecast);
      shortCandidatesCount = shortCandidates.length;

      for (const s of shortCandidates) {
        if (cash <= MIN_TRADE_VALUE + COMMISSION) break;

        const shares = getMaxBuyShares(s, cash, portfolioValue, true);
        if (shares <= 0) continue;

        const tradeValue = shares * s.bid;
        if (tradeValue < MIN_TRADE_VALUE) continue;

        try {
          const px = TIX.buyShort(s.symbol, shares);
          if (px > 0) {
            cash -= tradeValue + COMMISSION;
            boughtShortCount++;
          }
        } catch (err) {
          const msg = String(err ?? "");
          // Disable globally only if account capability is missing.
          if (
            msg.includes("short") ||
            msg.includes("Short") ||
            msg.includes("TIX")
          ) {
            canShort = false;
          }
          ns.print(`${LOG_PREFIX} buyShort failed for ${s.symbol}: ${msg}`);
          if (!canShort) {
            ns.print(
              `${LOG_PREFIX} Shorting unavailable, disabling short logic.`,
            );
            break;
          }
        }
      }
    }

    const postTrade = symbols.map(getStockData);
    const openLongs = postTrade.filter((s) => s.longShares > 0).length;
    const openShorts = postTrade.filter((s) => s.shortShares > 0).length;
    ns.print(
      `${LOG_PREFIX} cash=${ns.formatNumber(cash, 2)} longs=${openLongs} shorts=${openShorts} shorting=${canShort ? "on" : "off"} shortCands=${shortCandidatesCount} soldL=${soldLongCount} soldS=${soldShortCount} buyL=${boughtLongCount} buyS=${boughtShortCount} mode=${has4SAPI ? "4S" : "no-4S"}`,
    );

    await ns.sleep(LOOP_MS);
  }
}
