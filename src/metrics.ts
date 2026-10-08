import type { BacktestResult } from "./engine.js";

export interface Metrics {
  readonly start: string;
  readonly end: string;
  readonly periods: number;
  readonly years: number;
  /** Compound annual growth rate, in % */
  readonly cagr: number;
  /** Annualised volatility, in % */
  readonly vol: number;
  /** Annualised Sharpe ratio without a risk-free rate (mean / std * sqrt(periods per year)) */
  readonly sharpe: number;
  /** Worst peak-to-trough fall of the equity curve, in % (negative) */
  readonly maxDrawdown: number;
  /** Total weight traded per year (for a 0/1 strategy this equals switches per year) */
  readonly turnoverPerYear: number;
  /** Average weight held */
  readonly exposure: number;
  readonly totalReturn: number;
}

/** Inclusive index range of bars whose date is within [start, end]. Bar 0 is never included (it has no return). */
export function windowRange(dates: readonly string[], start = "", end = "￿"): [number, number] {
  let i0 = -1, i1 = -1;
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i]!;
    if (d >= start && d <= end) {
      if (i0 < 0) i0 = i;
      i1 = i;
    }
  }
  if (i0 < 0) throw new RangeError(`no bars between ${start} and ${end}`);
  return [i0, i1];
}

export function metricsFromReturns(
  returns: readonly number[],
  periodsPerYear: number,
  extra: { start: string; end: string; turnover?: number; exposure?: number },
): Metrics {
  const n = returns.length;
  if (n < 2) throw new RangeError("need at least 2 returns");
  let eq = 1, peak = 1, mdd = 0, sum = 0;
  for (const r of returns) {
    eq *= 1 + r;
    if (eq > peak) peak = eq;
    const dd = eq / peak - 1;
    if (dd < mdd) mdd = dd;
    sum += r;
  }
  const mean = sum / n;
  let ss = 0;
  for (const r of returns) ss += (r - mean) ** 2;
  const sd = Math.sqrt(ss / (n - 1));
  const years = n / periodsPerYear;
  return {
    start: extra.start,
    end: extra.end,
    periods: n,
    years,
    cagr: (eq ** (1 / years) - 1) * 100,
    vol: sd * Math.sqrt(periodsPerYear) * 100,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(periodsPerYear) : 0,
    maxDrawdown: mdd * 100,
    turnoverPerYear: (extra.turnover ?? 0) / years,
    exposure: extra.exposure ?? NaN,
    totalReturn: (eq - 1) * 100,
  };
}

/** Metrics of a backtest over the bars dated within [start, end]. */
export function metrics(res: BacktestResult, start?: string, end?: string): Metrics {
  const [i0, i1] = windowRange(res.series.dates, start, end);
  const rets = res.returns.slice(i0, i1 + 1);
  let turnover = 0, exposure = 0;
  for (let k = i0; k <= i1; k++) {
    // only count trades whose cost falls inside the window
    turnover += Math.abs(res.weights[k]! - (k > 0 ? res.weights[k - 1]! : 0));
    exposure += res.weights[k]!;
  }
  return metricsFromReturns(rets, res.series.periodsPerYear, {
    start: res.series.dates[i0]!,
    end: res.series.dates[i1]!,
    turnover,
    exposure: exposure / rets.length,
  });
}
