// The three pre-registered hypotheses (experiments/daytrading-preregistration.md) and their random baselines.
// Each function receives all sessions of ONE symbol in date order and returns trades; only bars that are complete
// at the decision time are read.
import { mulberry32 } from "../evaluate.js";
import { firstAtOrAfter, lastAtOrBefore, LAST, OPEN, type Session } from "./sessions.js";
import { simulateTrade, type IntradayTrade, type TradePlan } from "./sim.js";

const M = (h: number, m: number) => h * 60 + m;

/** Median of (high - low) / open over the 20 sessions before index k, or NaN if fewer than 20. */
export function medianRange20(ss: Session[], k: number): number {
  if (k < 20) return NaN;
  const xs: number[] = [];
  for (let j = k - 20; j < k; j++) {
    const s = ss[j]!;
    xs.push((Math.max(...s.h) - Math.min(...s.l)) / s.o[0]!);
  }
  xs.sort((a, b) => a - b);
  return (xs[9]! + xs[10]!) / 2;
}

// ---------- H1: opening "U" (dip in the first 20 minutes, then half of it recovered) ----------
export function h1Plan(ss: Session[], k: number): TradePlan | null {
  const s = ss[k]!;
  if (s.minute[0] !== OPEN) return null; // the 09:30 bar must exist
  const iC = lastAtOrBefore(s, M(9, 49));
  const r20 = medianRange20(ss, k);
  if (iC < 0 || !(r20 > 0)) return null;
  const O = s.o[0]!;
  let L = Infinity;
  for (let i = 0; i <= iC; i++) L = Math.min(L, s.l[i]!);
  const C = s.c[iC]!;
  if ((O - L) / O < 0.25 * r20) return null;
  if (C < L + 0.5 * (O - L)) return null;
  const i0 = firstAtOrAfter(s, M(9, 50));
  if (i0 < 0) return null;
  const entry = s.o[i0]!, risk = entry - L;
  if (!(risk > 0)) return null;
  return { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: L, target: entry + 2 * risk };
}

// ---------- H2: 5-minute opening range breakout (Zarattini & Aziz) ----------
export function h2Plan(ss: Session[], k: number): TradePlan | null {
  const s = ss[k]!;
  if (s.minute[0] !== OPEN) return null;
  const i5 = lastAtOrBefore(s, M(9, 34));
  if (i5 < 0) return null;
  const open = s.o[0]!, close = s.c[i5]!;
  if (close === open) return null;
  let hi = -Infinity, lo = Infinity;
  for (let i = 0; i <= i5; i++) { hi = Math.max(hi, s.h[i]!); lo = Math.min(lo, s.l[i]!); }
  const dir: 1 | -1 = close > open ? 1 : -1;
  const i0 = firstAtOrAfter(s, M(9, 35));
  if (i0 < 0) return null;
  const entry = s.o[i0]!, stop = dir === 1 ? lo : hi, risk = dir * (entry - stop);
  if (!(risk > 0)) return null;
  return { dir, entryMinute: M(9, 35), exitMinute: LAST, stop, target: entry + dir * 10 * risk };
}

// ---------- H3: intraday momentum (Gao, Han, Li, Zhou 2018) ----------
export function h3Plan(ss: Session[], k: number): TradePlan | null {
  if (k < 1) return null;
  const s = ss[k]!, prev = ss[k - 1]!;
  if (s.prevDate !== undefined && prev.date !== s.prevDate) return null; // previous session missing: no reliable previous close
  const prevClose = prev.c[prev.c.length - 1]!; // last regular bar of the previous session (15:59, or earlier on a short day)
  const i10 = lastAtOrBefore(s, M(9, 59));
  if (i10 < 0 || !s.minute.includes(M(15, 30))) return null;
  const firstOpen = s.o[0]!;
  if (Math.abs(firstOpen / prevClose - 1) > 0.2) return null; // possible split (prices are not adjusted)
  const r1 = s.c[i10]! / prevClose - 1;
  if (r1 === 0) return null;
  return { dir: r1 > 0 ? 1 : -1, entryMinute: M(15, 30), exitMinute: LAST, stop: null, target: null };
}

export type Hypothesis = "H1" | "H2" | "H3";
const PLANS = { H1: h1Plan, H2: h2Plan, H3: h3Plan } as const;

/** Real trades of one hypothesis on one symbol, only for sessions whose date is in [from, to]. */
export function realTrades(h: Hypothesis, ss: Session[], from: string, to: string, cost: number): IntradayTrade[] {
  const out: IntradayTrade[] = [];
  for (let k = 0; k < ss.length; k++) {
    const d = ss[k]!.date;
    if (d < from || d > to) continue;
    const p = PLANS[h](ss, k);
    if (!p) continue;
    const t = simulateTrade(ss[k]!, p, cost);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Random baselines with the same exits (seed-reproducible).
 * H1: for every real trade, a random session of the same symbol in [from, to], long at 09:50 with the same % distances
 *     to stop and target and the same 10:29 time exit.
 * H2, H3: the same sessions and plans, but a random direction (stop/target mirrored by keeping their % distances).
 */
export function randomTrades(h: Hypothesis, ss: Session[], from: string, to: string, cost: number, real: IntradayTrade[], seed: number): IntradayTrade[] {
  const rnd = mulberry32(seed);
  const pool = ss.filter((s) => s.date >= from && s.date <= to);
  const out: IntradayTrade[] = [];
  if (h === "H1") {
    for (const t of real) {
      // same distances as the real trade: stopPct and targetPct relative to its entry
      const plan = PLANS.H1(ss, ss.findIndex((s) => s.date === t.date))!;
      const stopPct = (t.entry - plan.stop!) / t.entry, targetPct = (plan.target! - t.entry) / t.entry;
      for (let tries = 0; tries < 50; tries++) {
        const s = pool[Math.floor(rnd() * pool.length)]!;
        const r = simulateTrade(s, { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: null, target: null, stopPct, targetPct }, cost);
        if (r) { out.push(r); break; }
      }
    }
    return out;
  }
  for (let k = 0; k < ss.length; k++) {
    const s = ss[k]!;
    if (s.date < from || s.date > to) continue;
    const p = PLANS[h](ss, k);
    if (!p) continue;
    const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
    const entry = s.o[firstAtOrAfter(s, p.entryMinute)]!;
    const stopPct = p.stop !== null ? Math.abs(entry - p.stop) / entry : undefined;
    const targetPct = p.target !== null ? Math.abs(p.target - entry) / entry : undefined;
    const r = simulateTrade(s, { dir, entryMinute: p.entryMinute, exitMinute: p.exitMinute, stop: null, target: null, ...(stopPct !== undefined ? { stopPct } : {}), ...(targetPct !== undefined ? { targetPct } : {}) }, cost);
    if (r) out.push(r);
  }
  return out;
}
