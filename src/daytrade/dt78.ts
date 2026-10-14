// DT7 overnight hold and DT8 RSI(2) mean reversion (experiments/dt78-preregistration.md).
import type { Session } from "../intraday/sessions.js";
import type { DayRet } from "./dt.js";

/** DT7: hold from the last minute of the previous session to the 09:30 open. `intraday` = the opposite leg (open -> close). */
export function dt7(ss: readonly Session[], costPerShare: number, intraday = false): DayRet[] {
  const out: DayRet[] = [];
  for (let d = 1; d < ss.length; d++) {
    const s = ss[d]!, p = ss[d - 1]!;
    const ok = s.minute[0] === 570 && (!s.prevDate || s.prevDate === p.date);
    if (!ok) { out.push({ day: s.date, r: 0, trades: 0 }); continue; }
    const a = intraday ? s.o[0]! : p.c[p.c.length - 1]!, b = intraday ? s.c[s.c.length - 1]! : s.o[0]!;
    out.push({ day: s.date, r: b / a - 1 - (2 * costPerShare) / a, trades: 1 });
  }
  return out;
}

export interface Daily { readonly date: readonly string[]; readonly c: readonly number[] }

/** Wilder RSI(n) of closes; NaN until n changes are available. */
export function rsi(c: readonly number[], n = 2): number[] {
  const out = c.map(() => NaN);
  let up = 0, dn = 0;
  for (let i = 1; i < c.length; i++) {
    const ch = c[i]! - c[i - 1]!, u = Math.max(ch, 0), d = Math.max(-ch, 0);
    if (i <= n) { up += u / n; dn += d / n; if (i === n) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn); continue; }
    up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + d) / n;
    out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  }
  return out;
}
const sma = (c: readonly number[], i: number, n: number) => { if (i < n - 1) return NaN; let s = 0; for (let k = i - n + 1; k <= i; k++) s += c[k]!; return s / n; };

/** DT8: buy at the close when RSI(2) < 10 and close > SMA(200); sell at the close when close > SMA(5). Daily returns (close to close). */
export function dt8(d: Daily, costPerShare: number): DayRet[] {
  const r2 = rsi(d.c, 2);
  const out: DayRet[] = [];
  let inPos = false;
  for (let i = 1; i < d.c.length; i++) {
    let r = inPos ? d.c[i]! / d.c[i - 1]! - 1 : 0, trades = 0;
    const c = d.c[i]!;
    if (inPos && c > sma(d.c, i, 5)) { inPos = false; r -= costPerShare / c; trades = 1; }
    else if (!inPos && r2[i]! < 10 && c > sma(d.c, i, 200)) { inPos = true; r -= costPerShare / c; }
    out.push({ day: d.date[i]!, r, trades });
  }
  return out;
}
