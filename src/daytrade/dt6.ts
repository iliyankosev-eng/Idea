// DT6: ORB on "Stocks in Play" (relative opening volume) with an optional pre-open news filter (experiments/dt6-preregistration.md).
import type { Session } from "../intraday/sessions.js";
import { nyToUtc, type DayRet } from "./dt.js";

export interface SymDay {
  readonly sym: string;
  readonly date: string;
  readonly relVol: number;
  readonly atr: number; // in price units (ATR% x today's open)
  readonly hasNews: boolean;
  readonly s: Session;
}

/** Per symbol: the days that pass the filters, with RelVol, ATR and the news flag. */
export function candidates(sym: string, ss: readonly Session[], newsMs: readonly number[]): SymDay[] {
  const out: SymDay[] = [];
  const vol5: number[] = [], dayVol: number[] = [], trPct: number[] = [];
  const last = (s: Session) => s.c[s.c.length - 1]!;
  ss.forEach((s, d) => {
    const ok5 = s.minute[0] === 570 && s.minute[4] === 574;
    vol5.push(ok5 ? (s.v ?? []).slice(0, 5).reduce((a, b) => a + b, 0) : NaN);
    dayVol.push((s.v ?? []).reduce((a, b) => a + b, 0));
    if (d === 0) { trPct.push(NaN); return; }
    const pc = last(ss[d - 1]!);
    const split = Math.abs(Math.log(s.o[0]! / pc)) > Math.log(1.25);
    trPct.push(split ? NaN : (Math.max(Math.max(...s.h), pc) - Math.min(Math.min(...s.l), pc)) / pc);
  });
  const newsAfter = (t: number) => { let lo = 0, hi = newsMs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (newsMs[m]! < t) lo = m + 1; else hi = m; } return lo; };
  for (let d = 15; d < ss.length; d++) {
    const s = ss[d]!;
    if (!(vol5[d]! > 0)) continue;
    const prev5 = vol5.slice(d - 14, d).filter((x) => x > 0);
    const trs = trPct.slice(d - 14, d).filter((x) => Number.isFinite(x));
    if (prev5.length < 10 || trs.length < 10) continue;
    const relVol = vol5[d]! / (prev5.reduce((a, b) => a + b, 0) / prev5.length);
    const open = s.o[0]!, atr = (trs.reduce((a, b) => a + b, 0) / trs.length) * open;
    const avgVol = dayVol.slice(d - 14, d).reduce((a, b) => a + b, 0) / 14;
    if (!(open > 5 && atr > 0.5 && avgVol >= 1_000_000)) continue;
    const prevDate = ss[d - 1]!.date;
    const from = nyToUtc(prevDate, 16, 0), to = nyToUtc(s.date, 9, 30);
    const k = newsAfter(from);
    out.push({ sym, date: s.date, relVol, atr, hasNews: k < newsMs.length && newsMs[k]! < to, s });
  }
  return out;
}

export interface Fill { readonly r: number; readonly exposure: number; readonly traded: boolean }

/** One ORB position: stop order at the 5-minute extreme from 09:35, stop 10% ATR, exit at the last minute. Return per $ of capital (unscaled). */
export function orbTrade(c: SymDay, cost: number): Fill {
  const s = c.s, none = { r: 0, exposure: 0, traded: false };
  if (s.minute[5] === undefined) return none;
  const o0 = s.o[0]!, c4 = s.c[4]!;
  if (c4 === o0) return none;
  const dir = c4 > o0 ? 1 : -1;
  const level = dir === 1 ? Math.max(...s.h.slice(0, 5)) : Math.min(...s.l.slice(0, 5));
  let i = 5, fill = NaN;
  for (; i < s.minute.length; i++) {
    if (dir === 1 && s.h[i]! >= level) { fill = Math.max(s.o[i]!, level); break; }
    if (dir === -1 && s.l[i]! <= level) { fill = Math.min(s.o[i]!, level); break; }
  }
  if (!Number.isFinite(fill)) return none;
  const stop = fill - dir * 0.1 * c.atr;
  const q = Math.min(0.01 / (0.1 * c.atr), 4 / fill);
  let exit = s.c[s.c.length - 1]!;
  for (let j = i; j < s.minute.length; j++) {
    if (j > i && dir * (s.o[j]! - stop) <= 0) { exit = s.o[j]!; break; }
    if (dir === 1 ? s.l[j]! <= stop : s.h[j]! >= stop) { exit = stop; break; }
  }
  return { r: dir * (exit - fill) * q - 2 * cost * q, exposure: q * fill, traded: true };
}

/** Daily portfolio: all chosen candidates of a day, scaled down if total exposure > 4x. */
export function portfolio(days: readonly string[], cands: readonly SymDay[], pick: (c: SymDay) => boolean, cost: number): DayRet[] {
  const by = new Map<string, SymDay[]>();
  for (const c of cands) if (pick(c)) (by.get(c.date) ?? by.set(c.date, []).get(c.date)!).push(c);
  return days.map((day) => {
    const fills = (by.get(day) ?? []).map((c) => orbTrade(c, cost)).filter((f) => f.traded);
    const expo = fills.reduce((a, f) => a + f.exposure, 0);
    const scale = expo > 4 ? 4 / expo : 1;
    return { day, r: scale * fills.reduce((a, f) => a + f.r, 0), trades: fills.length };
  });
}
