// Pure decision logic of the paper-trading bot. Same rules as the backtests (DT3 in src/daytrade/dt.ts, DT8 in src/daytrade/dt78.ts);
// test/bot-logic.test.ts checks that these functions make the same decisions as the backtests on historical data.
import { rsi } from "../daytrade/dt78.js";

export interface Bar { readonly o: number; readonly h: number; readonly l: number; readonly c: number }

/** DT3: from the five 1-minute bars 09:30-09:34, the trade plan for capital `cap` (risk 1%, max `maxLev`x, target 10R). Null on a doji or bad data. */
export function orbPlan(first5: readonly Bar[], refPrice: number, cap: number, maxLev = 4): { side: "buy" | "sell"; qty: number; stop: number; target: number } | null {
  if (first5.length !== 5 || !(cap > 0) || !(refPrice > 0)) return null;
  const o0 = first5[0]!.o, c4 = first5[4]!.c;
  if (c4 === o0) return null;
  const dir = c4 > o0 ? 1 : -1;
  const stop = dir === 1 ? Math.min(...first5.map((b) => b.l)) : Math.max(...first5.map((b) => b.h));
  const risk = dir * (refPrice - stop);
  if (!(risk > 0)) return null;
  const qty = Math.floor(Math.min((0.01 * cap) / risk, (maxLev * cap) / refPrice));
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
/** True if the stop level was already touched by any of the bars (09:35 .. entry): the delayed-entry DT3 then skips the day. */
export function stopTouched(bars: readonly Bar[], side: "buy" | "sell", stop: number): boolean {
  return bars.some((b) => (side === "buy" ? b.l <= stop : b.h >= stop));
}
/** Shares of SPY to sell at the open when the last DT8 order was a sell but shares are still held (e.g. a partially filled
 * market-on-close order); 0 otherwise. `lastDt8Id` = client_order_id of the most recent DT8 order ("dt8-buy-..." / "dt8-sell-..."). */
export function dt8Leftover(lastDt8Id: string | undefined, heldQty: number): number {
  return lastDt8Id?.startsWith("dt8-sell-") && heldQty > 0 ? heldQty : 0;
}

/** What to do with a DT8 market order near the close. Paper accounts add random partial fills; a canceled/expired/rejected
 * order with shares missing is sent again for the rest (at most `maxResends` times) while at least 45 s are left. */
export function fillAction(o: { status: string; qty: number; filled: number }, secsToClose: number, resends: number, maxResends = 3):
  { act: "done" } | { act: "wait" } | { act: "resend"; qty: number } | { act: "give-up"; missing: number } {
  const missing = o.qty - o.filled;
  if (o.status === "filled" || missing <= 0) return { act: "done" };
  const final = ["canceled", "expired", "rejected", "done_for_day"].includes(o.status);
  if (secsToClose < 45 || (final && resends >= maxResends)) return { act: "give-up", missing };
  return final ? { act: "resend", qty: missing } : { act: "wait" };
}

// ---------------- Noise band (DT1 on QQQ, reports/bot-v2.md) ----------------
/** Desired position at a half-hour check: +1 above max(upper band, VWAP), -1 below min(lower band, VWAP), else 0.
 * pastMoves = |price at this time of day / that day's open - 1| on the previous sessions (at least 10 needed, normally 14). */
export function noiseBand(x: { open: number; prevClose: number; pastMoves: readonly number[]; price: number; vwap: number }): { want: -1 | 0 | 1; ub: number; lb: number } | null {
  if (x.pastMoves.length < 10 || !(x.open > 0) || !(x.prevClose > 0) || !(x.price > 0) || !(x.vwap > 0)) return null;
  const sigma = x.pastMoves.reduce((a, b) => a + b, 0) / x.pastMoves.length;
  const ub = Math.max(x.open, x.prevClose) * (1 + sigma), lb = Math.min(x.open, x.prevClose) * (1 - sigma);
  return { want: x.price > Math.max(ub, x.vwap) ? 1 : x.price < Math.min(lb, x.vwap) ? -1 : 0, ub, lb };
}
/** Noise-band leverage: min(maxLev, 2% / sample sd of the last 14 daily returns). closes = the last 15 session closes, oldest first. */
export function nbLeverage(closes: readonly number[], maxLev = 2): number {
  if (closes.length !== 15) return 0;
  const r = closes.slice(1).map((c, i) => c / closes[i]! - 1), m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return sd > 0 ? Math.min(maxLev, 0.02 / sd) : 0;
}
/** Orders (signed share counts) that move a position from `current` to direction `want` with size `qty`: nothing when the
 * direction is already right (the size is not adjusted during the day), otherwise close first, then open. */
export function nbOrders(current: number, want: -1 | 0 | 1, qty: number): number[] {
  if (Math.sign(current) === want) return [];
  const out: number[] = [];
  if (current !== 0) out.push(-current);
  if (want !== 0 && qty > 0) out.push(want * qty);
  return out;
}
/** Idle DT8 cash goes to BIL: target shares (0 while DT8 holds SPY), and whether the difference is worth an order (> 2% of equity). */
export function bilTarget(inSpy: boolean, equity: number, price: number, held: number): { target: number; delta: number } {
  const target = inSpy || !(price > 0) ? 0 : Math.floor((0.5 * equity) / price);
  const delta = target - held;
  return { target, delta: target === 0 || Math.abs(delta) * price > 0.02 * equity ? delta : 0 };
}
