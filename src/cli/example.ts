import { loadCoinMetrics } from "../data/coinmetrics.js";
import { runBacktest } from "../engine.js";
import { metrics } from "../metrics.js";
import { buyAndHold, smaTrend, volTarget } from "../strategies.js";

const btc = loadCoinMetrics("data/btc.csv", "BTC");

const strategies = {
  "Просто държане": buyAndHold,
  "Trend (100-дневна средна)": smaTrend(100),
  "Trend + обем по волатилност 40%": volTarget(smaTrend(100), { targetVol: 0.4, lookback: 30, maxWeight: 1 }),
};

for (const [name, strategy] of Object.entries(strategies)) {
  const result = runBacktest(btc, strategy, { cost: 0.002, lag: 1 });
  const m = metrics(result, "2021-01-01");
  console.log(`${name.padEnd(34)} ${m.cagr.toFixed(1)}%/год  срив ${m.maxDrawdown.toFixed(1)}%  Sharpe ${m.sharpe.toFixed(2)}`);
}
