import type { BacktestResult } from "./engine.js";

export interface Trade {
  readonly entry: string;
  readonly exit: string;
  readonly bars: number;
  /** Net return of the trade after entry and exit costs (0.02 = +2%). */
  readonly ret: number;
}

export interface TradeStats {
  readonly trades: number;
  /** Share of trades with a positive net return, in %. */
  readonly winRate: number;
  /** Average net return of winning / losing trades, in %. */
  readonly avgWin: number;
  readonly avgLoss: number;
  /** Average net return per trade, in % (the number that decides whether you make money). */
  readonly expectancy: number;
  /** Sum of gains / sum of losses (above 1 = profitable). */
  readonly profitFactor: number;
}

/**
 * Splits a backtest into trades: a trade is a run of bars with weight > 0.
 * Its return compounds the bars' net returns (entry cost included) and the exit cost
 * charged on the first bar after the run. A trade still open at the end is closed at the last bar.
 */
export function extractTrades(res: BacktestResult, start = "", end = "￿"): Trade[] {
  const { weights, returns, costs, series } = res;
  const trades: Trade[] = [];
  let open = -1, g = 1;
  for (let k = 1; k < weights.length; k++) {
    const d = series.dates[k]!;
    if (d < start || d > end) continue;
    const w = weights[k]!;
    if (w > 0) {
      if (open < 0) { open = k; g = 1; }
      g *= 1 + returns[k]!;
    } else if (open >= 0) {
      g *= 1 - costs[k]!; // exit cost is paid on the bar after the run
      trades.push({ entry: series.dates[open]!, exit: d, bars: k - open, ret: g - 1 });
      open = -1;
    }
  }
  if (open >= 0) trades.push({ entry: series.dates[open]!, exit: series.dates[weights.length - 1]!, bars: weights.length - open, ret: g - 1 });
  return trades;
}

export function tradeStats(trades: readonly Trade[]): TradeStats {
  const wins = trades.filter((t) => t.ret > 0), losses = trades.filter((t) => t.ret <= 0);
  const avg = (xs: readonly Trade[]) => (xs.length ? (xs.reduce((a, t) => a + t.ret, 0) / xs.length) * 100 : 0);
  const sumW = wins.reduce((a, t) => a + t.ret, 0), sumL = -losses.reduce((a, t) => a + t.ret, 0);
  return {
    trades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    avgWin: avg(wins),
    avgLoss: avg(losses),
    expectancy: avg(trades),
    profitFactor: sumL > 0 ? sumW / sumL : Infinity,
  };
}
