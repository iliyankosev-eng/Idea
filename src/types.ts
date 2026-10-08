/**
 * A price series prepared for backtesting.
 *
 * Index i is one bar (one day or one month). All arrays have the same length.
 * - price[i]: the price a strategy may look at when it decides at the end of bar i.
 * - ret[i]:   the asset's total return DURING bar i (from end of bar i-1 to end of bar i).
 *             ret[0] is 0 because there is no previous bar.
 * - cash[i]:  the return of holding cash during bar i.
 */
export interface Series {
  readonly name: string;
  readonly dates: readonly string[];
  readonly price: readonly number[];
  readonly ret: readonly number[];
  readonly cash: readonly number[];
  readonly periodsPerYear: number;
}

export class DataError extends Error {
  override name = "DataError";
}

/** Throws DataError if the series is malformed. Called by the engine before every run. */
export function validateSeries(s: Series): void {
  const n = s.dates.length;
  if (n < 2) throw new DataError(`${s.name}: need at least 2 bars, got ${n}`);
  for (const [label, arr] of [["price", s.price], ["ret", s.ret], ["cash", s.cash]] as const) {
    if (arr.length !== n) throw new DataError(`${s.name}: ${label} has ${arr.length} values, dates has ${n}`);
  }
  if (!(s.periodsPerYear > 0)) throw new DataError(`${s.name}: periodsPerYear must be > 0`);
  if (s.ret[0] !== 0) throw new DataError(`${s.name}: ret[0] must be 0 (no previous bar)`);
  for (let i = 0; i < n; i++) {
    const p = s.price[i]!, r = s.ret[i]!, c = s.cash[i]!;
    if (!Number.isFinite(p) || p <= 0) throw new DataError(`${s.name}: bad price ${p} at ${s.dates[i]}`);
    if (!Number.isFinite(r) || r <= -1) throw new DataError(`${s.name}: bad return ${r} at ${s.dates[i]}`);
    if (!Number.isFinite(c) || c <= -1) throw new DataError(`${s.name}: bad cash return ${c} at ${s.dates[i]}`);
    if (i > 0 && !(s.dates[i]! > s.dates[i - 1]!)) {
      throw new DataError(`${s.name}: dates not strictly increasing at ${s.dates[i - 1]} -> ${s.dates[i]}`);
    }
  }
}
