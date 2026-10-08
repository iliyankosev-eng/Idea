import type { History, Strategy } from "./history.js";

export const buyAndHold: Strategy = () => 1;

/** Hold the asset when the latest price is above its n-bar simple moving average (current bar included). */
export function smaTrend(n: number): Strategy {
  if (!Number.isInteger(n) || n < 2) throw new RangeError(`SMA length must be an integer >= 2, got ${n}`);
  return (h: History) => {
    const p = h.lastPrices(n);
    if (p === null) return 0; // not enough history yet -> stay in cash
    const mean = p.reduce((a, b) => a + b, 0) / n;
    return p[n - 1]! > mean ? 1 : 0;
  };
}

export interface VolTargetOptions {
  /** Target annualised volatility, e.g. 0.15 = 15% */
  readonly targetVol: number;
  /** Number of past returns used to estimate volatility */
  readonly lookback: number;
  /** Cap on the resulting weight (1 = no leverage) */
  readonly maxWeight: number;
}

/**
 * Volatility targeting (Moreira & Muir style): scale the base strategy's weight by
 * targetVol / realised volatility of the last `lookback` returns, capped at maxWeight.
 * Holds cash until enough history exists.
 */
export function volTarget(base: Strategy, o: VolTargetOptions): Strategy {
  if (!(o.targetVol > 0)) throw new RangeError("targetVol must be > 0");
  if (!Number.isInteger(o.lookback) || o.lookback < 2) throw new RangeError("lookback must be an integer >= 2");
  if (!(o.maxWeight > 0)) throw new RangeError("maxWeight must be > 0");
  return (h: History) => {
    const w = base(h);
    if (w === 0) return 0;
    const r = h.lastReturns(o.lookback);
    if (r === null) return 0;
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
    const realised = sd * Math.sqrt(h.periodsPerYear);
    const scale = realised > 0 ? o.targetVol / realised : o.maxWeight;
    return Math.min(o.maxWeight, w * scale);
  };
}
