// silviotrades "big candle, small candle with big wick" supply/demand model (experiments/silvio-sd-preregistration.md).
// Everything is written for longs (demand zones below price, up trend); shorts run the same code on mirrored
// sessions (prices negated, high <-> low), which turns each rule into its mirror image.
import type { Session } from "../intraday/sessions.js";
import { atr } from "../fib/confluence.js";

export interface Prep {
  readonly date: string[];
  readonly close: number[]; // session close
  readonly sma20: number[];
  /** hourly bars (from 09:30) with their session index */
  readonly H: { day: string[]; s: number[]; o: number[]; h: number[]; l: number[]; c: number[]; atr: number[] };
  readonly lastHour: number[]; // per session: index of its last hourly bar (-1 if none)
  /** 5-minute bars per session */
  readonly m5: { start: number[]; o: number[]; h: number[]; l: number[]; c: number[] }[];
}
export interface Zone { readonly cIdx: number; readonly s: number; readonly lo: number; readonly hi: number; readonly touch: number }
export interface DayTrade { readonly date: string; readonly dir: 1 | -1; readonly entryIdx: number; readonly entry: number; readonly stop: number; readonly target: number; readonly exit: number; readonly exitIdx: number; readonly r: number }

export function mirrorSessions(ss: readonly Session[]): Session[] {
  return ss.map((s) => ({ ...s, o: s.o.map((x) => -x), h: s.l.map((x) => -x), l: s.h.map((x) => -x), c: s.c.map((x) => -x) }));
}

export function prepare(ss: readonly Session[]): Prep {
  const date = ss.map((s) => s.date), close = ss.map((s) => s.c[s.c.length - 1]!);
  const sma20 = close.map((_, i) => (i < 19 ? NaN : close.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20));
  const H = { day: [] as string[], s: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], atr: [] as number[] };
  const lastHour: number[] = [];
  const m5: Prep["m5"] = [];
  ss.forEach((s, si) => {
    let hk = -1, fk = -1;
    const f = { start: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[] };
    for (let i = 0; i < s.minute.length; i++) {
      const m = s.minute[i]!;
      if (m < 570 || m >= 960) continue;
      const k = Math.floor((m - 570) / 60);
      if (k !== hk) { hk = k; H.day.push(s.date); H.s.push(si); H.o.push(s.o[i]!); H.h.push(s.h[i]!); H.l.push(s.l[i]!); H.c.push(s.c[i]!); }
      else { const j = H.c.length - 1; H.h[j] = Math.max(H.h[j]!, s.h[i]!); H.l[j] = Math.min(H.l[j]!, s.l[i]!); H.c[j] = s.c[i]!; }
      const q = Math.floor((m - 570) / 5);
      if (q !== fk) { fk = q; f.start.push(570 + 5 * q); f.o.push(s.o[i]!); f.h.push(s.h[i]!); f.l.push(s.l[i]!); f.c.push(s.c[i]!); }
      else { const j = f.c.length - 1; f.h[j] = Math.max(f.h[j]!, s.h[i]!); f.l[j] = Math.min(f.l[j]!, s.l[i]!); f.c[j] = s.c[i]!; }
    }
    lastHour.push(H.c.length - 1);
    m5.push(f);
  });
  H.atr = atr({ day: H.day, o: H.o, h: H.h, l: H.l, c: H.c });
  return { date, close, sma20, H, lastHour, m5 };
}

/** Demand zones: A big, B small body with big wicks, C big and green; zone = [low(B), high(B)]; touch = first later hourly bar with low <= high(B). */
export interface Thresholds { readonly big: number; readonly rngB: number; readonly bodyB: number }
export const V1: Thresholds = { big: 1.0, rngB: 0.5, bodyB: 0.35 };
export const V2: Thresholds = { big: 0.5, rngB: 0.3, bodyB: 0.5 };
export function demandZones(p: Prep, th: Thresholds = V1): Zone[] {
  const { H } = p, out: Zone[] = [];
  for (let j = 2; j < H.c.length; j++) {
    const a = H.atr[j]!;
    if (!(a > 0)) continue;
    const bodyA = Math.abs(H.c[j - 2]! - H.o[j - 2]!), rngB = H.h[j - 1]! - H.l[j - 1]!, bodyB = Math.abs(H.c[j - 1]! - H.o[j - 1]!), bodyC = H.c[j]! - H.o[j]!;
    if (bodyA >= th.big * a && rngB >= th.rngB * a && bodyB <= th.bodyB * rngB && bodyB <= 0.5 * bodyA && bodyC >= th.big * a) {
      const lo = H.l[j - 1]!, hi = H.h[j - 1]!;
      let touch = H.c.length; // never
      for (let k = j + 1; k < H.c.length; k++) if (H.l[k]! <= hi) { touch = k; break; }
      out.push({ cIdx: j, s: H.s[j]!, lo, hi, touch });
    }
  }
  return out;
}

export function trendUp(p: Prep, s: number): boolean {
  if (s < 25) return false;
  return p.close[s - 1]! > p.sma20[s - 1]! && p.sma20[s - 1]! > p.sma20[s - 6]!;
}

/** The most recent fresh demand zone for session s: formed in the last 60 sessions before s, entirely below the previous close, untouched until the end of s-1. */
export function pickZone(p: Prep, zones: readonly Zone[], s: number): Zone | null {
  const lastPrev = p.lastHour[s - 1]!;
  for (let k = zones.length - 1; k >= 0; k--) {
    const z = zones[k]!;
    if (z.s >= s) continue;
    if (z.s < s - 60) break;
    if (z.hi < p.close[s - 1]! && z.touch > lastPrev) return z;
  }
  return null;
}

/** The long trade of session s in zone z (5-minute bars), or null. rr = target in multiples of the risk. */
export function dayLong(p: Prep, s: number, z: { lo: number; hi: number }, rr: number, costPerShare: number): Omit<DayTrade, "dir" | "date"> | null {
  const f = p.m5[s]!, n = f.c.length;
  if (!n || f.o[0]! < z.lo) return null; // opened below the zone: straight through
  let tap = -1;
  for (let k = 0; k < n; k++) if (f.l[k]! <= z.hi) { tap = k; break; }
  if (tap < 0) return null;
  const isPivotHigh = (i: number) => i >= 2 && i + 2 < n && f.h[i]! > f.h[i - 1]! && f.h[i]! > f.h[i - 2]! && f.h[i]! > f.h[i + 1]! && f.h[i]! > f.h[i + 2]!;
  for (let e = tap; e < n - 1; e++) {
    if (f.c[e]! < z.lo) return null; // closed through the zone
    let level = NaN; // most recent pivot high confirmed before bar e (pivot i known after bar i+2)
    for (let i = e - 3; i >= 2; i--) if (isPivotHigh(i)) { level = f.h[i]!; break; }
    if (!(f.c[e]! > level)) continue;
    const k = e + 1;
    if (f.start[k]! >= 900) return null;
    const entry = f.o[k]!;
    let lowSince = Infinity;
    for (let j = tap; j <= e; j++) lowSince = Math.min(lowSince, f.l[j]!);
    const stop = lowSince - 0.01, risk = entry - stop;
    if (!(risk > 0)) return null;
    const target = entry + rr * risk;
    let exit = f.c[n - 1]!, exitIdx = n - 1;
    for (let j = k; j < n; j++) {
      if (j > k && f.o[j]! <= stop) { exit = f.o[j]!; exitIdx = j; break; }
      if (j > k && f.o[j]! >= target) { exit = f.o[j]!; exitIdx = j; break; }
      if (f.l[j]! <= stop) { exit = stop; exitIdx = j; break; }
      if (f.h[j]! >= target) { exit = target; exitIdx = j; break; }
    }
    return { entryIdx: k, entry, stop, target, exit, exitIdx, r: (exit - entry - 2 * costPerShare) / risk };
  }
  return null;
}

export interface RunOpts { readonly rr: number; readonly cost: number; readonly trend: boolean; readonly flip?: () => boolean; readonly th?: Thresholds }

/** One trade per session: longs on up-trend days, shorts (mirrored) on down-trend days; without the trend filter the earlier entry wins. */
export function silvioTrades(ss: readonly Session[], o: RunOpts): DayTrade[] {
  const P = prepare(ss), M = prepare(mirrorSessions(ss));
  const zL = demandZones(P, o.th ?? V1), zS = demandZones(M, o.th ?? V1);
  const out: DayTrade[] = [];
  for (let s = 25; s < ss.length; s++) {
    const cands: { dir: 1 | -1; t: NonNullable<ReturnType<typeof dayLong>> }[] = [];
    if (!o.trend || trendUp(P, s)) { const z = pickZone(P, zL, s); const t = z && dayLong(P, s, z, o.rr, o.cost); if (t) cands.push({ dir: 1, t }); }
    if (!o.trend || trendUp(M, s)) { const z = pickZone(M, zS, s); const t = z && dayLong(M, s, z, o.rr, o.cost); if (t) cands.push({ dir: -1, t }); }
    if (!cands.length) continue;
    cands.sort((a, b) => a.t.entryIdx - b.t.entryIdx || a.dir - b.dir);
    const c = cands[0]!;
    let dir = c.dir, t = c.t;
    if (o.flip && o.flip()) { // same entry bar and distances, other side
      const fr = dir === 1 ? M : P, f = fr.m5[s]!, risk = t.entry - t.stop, k = t.entryIdx, n = f.c.length;
      const entry = f.o[k]!, stop = entry - risk, target = entry + o.rr * risk;
      let exit = f.c[n - 1]!, exitIdx = n - 1;
      for (let j = k; j < n; j++) {
        if (j > k && f.o[j]! <= stop) { exit = f.o[j]!; exitIdx = j; break; }
        if (j > k && f.o[j]! >= target) { exit = f.o[j]!; exitIdx = j; break; }
        if (f.l[j]! <= stop) { exit = stop; exitIdx = j; break; }
        if (f.h[j]! >= target) { exit = target; exitIdx = j; break; }
      }
      dir = dir === 1 ? -1 : 1;
      t = { entryIdx: k, entry, stop, target, exit, exitIdx, r: (exit - entry - 2 * o.cost) / risk };
    }
    out.push({ date: ss[s]!.date, dir, entryIdx: t.entryIdx, entry: dir * t.entry, stop: dir * t.stop, target: dir * t.target, exit: dir * t.exit, exitIdx: t.exitIdx, r: t.r });
  }
  return out;
}
