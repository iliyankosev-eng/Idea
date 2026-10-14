// Pure decision logic of the paper-trading bot. Same rules as the backtests (DT3 in src/daytrade/dt.ts, DT8 in src/daytrade/dt78.ts);
// test/bot-logic.test.ts checks that these functions make the same decisions as the backtests on historical data.
import { rsi } from "../daytrade/dt78.js";

export interface Bar { readonly o: number; readonly h: number; readonly l: number; readonly c: number }

/** DT3: from the five 1-minute bars 09:30-09:34, the trade plan for capital `cap` (risk 1%, max 4x, target 10R). Null on a doji or bad data. */
export function orbPlan(first5: readonly Bar[], refPrice: number, cap: number): { side: "buy" | "sell"; qty: number; stop: number; target: number } | null {
  if (first5.length !== 5 || !(cap > 0) || !(refPrice > 0)) return null;
  const o0 = first5[0]!.o, c4 = first5[4]!.c;
  if (c4 === o0) return null;
  const dir = c4 > o0 ? 1 : -1;
  const stop = dir === 1 ? Math.min(...first5.map((b) => b.l)) : Math.max(...first5.map((b) => b.h));
  const risk = dir * (refPrice - stop);
  if (!(risk > 0)) return null;
  const qty = Math.floor(Math.min((0.01 * cap) / risk, (4 * cap) / refPrice));
  if (qty < 1) return null;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { side: dir === 1 ? "buy" : "sell", qty, stop: r2(stop), target: r2(refPrice + dir * 10 * risk) };
}

/** DT8 at the close: closes = adjusted daily closes up to yesterday + today's (estimated) close as the last element. */
export function rsiDecision(closes: readonly number[], inPosition: boolean): "buy" | "sell" | "hold" | "none" {
  const n = closes.length;
  if (n < 200) return "none";
  const c = closes[n - 1]!;
  const sma = (k: number) => closes.slice(n - k).reduce((a, b) => a + b, 0) / k;
  if (inPosition) return c > sma(5) ? "sell" : "hold";
  return rsi(closes, 2)[n - 1]! < 10 && c > sma(200) ? "buy" : "none";
}

/** Daily drawdown guard: stop opening new trades when equity is more than `maxDd` below its high-water mark. */
export const halted = (equity: number, highWater: number, maxDd = 0.2) => equity < highWater * (1 - maxDd);
