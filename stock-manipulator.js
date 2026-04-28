/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  const TIX = ns.stock;
  const LOG_PREFIX = "[STOCK]";

  // Tuning knobs
  const symbols = TIX.getSymbols();

  const getStockData = (symbol) => {
    const price = TIX.getPrice(symbol);
    const ask = TIX.getAskPrice(symbol);
    const bid = TIX.getBidPrice(symbol);
    const maxShares = TIX.getMaxShares(symbol);
    const [longShares, longAvgPrice, shortShares, shortAvgPrice] =
      TIX.getPosition(symbol);
  };

  let bought = [];
  for (const symbol of symbols) {
    const stockData = getStockData(symbol);
    if (stockData.longShares > 0) {
      bought.push({ ...stockData, type: "long" });
    }
    if (stockData.shortShares > 0) {
      bought.push({ ...stockData, type: "short" });
    }
  }

  for (const stock of bought) {
  
  }
}
