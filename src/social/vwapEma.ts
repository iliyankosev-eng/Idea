// S1: VWAP (session, OHLC4) / EMA 9 crossover, experiments/social5-preregistration.md.
import type { Session } from "../intraday/sessions.js";
import type { DayRet } from "../daytrade/dt.js";

export interface KBars { readonly date: string; readonly m: number[]; readonly o: number[]; readonly h: number[]; readonly l: number[]; readonly c: number[]; readonly v: number[] }

/** k-minute bars anchored at 09:30 (bar start minute m). */
export function toKBars(s: Session, k: number): KBars {
  const out: KBars = { date: s.date, m: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < s.minute.length; i++) {
    const start = 570 + Math.floor((s.minute[i]! - 570) / k) * k;
    const j = out.m.length - 1;
    if (j < 0 || out.m[j] !== start) { out.m.push(start); out.o.push(s.o[i]!); out.h.push(s.h[i]!); out.l.push(s.l[i]!); out.c.push(s.c[i]!); out.v.push(s.v?.[i] ?? 0); }
    else { out.h[j] = Math.max(out.h[j]!, s.h[i]!); out.l[j] = Math.min(out.l[j]!, s.l[i]!); out.c[j] = s.c[i]!; out.v[j]! += s.v?.[i] ?? 0; }
  }
  return out;
}

export interface S1Opts { readonly cost: number; readonly invert?: boolean; readonly first?: number; readonly last?: number }
/** One return per day (sum of that day's trades, fraction of capital, 1x). EMA continues across days; VWAP resets each day. */
export function s1(days: readonly KBars[], o: S1Opts): (DayRet & { n: number })[] {
  const first = o.first ?? 575, last = o.last ?? 930, a = 2 / 10, flip = o.invert ? -1 : 1;
  let ema: number | undefined;
  return days.map((d) => {
    let pv = 0, vv = 0, pos = 0, entry = 0, r = 0, n = 0, prevDiff: number | undefined;
    let pend: number | null = null; // target position to take at the next bar's open
    const close = (px: number) => { r += pos * (px / entry - 1) - o.cost / entry - o.cost / px; pos = 0; };
    for (let t = 0; t < d.m.length; t++) {
      // 1) orders decided at the previous close are executed at this bar's open
      if (pend !== null) {
        if (pos !== 0 && pend !== pos) close(d.o[t]!);
        if (pend !== 0 && pos === 0) { pos = pend; entry = d.o[t]!; n++; }
        pend = null;
      }
      // 2) indicators at this bar's close
      pv += ((d.o[t]! + d.h[t]! + d.l[t]! + d.c[t]!) / 4) * d.v[t]!; vv += d.v[t]!;
      ema = ema === undefined ? d.c[t]! : ema + a * (d.c[t]! - ema);
      if (vv === 0) { prevDiff = undefined; continue; }
      const diff = ema - pv / vv;
      // 3) decisions for the next bar
      let want: number | null = null;
      if (pos === 1 && d.c[t]! < ema) want = 0;
      if (pos === -1 && d.c[t]! > ema) want = 0;
      if (prevDiff !== undefined) {
        if (prevDiff <= 0 && diff > 0) want = flip; // EMA crosses above VWAP -> calls
        if (prevDiff >= 0 && diff < 0) want = -flip; // EMA crosses below VWAP (VWAP crosses above EMA) -> puts
      }
      prevDiff = diff;
      if (want !== null && t + 1 < d.m.length) {
        const nm = d.m[t + 1]!;
        if (want === 0 || (nm >= first && nm <= last)) pend = want;
        else if (pos !== 0 && want !== pos) pend = 0; // opposite signal outside the entry window: just exit
      }
    }
    if (pos !== 0) close(d.c[d.c.length - 1]!);
    return { day: d.date, r, trades: n, n };
  });
}
