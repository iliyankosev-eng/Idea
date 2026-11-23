// Time-series momentum ("trend following") on a few ETFs, after Hurst/Ooi/Pedersen (AQR), simplified.
// experiments/trend-preregistration.md. Pure functions; prices are total-return (dividend-adjusted) closes.

export interface Panel {
  dates: string[]; // common trading days, ascending
  px: Record<string, number[]>; // asset -> adjusted close, aligned with dates
  cash: number[]; // BIL adjusted close, aligned with dates
}
export interface TrendOpts {
  signal: "blend" | "12m"; // blend = mean sign of 1/3/12-month excess returns
  longOnly: boolean;
  targetVol: number; // 0.10
  maxGross: number; // 2
  costPerSide: number; // 0.0003 of notional traded
  borrowPerYear: number; // 0.005 on short notional
  volDays: number; // 252
}
export const DEFAULT: TrendOpts = { signal: "blend", longOnly: false, targetVol: 0.1, maxGross: 2, costPerSide: 0.0003, borrowPerYear: 0.005, volDays: 252 };
export interface Month { start: string; end: string; r: number; cash: number; w: Record<string, number>; cost: number }

/** Inner join of several date-keyed series. */
export function align(series: Record<string, { d: string[]; c: number[] }>, cashKey: string): Panel {
  const keys = Object.keys(series);
  const maps = keys.map((k) => new Map(series[k]!.d.map((d, i) => [d, series[k]!.c[i]!] as const)));
  const dates = [...maps[0]!.keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  const px: Record<string, number[]> = {};
  keys.forEach((k, j) => { if (k !== cashKey) px[k] = dates.map((d) => maps[j]!.get(d)!); });
  return { dates, px, cash: dates.map((d) => maps[keys.indexOf(cashKey)]!.get(d)!) };
}

/** Indices of the last trading day of each COMPLETE month (the next trading day is in another month). */
export function monthEnds(dates: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < dates.length; i++) if (dates[i]!.slice(0, 7) !== dates[i + 1]!.slice(0, 7)) out.push(i);
  return out;
}

const sgn = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Signal at month-end k (index into ends): uses prices up to and including dates[ends[k]] only. */
export function signalAt(P: readonly number[], C: readonly number[], ends: readonly number[], k: number, mode: TrendOpts["signal"]): number {
  const ex = (m: number) => P[ends[k]!]! / P[ends[k - m]!]! - C[ends[k]!]! / C[ends[k - m]!]!;
  return mode === "12m" ? sgn(ex(12)) : (sgn(ex(1)) + sgn(ex(3)) + sgn(ex(12))) / 3;
}

/** Annualised covariance of daily excess returns over the `days` returns ending at index e (inclusive). */
export function covAt(panel: Panel, keys: readonly string[], e: number, days: number): number[][] {
  const R = keys.map((k) => { const P = panel.px[k]!, C = panel.cash, r: number[] = []; for (let i = e - days + 1; i <= e; i++) r.push(P[i]! / P[i - 1]! - C[i]! / C[i - 1]!); return r; });
  const mu = R.map((r) => r.reduce((a, b) => a + b, 0) / r.length);
  return R.map((a, i) => R.map((b, j) => (252 * a.reduce((s, x, t) => s + (x - mu[i]!) * (b[t]! - mu[j]!), 0)) / (days - 1)));
}

/** Target weights at month-end index e (= ends[k]). */
export function weightsAt(panel: Panel, keys: readonly string[], ends: readonly number[], k: number, o: TrendOpts): Record<string, number> {
  const S = keys.map((key) => { const s = signalAt(panel.px[key]!, panel.cash, ends, k, o.signal); return o.longOnly ? Math.max(0, s) : s; });
  const cov = covAt(panel, keys, ends[k]!, o.volDays);
  const raw = S.map((s, i) => (s === 0 ? 0 : s / Math.sqrt(cov[i]![i]!)));
  const pv = Math.sqrt(raw.reduce((a, wi, i) => a + raw.reduce((b, wj, j) => b + wi * wj * cov[i]![j]!, 0), 0));
  let w = pv > 0 ? raw.map((x) => (x * o.targetVol) / pv) : raw.map(() => 0);
  const gross = w.reduce((a, x) => a + Math.abs(x), 0);
  if (gross > o.maxGross) w = w.map((x) => (x * o.maxGross) / gross);
  return Object.fromEntries(keys.map((key, i) => [key, w[i]!]));
}

/** First index into ends that has 12 earlier month-ends and `volDays` earlier daily returns. */
export function firstK(ends: readonly number[], volDays: number): number {
  for (let k = 12; k < ends.length; k++) if (ends[k]! - volDays >= 0) return k;
  return ends.length;
}

/** Monthly results. Weights decided at the close of ends[k] are traded at the close of the NEXT trading day and held
 *  until the next such day. Return = cash + sum w * (asset - cash) - costs. The last month-end has no full month after it. */
export function runTrend(panel: Panel, keys: readonly string[], o: TrendOpts = DEFAULT): Month[] {
  const ends = monthEnds(panel.dates), out: Month[] = [];
  let prev: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (let k = firstK(ends, o.volDays); k + 1 < ends.length; k++) {
    const a = ends[k]! + 1, b = ends[k + 1]! + 1;
    if (b >= panel.dates.length) break;
    const w = weightsAt(panel, keys, ends, k, o);
    const rc = panel.cash[b]! / panel.cash[a]! - 1;
    let r = rc, turn = 0, short = 0;
    for (const key of keys) { const P = panel.px[key]!; r += w[key]! * (P[b]! / P[a]! - 1 - rc); turn += Math.abs(w[key]! - prev[key]!); short += Math.max(0, -w[key]!); }
    const cost = o.costPerSide * turn + (o.borrowPerYear / 12) * short;
    out.push({ start: panel.dates[a]!, end: panel.dates[b]!, r: r - cost, cash: rc, w, cost });
    prev = w;
  }
  return out;
}

/** Fixed-weight portfolio rebalanced at the same days (benchmarks), returns on the same holding periods as runTrend. */
export function runFixed(panel: Panel, weights: Record<string, number>, months: readonly Month[]): number[] {
  const idx = new Map(panel.dates.map((d, i) => [d, i]));
  return months.map((m) => { const a = idx.get(m.start)!, b = idx.get(m.end)!; return Object.entries(weights).reduce((s, [k, w]) => s + w * (panel.px[k]![b]! / panel.px[k]![a]! - 1), 0); });
}
