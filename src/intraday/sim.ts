import { firstAtOrAfter, lastAtOrBefore, type Session } from "./sessions.js";

export interface IntradayTrade {
  readonly symbol: string;
  readonly date: string;
  readonly dir: 1 | -1;
  readonly entry: number;
  readonly exit: number;
  /** Net return of the trade: dir * (exit / entry - 1) - 2 * costPerSide. */
  readonly ret: number;
  /** Gross result in units of initial risk (NaN without a stop). */
  readonly r: number;
  readonly reason: "stop" | "target" | "time";
}

export interface TradePlan {
  readonly dir: 1 | -1;
  readonly entryMinute: number;
  readonly exitMinute: number;
  /** Absolute price levels; null = none. */
  readonly stop: number | null;
  readonly target: number | null;
  /** Alternative to absolute levels: distances as fractions of the entry price (used by the random baselines). */
  readonly stopPct?: number;
  readonly targetPct?: number;
}

/**
 * Simulate one intraday trade on one-minute bars (rules in experiments/daytrading-preregistration.md):
 * enter at the open of the first bar at/after entryMinute; check stop and target from the entry bar on, using bar
 * high/low; if both are touched in one bar the stop counts first; a stop fills at the stop, or at the bar open if the
 * bar opens beyond it; a target fills exactly at the target; otherwise exit at the close of the last bar at/before
 * exitMinute. Returns null if there is no entry bar before the exit time or the risk is not positive.
 */
export function simulateTrade(s: Session, p: TradePlan, costPerSide: number): IntradayTrade | null {
  const i0 = firstAtOrAfter(s, p.entryMinute);
  const iEnd = lastAtOrBefore(s, p.exitMinute);
  if (i0 < 0 || iEnd < i0) return null;
  const entry = s.o[i0]!;
  const d = p.dir;
  const stop = p.stop ?? (p.stopPct !== undefined ? entry * (1 - d * p.stopPct) : null);
  const target = p.target ?? (p.targetPct !== undefined ? entry * (1 + d * p.targetPct) : null);
  if (stop !== null && d * (entry - stop) <= 0) return null;
  let exit = s.c[iEnd]!, reason: IntradayTrade["reason"] = "time";
  for (let i = i0; i <= iEnd; i++) {
    const o = s.o[i]!, h = s.h[i]!, l = s.l[i]!;
    if (stop !== null && (d === 1 ? l <= stop : h >= stop)) {
      exit = d === 1 ? Math.min(stop, o) : Math.max(stop, o);
      reason = "stop";
      break;
    }
    if (target !== null && (d === 1 ? h >= target : l <= target)) {
      exit = target;
      reason = "target";
      break;
    }
  }
  const ret = d * (exit / entry - 1) - 2 * costPerSide;
  const r = stop !== null ? (d * (exit - entry)) / Math.abs(entry - stop) : NaN;
  return { symbol: s.symbol, date: s.date, dir: d, entry, exit, ret, r, reason };
}
