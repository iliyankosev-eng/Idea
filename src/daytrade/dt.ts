// DT1-DT5: five published day trading strategies (experiments/daytrade5-preregistration.md).
// Every function returns one net return per day as a fraction of capital (0 on days without a trade).
import type { Session } from "../intraday/sessions.js";

export interface DayRet { readonly day: string; readonly r: number; readonly trades: number }
export const COST_PER_SHARE = 0.0035 + 0.001; // commission + slippage, per share and side (DT1-DT4)

/** Index of the last bar whose minute is < m (the bar that closes at m), or -1. */
export function barBefore(s: Session, m: number): number {
  let k = -1;
  for (let i = 0; i < s.minute.length && s.minute[i]! < m; i++) k = i;
  return k;
}
/** Index of the first bar with minute >= m, or -1. */
export function barAtOrAfter(s: Session, m: number): number {
  for (let i = 0; i < s.minute.length; i++) if (s.minute[i]! >= m) return i;
  return -1;
}
/** VWAP of bars with minute < m (typical price (h+l+c)/3 weighted by volume). */
export function vwapBefore(s: Session, m: number): number {
  let pv = 0, v = 0;
  for (let i = 0; i < s.minute.length && s.minute[i]! < m; i++) { const vol = s.v?.[i] ?? 0; pv += ((s.h[i]! + s.l[i]! + s.c[i]!) / 3) * vol; v += vol; }
  return v > 0 ? pv / v : NaN;
}
const sd = (xs: readonly number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
/** Sessions are usable when the 09:30 bar exists and the previous kept session is the official previous one. */
const linked = (ss: readonly Session[], d: number) => d > 0 && ss[d]!.minute[0] === 570 && (!ss[d]!.prevDate || ss[d]!.prevDate === ss[d - 1]!.date);

// ---------------- DT1: Noise Area intraday momentum ----------------
export interface DT1Opts { readonly dynamic: boolean; readonly execNextOpen: boolean; readonly cost: number }
export function dt1(ss: readonly Session[], o: DT1Opts): DayRet[] {
  const out: DayRet[] = [];
  // per session: minute -> |close/open - 1|
  const moves = ss.map((s) => { const m = new Map<number, number>(); if (s.minute[0] === 570) for (let i = 0; i < s.minute.length; i++) m.set(s.minute[i]!, Math.abs(s.c[i]! / s.o[0]! - 1)); return m; });
  const closes = ss.map((s) => s.c[s.c.length - 1]!);
  for (let d = 15; d < ss.length; d++) {
    const s = ss[d]!;
    if (!linked(ss, d)) { out.push({ day: s.date, r: 0, trades: 0 }); continue; }
    const open = s.o[0]!, prevClose = closes[d - 1]!;
    const rets: number[] = [];
    for (let k = d - 14; k < d; k++) rets.push(closes[k]! / closes[k - 1]! - 1);
    const lev = o.dynamic ? Math.min(4, 0.02 / sd(rets)) : 1;
    const q = lev / open; // shares per unit of capital
    const last = s.minute[s.minute.length - 1]!;
    let pos = 0, entry = 0, pnl = 0, n = 0;
    const trade = (to: number, price: number) => { // move position to `to` (-1, 0, 1) at price
      if (pos !== 0) { pnl += pos * (price - entry) * q - o.cost * q; n++; }
      if (to !== 0) { entry = price; pnl -= o.cost * q; }
      pos = to;
    };
    for (let m = 600; m <= 930 && m < last; m += 30) {
      const vals: number[] = [];
      for (let k = d - 14; k < d; k++) { const v = moves[k]!.get(m - 1); if (v !== undefined) vals.push(v); }
      if (vals.length < 10) continue;
      const sigma = vals.reduce((a, b) => a + b, 0) / vals.length;
      const ub = Math.max(open, prevClose) * (1 + sigma), lb = Math.min(open, prevClose) * (1 - sigma);
      const i = barBefore(s, m);
      if (i < 0) continue;
      const p = s.c[i]!;
      const vw = vwapBefore(s, m);
      const exec = o.execNextOpen ? (() => { const j = barAtOrAfter(s, m); return j >= 0 ? s.o[j]! : p; })() : p;
      // Entry above UB / below LB, trailing stop max(UB, VWAP) / min(LB, VWAP). Applied together at each check, the stop
      // overrides the entry, so the position is: long if p > max(UB, VWAP), short if p < min(LB, VWAP), else flat.
      const want = p > Math.max(ub, vw) ? 1 : p < Math.min(lb, vw) ? -1 : 0;
      if (want !== pos) trade(want, exec);
    }
    if (pos !== 0) trade(0, s.c[s.c.length - 1]!);
    out.push({ day: s.date, r: pnl, trades: n });
  }
  return out;
}

// ---------------- DT2: VWAP trend ----------------
export function dt2(ss: readonly Session[], cost: number): DayRet[] {
  return ss.map((s) => {
    if (s.minute[0] !== 570 || s.minute.length < 3) return { day: s.date, r: 0, trades: 0 };
    const q = 1 / s.o[0]!;
    let pos = 0, entry = 0, pnl = 0, n = 0, pv = 0, vv = 0;
    const lastI = s.minute.length - 1;
    for (let i = 0; i < lastI; i++) {
      const vol = s.v?.[i] ?? 0;
      pv += ((s.h[i]! + s.l[i]! + s.c[i]!) / 3) * vol; vv += vol;
      if (i >= lastI - 1) break; // the last decision executes at the open of the last minute (flatten)
      const vw = vv > 0 ? pv / vv : s.c[i]!;
      const want = s.c[i]! > vw ? 1 : s.c[i]! < vw ? -1 : pos;
      if (want !== pos) {
        const px = s.o[i + 1]!;
        if (pos !== 0) { pnl += pos * (px - entry) * q - cost * q; n++; }
        entry = px; pnl -= cost * q; pos = want;
      }
    }
    if (pos !== 0) { const px = s.o[lastI]!; pnl += pos * (px - entry) * q - cost * q; n++; }
    return { day: s.date, r: pnl, trades: n };
  });
}

// ---------------- DT3: 5-minute ORB ----------------
export function dt3(ss: readonly Session[], cost: number): DayRet[] {
  return ss.map((s) => {
    const none = { day: s.date, r: 0, trades: 0 };
    if (s.minute[0] !== 570 || s.minute[4] !== 574 || s.minute[5] !== 575) return none;
    const o0 = s.o[0]!, c4 = s.c[4]!;
    if (c4 === o0) return none;
    const dir = c4 > o0 ? 1 : -1;
    const hi = Math.max(...s.h.slice(0, 5)), lo = Math.min(...s.l.slice(0, 5));
    const entry = s.o[5]!, stop = dir === 1 ? lo : hi, risk = dir * (entry - stop);
    if (!(risk > 0)) return none;
    const target = entry + dir * 10 * risk;
    const q = Math.min(0.01 / risk, 4 / entry);
    let exit = s.c[s.c.length - 1]!;
    for (let i = 5; i < s.minute.length; i++) {
      if (dir * (s.o[i]! - stop) <= 0 && i > 5) { exit = s.o[i]!; break; } // gap through the stop
      if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) { exit = stop; break; }
      if (dir === 1 ? s.h[i]! >= target : s.l[i]! <= target) { exit = target; break; }
    }
    return { day: s.date, r: dir * (exit - entry) * q - 2 * cost * q, trades: 1 };
  });
}

/**
 * DT3 with a later entry (bot adaptation, post-hoc): the free Alpaca plan gives SIP bars only with a 15-minute delay,
 * so the opening range 09:30-09:34 from SIP is known at 09:50. Entry at the open of minute 09:30 + e; the day is skipped
 * if the stop was already touched between 09:35 and the entry. e = 5 is exactly dt3().
 */
export function dt3Late(ss: readonly Session[], cost: number, e: number): DayRet[] {
  return ss.map((s) => {
    const none = { day: s.date, r: 0, trades: 0 };
    if (s.minute[0] !== 570 || s.minute[4] !== 574) return none;
    const i0 = s.minute.indexOf(570 + e);
    if (i0 < 5) return none;
    const o0 = s.o[0]!, c4 = s.c[4]!;
    if (c4 === o0) return none;
    const dir = c4 > o0 ? 1 : -1;
    const stop = dir === 1 ? Math.min(...s.l.slice(0, 5)) : Math.max(...s.h.slice(0, 5));
    for (let i = 5; i < i0; i++) if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) return none;
    const entry = s.o[i0]!, risk = dir * (entry - stop);
    if (!(risk > 0)) return none;
    const target = entry + dir * 10 * risk, q = Math.min(0.01 / risk, 4 / entry);
    let exit = s.c[s.c.length - 1]!;
    for (let i = i0; i < s.minute.length; i++) {
      if (dir * (s.o[i]! - stop) <= 0 && i > i0) { exit = s.o[i]!; break; }
      if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) { exit = stop; break; }
      if (dir === 1 ? s.h[i]! >= target : s.l[i]! <= target) { exit = target; break; }
    }
    return { day: s.date, r: dir * (exit - entry) * q - 2 * cost * q, trades: 1 };
  });
}

// ---------------- DT4: first half-hour predicts the last half-hour ----------------
export function dt4(ss: readonly Session[], cost: number): DayRet[] {
  const out: DayRet[] = [];
  for (let d = 0; d < ss.length; d++) {
    const s = ss[d]!;
    if (!linked(ss, d)) { out.push({ day: s.date, r: 0, trades: 0 }); continue; }
    const prevClose = ss[d - 1]!.c[ss[d - 1]!.c.length - 1]!;
    const i10 = barBefore(s, 600), last = s.minute[s.minute.length - 1]!;
    const iE = barAtOrAfter(s, last + 1 - 30);
    if (i10 < 0 || iE < 0 || s.minute[iE]! !== last + 1 - 30) { out.push({ day: s.date, r: 0, trades: 0 }); continue; }
    const r1 = s.c[i10]! / prevClose - 1;
    if (r1 === 0) { out.push({ day: s.date, r: 0, trades: 0 }); continue; }
    const dir = r1 > 0 ? 1 : -1, entry = s.o[iE]!, exit = s.c[s.c.length - 1]!;
    out.push({ day: s.date, r: dir * (exit / entry - 1) - (2 * cost) / entry, trades: 1 });
  }
  return out;
}

// ---------------- DT5: Bitcoin last half-hour before 17:00 New York ----------------
function tzOffsetMs(tz: string, ms: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - ms;
}
/** New York wall clock (date + hour:minute) -> UTC ms. */
export function nyToUtc(date: string, h: number, m: number): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const g = Date.UTC(y, mo - 1, d, h, m);
  let u = g - tzOffsetMs("America/New_York", g);
  u = g - tzOffsetMs("America/New_York", u);
  return u;
}
export interface Minutes { readonly t: readonly number[]; readonly c: readonly number[] }
/** Close of the minute bar that ends at time T (open time T - 60 s), allowing up to 5 minutes of missing bars; NaN if none. */
export function priceAtMs(b: Minutes, T: number): number {
  let lo = 0, hi = b.t.length - 1, k = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (b.t[mid]! <= T - 60_000) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  return k >= 0 && T - 60_000 - b.t[k]! <= 5 * 60_000 ? b.c[k]! : NaN;
}
export function dt5(b: Minutes, dates: readonly string[], cost: number): DayRet[] {
  return dates.map((D) => {
    const prev = new Date(Date.parse(`${D}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const p17p = priceAtMs(b, nyToUtc(prev, 17, 0)), p10 = priceAtMs(b, nyToUtc(D, 10, 0)), p16 = priceAtMs(b, nyToUtc(D, 16, 0));
    const p1630 = priceAtMs(b, nyToUtc(D, 16, 30)), p17 = priceAtMs(b, nyToUtc(D, 17, 0));
    if (![p17p, p10, p16, p1630, p17].every(Number.isFinite)) return { day: D, r: 0, trades: 0 };
    const onfh = p10 / p17p - 1, slh = p1630 / p16 - 1;
    const dir = onfh > 0 && slh < 0 ? 1 : onfh <= 0 && slh >= 0 ? -1 : 0;
    if (!dir) return { day: D, r: 0, trades: 0 };
    return { day: D, r: dir * (p17 / p1630 - 1) - 2 * cost, trades: 1 };
  });
}

// ---------------- statistics ----------------
export function perf(rs: readonly DayRet[], periodsPerYear = 252) {
  const r = rs.map((x) => x.r);
  const n = r.length, mean = r.reduce((a, b) => a + b, 0) / n;
  const vol = sd(r);
  let eq = 1, peak = 1, mdd = 0;
  for (const x of r) { eq *= 1 + x; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
  const years = n / periodsPerYear;
  return { days: n, trades: rs.reduce((a, x) => a + x.trades, 0), total: eq - 1, cagr: eq ** (1 / years) - 1, vol: vol * Math.sqrt(periodsPerYear), sharpe: (mean / vol) * Math.sqrt(periodsPerYear), mdd, meanDaily: mean };
}
export function byYear(rs: readonly DayRet[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of rs) { const y = x.day.slice(0, 4); m.set(y, (1 + (m.get(y) ?? 0)) * (1 + x.r) - 1); }
  return m;
}
