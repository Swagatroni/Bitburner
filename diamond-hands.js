import { getNetworkNodes } from "./Curtain/utils.js";

/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");
  const fees = 100000; // 100k commission
  const tradeFees = 2 * fees; // buy + sell transactions
  let overallValue = 0;

  function getStonks() {
    const stockSymbols = ns.stock.getSymbols();
    const stocks = [];
    for (const sym of stockSymbols) {
      const pos = ns.stock.getPosition(sym);
      const stock = {
        sym,
        longShares: pos[0],
        longPrice: pos[1],
        shortShares: pos[2],
        shortPrice: pos[3],
        forecast: ns.stock.getForecast(sym),
        volatility: ns.stock.getVolatility(sym),
        askPrice: ns.stock.getAskPrice(sym),
        bidPrice: ns.stock.getBidPrice(sym),
        maxShares: ns.stock.getMaxShares(sym),
      };
      const longProfit =
        stock.longShares * (stock.bidPrice - stock.longPrice) - tradeFees;
      const shortProfit =
        stock.shortShares * (stock.shortPrice - stock.askPrice) - tradeFees;
      stock.profit = longProfit + shortProfit;

      const longCost = stock.longShares * stock.longPrice;
      const shortCost = stock.shortShares * stock.shortPrice;
      stock.cost = longCost + shortCost;
      // 0.6 -> 0.1 (10% - LONG)
      // 0.4 -> 0.1 (10% - SHORT)
      const profitChance = Math.abs(stock.forecast - 0.5); // chance to make profit for either positions
      stock.profitPotential = stock.volatility * profitChance; // potential to get the price movement

      stock.summary = `${stock.sym}: ${stock.forecast.toFixed(3)} +/- ${stock.volatility.toFixed(3)}`;
      stocks.push(stock);
    }

    // Sort by profit potential
    return stocks.sort((a, b) => b.profitPotential - a.profitPotential);
  }

  function takeTendies(stocks) {
    for (const stock of stocks) {
      if (stock.longShares > 0) takeLongTendies(stock);
      if (stock.shortShares > 0) takeShortTendies(stock);
    }
  }

  function takeLongTendies(stock) {
    if (stock.forecast > 0.5) {
      // HOLD
      const curValue = stock.cost + stock.profit;
      const roi = ns.formatNumber(100 * (stock.profit / stock.cost));
      ns.print(`INFO: LONG ${ns.formatNumber(curValue)} ${roi}%`);
      overallValue += curValue;
    } else {
      // Take tendies!
      const salePrice = ns.stock.sellStock(stock.sym, stock.longShares);
      const saleTotal = salePrice * stock.longShares;
      const saleCost = stock.longPrice * stock.longShares;
      const saleProfit = saleTotal - saleCost - tradeFees;
      stock.shares = 0;
      ns.print(`WARN: SOLD for ${ns.formatNumber(saleProfit)} profit`);
    }
  }

  function takeShortTendies(stock) {
    if (stock.forecast < 0.5) {
      // HOLD
      const curValue = stock.cost + stock.profit;
      const roi = ns.formatNumber(100 * (stock.profit / stock.cost));
      ns.print(`INFO: SHORT ${ns.formatNumber(curValue)} ${roi}%`);

      overallValue += curValue;
    } else {
      // Exit short — signal went bullish
      const salePrice = ns.stock.sellShort(stock.sym, stock.shortShares);
      const saleTotal = stock.shortPrice * stock.shortShares;
      const saleProfit = saleTotal - salePrice * stock.shortShares - tradeFees;
      ns.print(`WARN: COVERED SHORT for ${ns.formatNumber(saleProfit)} profit`);
    }
  }

  function yolo(stocks) {
    const riskThresh = 10; // 20 * fees;
    for (const stock of stocks) {
      const money = ns.getPlayer().money;
      if (stock.forecast > 0.5) {
        if (money > riskThresh) {
          const sharesWeCanBuy = Math.floor((money - fees) / stock.askPrice);
          const sharesToBuy = Math.min(stock.maxShares, sharesWeCanBuy);
          if (ns.stock.buyStock(stock.sym, sharesToBuy) > 0) {
            ns.print(
              `WARN\t${stock.summary}\t- LONG @ ${ns.formatNumber(sharesToBuy)}`,
            );
          }
        }
      }
      if (stock.forecast < 0.5) {
        if (money > riskThresh) {
          const sharesWeCanShort = Math.floor((money - fees) / stock.bidPrice);
          const sharesToShort = Math.min(
            stock.maxShares - stock.longShares - stock.shortShares,
            sharesWeCanShort,
          );
          if (
            sharesToShort > 0 &&
            ns.stock.buyShort(stock.sym, sharesToShort) > 0
          ) {
            ns.print(
              `WARN\t${stock.summary}\t- SHORT @ ${ns.formatNumber(sharesToShort)}`,
            );
          }
        }
      }
    }
  }

  function attackOrg(org) {
    if (stock.longShares > 0) {
      // - grow -> makes stock more likely to go up
    }
    if (stock.shortShares > 0) {
      // - hack -> makes stock more likely to go down
    }
  }

  while (true) {
    const stocks = getStonks();
    takeTendies(stocks);
    yolo(stocks);
    ns.print(`Stock value: ${ns.formatNumber(overallValue)}`);
    ns.print("");
    overallValue = 0;

    // @TODO - Extend for market manipulation
    await ns.stock.nextUpdate();
  }
}

export function getPortfolioValue(ns) {
  const fees = 100000;
  const tradeFees = 2 * fees;
  let value = 0;

  for (const sym of ns.stock.getSymbols()) {
    const [longShares, longPrice, shortShares, shortPrice] =
      ns.stock.getPosition(sym);
    const bidPrice = ns.stock.getBidPrice(sym);
    const askPrice = ns.stock.getAskPrice(sym);

    const longProfit = longShares * (bidPrice - longPrice) - tradeFees;
    const shortProfit = shortShares * (shortPrice - askPrice) - tradeFees;
    const longCost = longShares * longPrice;
    const shortCost = shortShares * shortPrice;

    value += longCost + shortCost + longProfit + shortProfit;
  }

  return ns.formatNumber(value);
}
