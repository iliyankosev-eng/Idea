// S/R + Fibonacci 0.618/0.786 + confirmation (experiments/fib-confluence-preregistration.md), on hourly bars.
// Longs are found on the bars as given; shorts on the mirrored bars (prices negated, high <-> low), which turns
// every rule into its mirror image (RSI -> 100 - RSI, MACD -> -MACD, pivot highs <-> pivot lows).

export interface Bars { readonly day: readonly string[]; readonly o: readonly number[]; readonly h: readonly number[]; readonly l: readonly number[]; readonly c: readonly number[] }
export interface Opts {
  readonly confirm: "rsi" | "none" | "macd";
  readonly stopMode: "L" | "f786";
  readonly holdBars: number;
  /** cost of one round trip in price units, given entry and exit (always >= 0) */
  readonly cost: (entry: number, exit: number) => number;
  /** random direction: called once per accepted trade; returns true to flip the direction */
  readonly flip?: () => boolean;
}
export interface Trade { readonly day: string; readonly dir: 1 | -1; readonly entryIdx: number; readonly exitIdx: number; readonly entry: number; readonly stop: number; readonly target: number; readonly exit: number; readonly r: number }

const K = 5, LOOK = 200, TOUCH_MAX = 50, ENTRY_MAX = 10;

export function atr(b: Bars, n = 14): number[] {
  const out = new Array<number>(b.c.length).fill(NaN);
  let a = NaN;
  for (let i = 0; i < b.c.length; i++) {
    const tr = i === 0 ? b.h[i]! - b.l[i]! : Math.max(b.h[i]! - b.l[i]!, Math.abs(b.h[i]! - b.c[i - 1]!), Math.abs(b.l[i]! - b.c[i - 1]!));
    if (i < n - 1) { a = Number.isNaN(a) ? tr : a + tr; continue; }
    if (i === n - 1) { a = (a + tr) / n; out[i] = a; continue; }
    a = (a * (n - 1) + tr) / n; out[i] = a;
  }
  return out;
}
export function rsi(c: readonly number[], n = 14): number[] {
  const out = new Array<number>(c.length).fill(NaN);
  let g = 0, d = 0;
  for (let i = 1; i < c.length; i++) {
    const ch = c[i]! - c[i - 1]!, up = Math.max(ch, 0), dn = Math.max(-ch, 0);
    if (i <= n) { g += up; d += dn; if (i === n) { g /= n; d /= n; out[i] = d === 0 ? 100 : 100 - 100 / (1 + g / d); } continue; }
    g = (g * (n - 1) + up) / n; d = (d * (n - 1) + dn) / n;
    out[i] = d === 0 ? 100 : 100 - 100 / (1 + g / d);
  }
  return out;
}
function ema(x: readonly number[], n: number): number[] {
  const a = 2 / (n + 1), out = new Array<number>(x.length);
  let e = x[0]!;
  for (let i = 0; i < x.length; i++) { e = i === 0 ? x[0]! : a * x[i]! + (1 - a) * e; out[i] = e; }
  return out;
}
/** MACD line minus signal line (12, 26, 9). */
export function macdHist(c: readonly number[]): number[] {
  const f = ema(c, 12), s = ema(c, 26), line = c.map((_, i) => f[i]! - s[i]!), sig = ema(line, 9);
  return line.map((x, i) => x - sig[i]!);
}

export function mirror(b: Bars): Bars { return { day: b.day, o: b.o.map((x) => -x), h: b.l.map((x) => -x), l: b.h.map((x) => -x), c: b.c.map((x) => -x) }; }

interface Cand { entryIdx: number; stop: number; target: number }

/** Long candidates: the first valid entry of each swing (independent of other trades). */
export function longCandidates(b: Bars, o: Opts): Cand[] {
  const n = b.c.length, A = atr(b), R = rsi(b.c), M = macdHist(b.c);
  const isHi = (i: number) => { for (let j = i - K; j <= i + K; j++) if (j !== i && !(b.h[i]! > b.h[j]!)) return false; return true; };
  const isLo = (i: number) => { for (let j = i - K; j <= i + K; j++) if (j !== i && !(b.l[i]! < b.l[j]!)) return false; return true; };
  const pivots: { i: number; p: number; hi: boolean }[] = []; // confirmed, in order of i
  const out: Cand[] = [];
  for (let t = 2 * K; t < n; t++) {
    const i = t - K; // the bar confirmed at the close of t
    const lo = isLo(i), hi = isHi(i);
    if (lo) pivots.push({ i, p: b.l[i]!, hi: false });
    if (hi) pivots.push({ i, p: b.h[i]!, hi: true });
    if (!hi || !(A[t]! > 0)) continue;
    // swing: the last confirmed low before H, H the highest high from L to H
    let L: { i: number; p: number } | null = null;
    for (let k = pivots.length - 1; k >= 0; k--) { const q = pivots[k]!; if (!q.hi && q.i < i) { L = q; break; } }
    if (!L) continue;
    const H = b.h[i]!;
    let ok = true;
    for (let j = L.i; j <= i; j++) if (b.h[j]! > H) { ok = false; break; }
    for (let j = L.i; j <= t && ok; j++) if (b.l[j]! < L.p) ok = false; // L must be the low of the swing and unbroken until now
    if (!ok || H - L.p < 2 * A[t]!) continue;
    const span = H - L.p, f618 = H - 0.618 * span, f786 = H - 0.786 * span;
    // confluence with an older pivot (before L, within the last 200 bars)
    let conf = false;
    for (const q of pivots) if (q.i < L.i && q.i >= t - LOOK && (Math.abs(q.p - f618) <= 0.5 * A[t]! || Math.abs(q.p - f786) <= 0.5 * A[t]!)) { conf = true; break; }
    if (!conf) continue;
    // touch
    let u0 = -1;
    for (let u = t + 1; u < n && u <= t + TOUCH_MAX; u++) {
      if (b.l[u]! < L.p) break;
      if (b.l[u]! <= f618) { u0 = u; break; }
      if (b.h[u]! > H) break;
    }
    if (u0 < 0) continue;
    // confirmation + entry bar
    let rsiOk = false;
    for (let e = u0; e < n - 1 && e <= u0 + ENTRY_MAX; e++) {
      if (b.l[e]! < L.p) break;
      if (R[e]! <= 35) rsiOk = true;
      const green = b.c[e]! > b.o[e]! && b.c[e]! > f786;
      const confirmed = o.confirm === "none" ? true : o.confirm === "rsi" ? rsiOk : M[e]! > 0;
      if (green && confirmed) {
        const stop = o.stopMode === "L" ? L.p - 0.1 * A[e]! : f786 - 0.25 * A[e]!;
        const target = H - 0.1 * A[e]!;
        const entry = b.o[e + 1]!;
        if (entry > stop && entry < target) out.push({ entryIdx: e + 1, stop, target });
        break;
      }
    }
  }
  return out;
}

/** Long trade from bar k at its open; exit on stop/target (stop first if both), gaps at the open, else time exit. */
export function simLong(b: Bars, k: number, stop: number, target: number, hold: number): { exit: number; exitIdx: number } {
  const last = Math.min(b.c.length - 1, k + hold - 1);
  for (let j = k; j <= last; j++) {
    if (j > k && b.o[j]! <= stop) return { exit: b.o[j]!, exitIdx: j };
    if (j > k && b.o[j]! >= target) return { exit: b.o[j]!, exitIdx: j };
    if (b.l[j]! <= stop) return { exit: stop, exitIdx: j };
    if (b.h[j]! >= target) return { exit: target, exitIdx: j };
  }
  return { exit: b.c[last]!, exitIdx: last };
}

/** All trades: long and short candidates merged by entry time, one open trade at a time. */
export function fibTrades(b: Bars, o: Opts): Trade[] {
  const m = mirror(b);
  const cands = [
    ...longCandidates(b, o).map((x) => ({ ...x, dir: 1 as const })),
    ...longCandidates(m, o).map((x) => ({ ...x, dir: -1 as const })),
  ].sort((x, y) => x.entryIdx - y.entryIdx || x.dir - y.dir);
  const out: Trade[] = [];
  let busyUntil = -1;
  for (const x of cands) {
    if (x.entryIdx <= busyUntil) continue;
    // candidate in its own (possibly mirrored) frame: entry e, stop s, target g with s < e < g
    const own = x.dir === 1 ? b : m;
    const e = own.o[x.entryIdx]!, riskD = e - x.stop, rewD = x.target - e;
    const dir: 1 | -1 = o.flip && o.flip() ? (x.dir === 1 ? -1 : 1) : x.dir;
    const fr = dir === 1 ? b : m; // frame of the traded direction
    const fe = fr.o[x.entryIdx]!;
    const s = simLong(fr, x.entryIdx, fe - riskD, fe + rewD, o.holdBars);
    const entry = dir * fe, exit = dir * s.exit, stop = dir * (fe - riskD), target = dir * (fe + rewD);
    const r = (dir * (exit - entry) - o.cost(entry, exit)) / riskD;
    out.push({ day: b.day[x.entryIdx]!, dir, entryIdx: x.entryIdx, exitIdx: s.exitIdx, entry, stop, target, exit, r });
    busyUntil = s.exitIdx;
  }
  return out;
}
