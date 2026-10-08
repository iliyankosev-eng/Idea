import { History, type Strategy } from "./history.js";
import { validateSeries, type Series } from "./types.js";

export interface BacktestOptions {
  /** Cost as a fraction of the traded amount, e.g. 0.001 = 0.1% per unit of weight changed. */
  readonly cost: number;
  /**
   * Extra bars between the decision and the first bar it earns.
   * lag 0: decide at the close of bar t, hold during bar t+1 (assumes you trade exactly at that close).
   * lag 1: decide at bar t, hold from bar t+2 (one bar to act; required for monthly-average data).
   */
  readonly lag: number;
  /** Highest weight a strategy may ask for. Default 1 (no leverage). */
  readonly maxWeight?: number;
}

export interface BacktestResult {
  readonly series: Series;
  /** decisions[t] = weight chosen with data up to bar t. */
  readonly decisions: readonly number[];
  /** weights[k] = weight actually held during bar k. */
  readonly weights: readonly number[];
  /** Net return of bar k after costs. */
  readonly returns: readonly number[];
  /** Cost paid in bar k (already subtracted in returns). */
  readonly costs: readonly number[];
}

export class StrategyError extends Error {
  override name = "StrategyError";
}

export function runBacktest(series: Series, strategy: Strategy, opts: BacktestOptions): BacktestResult {
  validateSeries(series);
  const { cost, lag } = opts;
  const maxWeight = opts.maxWeight ?? 1;
  if (!(cost >= 0 && cost < 1)) throw new RangeError(`cost must be in [0, 1), got ${cost}`);
  if (!Number.isInteger(lag) || lag < 0) throw new RangeError(`lag must be a non-negative integer, got ${lag}`);
  if (!(maxWeight > 0)) throw new RangeError(`maxWeight must be > 0, got ${maxWeight}`);

  const n = series.dates.length;
  const decisions = new Array<number>(n);
  for (let t = 0; t < n; t++) {
    const w = strategy(new History(series, t));
    if (!Number.isFinite(w) || w < 0 || w > maxWeight + 1e-12) {
      throw new StrategyError(`strategy returned weight ${w} at ${series.dates[t]} (allowed 0..${maxWeight})`);
    }
    decisions[t] = w;
  }

  const weights = new Array<number>(n);
  const returns = new Array<number>(n);
  const costs = new Array<number>(n);
  let prev = 0; // start fully in cash
  for (let k = 0; k < n; k++) {
    const src = k - 1 - lag;
    const w = src >= 0 ? decisions[src]! : 0;
    const c = cost * Math.abs(w - prev);
    weights[k] = w;
    costs[k] = c;
    returns[k] = w * series.ret[k]! + (1 - w) * series.cash[k]! - c;
    prev = w;
  }
  return { series, decisions, weights, returns, costs };
}
