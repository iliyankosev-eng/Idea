// Shared pieces for the Polymarket tests (experiments/polymarket-preregistration.md).
import { mulberry32 } from "../evaluate.js";

export type Pt = readonly [number, number]; // [unix seconds, price]

/** Last price at or before time t (seconds), not older than maxAge seconds; null if none. Points must be sorted by time. */
export function priceAt(h: readonly Pt[], t: number, maxAge: number): number | null {
  let lo = 0, hi = h.length - 1, k = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (h[mid]![0] <= t) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  if (k < 0 || t - h[k]![0] > maxAge) return null;
  return h[k]![1];
}

/** Return on $1 when buying at `entry` (cost already included) and receiving `exit` per share. */
export const ret = (entry: number, exit: number) => (exit - entry) / entry;

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, |error| < 1.5e-7). */
export function phi(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export interface Trade { readonly day: string; readonly r: number }

/** Mean return per trade. */
export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * Block bootstrap by day: average return per trading day (days with trades), resampled in blocks of `block` consecutive days.
 * Returns the share of resamples whose mean daily return is > 0.
 */
export function bootstrapByDay(trades: readonly Trade[], block = 5, reps = 2000, seed = 42): number {
  const by = new Map<string, number[]>();
  for (const t of trades) (by.get(t.day) ?? by.set(t.day, []).get(t.day)!).push(t.r);
  const daily = [...by.keys()].sort().map((d) => mean(by.get(d)!));
  if (!daily.length) return NaN;
  const rnd = mulberry32(seed);
  let pos = 0;
  for (let rep = 0; rep < reps; rep++) {
    let sum = 0, k = 0;
    while (k < daily.length) {
      const st = Math.floor(rnd() * daily.length);
      for (let j = 0; j < block && k < daily.length; j++, k++) sum += daily[(st + j) % daily.length]!;
    }
    if (sum > 0) pos++;
  }
  return pos / reps;
}

/** GO / weak / STOP by the two pre-registered criteria. */
export function verdict(m: number, boot: number, beats: number): string {
  const c1 = m > 0 && boot >= 0.95, c2 = beats >= 95;
  return c1 && c2 ? "GO (следене напред без пари)" : c1 || c2 ? "слабо" : "STOP";
}
