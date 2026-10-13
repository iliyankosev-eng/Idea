// FVG + liquidity (swing high) + Break of Structure, 15-minute entry, 1:3 target with break even at 1:1.5.
// Rules: experiments/fvg-bos-preregistration.md.
import { mulberry32 } from "../evaluate.js";

/** 1-minute series on a "virtual minute" axis. Stocks: key = session * 1440 + minute of day, seg = session index; crypto: key = unix minutes, seg = 0. */
export interface Series1m {
  readonly key: number[];
  readonly day: string[];
  readonly seg: number[];
  readonly o: number[];
  readonly h: number[];
  readonly l: number[];
  readonly c: number[];
  readonly stock: boolean;
}

export interface Bar { readonly k0: number; readonly k1: number; readonly i0: number; readonly i1: number; readonly seg: number; readonly o: number; readonly h: number; readonly l: number; readonly c: number }

/** Mirror for shorts: prices negated, highs and lows swapped. The long rules on the mirror are the short rules. */
export function mirror(s: Series1m): Series1m {
  return { ...s, o: s.o.map((x) => -x), h: s.l.map((x) => -x), l: s.h.map((x) => -x), c: s.c.map((x) => -x) };
}

/** Aggregate to `tf`-minute bars. Stocks: buckets anchored at 09:30 inside each session; crypto: anchored at UTC midnight. */
export function aggregate(s: Series1m, tf: number): Bar[] {
  const out: Bar[] = [];
  let cur: { id: string; k0: number; k1: number; i0: number; i1: number; seg: number; o: number; h: number; l: number; c: number } | null = null;
  for (let i = 0; i < s.key.length; i++) {
    const k = s.key[i]!;
    const id = s.stock ? `${s.seg[i]}|${Math.floor((k - s.seg[i]! * 1440 - 570) / tf)}` : `${Math.floor(k / tf)}`;
    if (!cur || cur.id !== id) {
      if (cur) out.push(cur);
      const start = s.stock ? s.seg[i]! * 1440 + 570 + Math.floor((k - s.seg[i]! * 1440 - 570) / tf) * tf : Math.floor(k / tf) * tf;
      cur = { id, k0: start, k1: k, i0: i, i1: i, seg: s.seg[i]!, o: s.o[i]!, h: s.h[i]!, l: s.l[i]!, c: s.c[i]! };
    } else {
      cur.k1 = k; cur.i1 = i; cur.h = Math.max(cur.h, s.h[i]!); cur.l = Math.min(cur.l, s.l[i]!); cur.c = s.c[i]!;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** ATR(14) ending at bar i (simple mean of true ranges of bars i-13..i); NaN if fewer than 15 bars. */
export function atr14(b: readonly Bar[], i: number): number {
  if (i < 14) return NaN;
  let s = 0;
  for (let j = i - 13; j <= i; j++) { const p = b[j - 1]!.c; s += Math.max(b[j]!.h - b[j]!.l, Math.abs(b[j]!.h - p), Math.abs(b[j]!.l - p)); }
  return s / 14;
}

export interface Params { readonly bodyAtr: number; readonly gapAtr: number; readonly pivotWin: number; readonly bosWin: number; readonly entryWin: number; readonly stopAtEntryLow: boolean }
export const MAIN: Params = { bodyAtr: 1.0, gapAtr: 0.1, pivotWin: 30, bosWin: 30, entryWin: 50, stopAtEntryLow: false };

export interface Setup { readonly fvgBar: number; readonly top: number; readonly bot: number; readonly pivot: number; readonly bos: number; readonly entryIdx: number; readonly entry: number; readonly stop: number }

/** All long setups with an entry. `B` = structure bars, `E` = 15-minute bars of the same series. */
export function findSetups(B: readonly Bar[], E: readonly Bar[], p: Params = MAIN): Setup[] {
  const out: Setup[] = [];
  const firstAfter = (k: number) => { let lo = 0, hi = E.length; while (lo < hi) { const m = (lo + hi) >> 1; if (E[m]!.k0 <= k) lo = m + 1; else hi = m; } return lo; };
  for (let i = 2; i < B.length; i++) {
    const c1 = B[i - 2]!, c2 = B[i - 1]!, c3 = B[i]!;
    if (c1.seg !== c3.seg) continue; // stocks: the three bars must be in one session (crypto: seg is always 0)
    const atr = atr14(B, i - 2);
    if (!(atr > 0)) continue;
    if (!(c2.c - c2.o >= p.bodyAtr * atr)) continue;
    if (!(c3.l > c1.h) || c3.l - c1.h < p.gapAtr * atr) continue;
    const top = c3.l, bot = c1.h;
    // first swing high k >= i (2 bars each side), confirmed at k + 2; invalid on any close below the gap
    let k = -1, dead = false;
    for (let j = i; j <= Math.min(i + p.pivotWin, B.length - 3); j++) {
      if (j > i && B[j]!.c < bot) { dead = true; break; }
      const hj = B[j]!.h;
      if (hj > B[j - 1]!.h && hj > B[j - 2]!.h && hj > B[j + 1]!.h && hj > B[j + 2]!.h) { k = j; break; }
    }
    if (dead || k < 0) continue;
    if (B[k + 1]!.c < bot || B[k + 2]!.c < bot) continue;
    let bos = -1;
    for (let j = k + 3; j < Math.min(B.length, k + 3 + p.bosWin); j++) {
      if (B[j]!.c < bot) { dead = true; break; }
      if (B[j]!.c > B[k]!.h) { bos = j; break; }
    }
    if (dead || bos < 0) continue;
    const until = B[Math.min(B.length - 1, bos + p.entryWin)]!.k1;
    for (let x = firstAfter(B[bos]!.k1); x < E.length && E[x]!.k0 <= until; x++) { // 15-minute bars that start after the BoS bar ends
      const e = E[x]!;
      if (e.c < bot) break;
      if (e.l <= top && e.c > e.o && e.c > bot) {
        const stop = p.stopAtEntryLow ? Math.min(e.l, top) : bot;
        if (e.c - stop > 0) out.push({ fvgBar: i, top, bot, pivot: k, bos, entryIdx: e.i1, entry: e.c, stop });
        break;
      }
    }
  }
  return out;
}

export interface Trade { readonly entryIdx: number; readonly exitIdx: number; readonly entry: number; readonly exit: number; readonly R: number; readonly netR: number; readonly reason: "tp" | "stop" | "be" | "time"; readonly day: string }

/** Simulate one long trade on 1-minute bars after entryIdx: stop first in a bar, gap fills at the open, target exact, break even from the next minute after +1.5R. */
export function simulate(s: Series1m, entryIdx: number, entry: number, stop: number, cost: number, maxDays = 5): Trade {
  const R = entry - stop, tp = entry + 3 * R, beLevel = entry + 1.5 * R;
  let sl = stop, armed = false, exit = NaN, exitIdx = entryIdx, reason: Trade["reason"] = "time";
  const k0 = s.key[entryIdx]!, seg0 = s.seg[entryIdx]!;
  for (let i = entryIdx + 1; i < s.key.length; i++) {
    const over = s.stock ? s.seg[i]! - seg0 >= maxDays : s.key[i]! - k0 > maxDays * 1440;
    if (over) { exit = s.c[i - 1]!; exitIdx = i - 1; reason = "time"; break; }
    exitIdx = i;
    if (s.o[i]! <= sl) { exit = s.o[i]!; reason = armed && sl >= entry ? "be" : "stop"; break; }
    if (s.l[i]! <= sl) { exit = sl; reason = armed && sl >= entry ? "be" : "stop"; break; }
    if (s.h[i]! >= tp) { exit = tp; reason = "tp"; break; }
    if (!armed && s.h[i]! >= beLevel) { armed = true; sl = Math.max(sl, entry); }
  }
  if (!Number.isFinite(exit)) { exitIdx = s.key.length - 1; exit = s.c[exitIdx]!; reason = "time"; }
  const netR = (exit - entry - cost * (Math.abs(entry) + Math.abs(exit))) / R;
  return { entryIdx, exitIdx, entry, exit, R, netR, reason, day: s.day[entryIdx]! };
}

/** Setups -> trades, one open position at a time. */
export function trades(s: Series1m, setups: readonly Setup[], cost: number): Trade[] {
  const out: Trade[] = [];
  let busyUntil = -1;
  for (const st of [...setups].sort((a, b) => a.entryIdx - b.entryIdx)) {
    if (st.entryIdx <= busyUntil) continue;
    const t = simulate(s, st.entryIdx, st.entry, st.stop, cost);
    out.push(t);
    busyUntil = t.exitIdx;
  }
  return out;
}

/** Random entries: for each trade, a 15-minute bar close within ±90 days, same % stop distance and management. Mean net R per seed. */
export function randomMeans(s: Series1m, E: readonly Bar[], ts: readonly Trade[], cost: number, seeds = 100): number[] {
  const out: number[] = [];
  const keys = E.map((e) => e.k1);
  const lowerBound = (k: number) => { let lo = 0, hi = keys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (keys[m]! < k) lo = m + 1; else hi = m; } return lo; };
  for (let sd = 0; sd < seeds; sd++) {
    const rnd = mulberry32(31000 + sd);
    let sum = 0, n = 0;
    for (const t of ts) {
      const k = s.key[t.entryIdx]!;
      const a = lowerBound(k - 90 * 1440), b = lowerBound(k + 90 * 1440) - 1;
      if (b <= a) continue;
      const e = E[a + Math.floor(rnd() * (b - a + 1))]!;
      const entry = e.c, pct = t.R / Math.abs(t.entry);
      const r = simulate(s, e.i1, entry, entry - pct * Math.abs(entry), cost);
      sum += r.netR; n++;
    }
    out.push(n ? sum / n : NaN);
  }
  return out;
}
