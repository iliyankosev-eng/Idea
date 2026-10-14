// "First candle rule": 5-minute opening range, 1-minute FVG through the range, retest, engulfing, 1:3.
// Rules: experiments/first-candle-preregistration.md.

/** One session day of 1-minute bars; m = local minute of day (e.g. 570 = 09:30), sorted ascending. */
export interface DayBars {
  readonly date: string;
  readonly m: readonly number[];
  readonly o: readonly number[];
  readonly h: readonly number[];
  readonly l: readonly number[];
  readonly c: readonly number[];
  /** ask close minus bid close per bar (Dukascopy); undefined for exchange data */
  readonly spread?: readonly (number | undefined)[];
}

export interface SessionSpec {
  /** first minute of the 5-minute range (570 = 09:30) */
  readonly orStart: number;
  /** the entry bar must start before this minute */
  readonly lastEntry: number;
  /** time exit at the close of the last bar with m <= exitMin */
  readonly exitMin: number;
}

export interface Trade {
  readonly date: string;
  readonly dir: 1 | -1;
  readonly entryIdx: number;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
  readonly exit: number;
  readonly exitIdx: number;
  /** gross result in R */
  readonly r: number;
  /** the engulfing bar (for the spread) */
  readonly engulfIdx: number;
  readonly fvgIdx: number;
  readonly retestIdx: number;
}

interface P { o: number[]; h: number[]; l: number[]; c: number[] }

/** Long setup on price arrays p (shorts: the same function on the mirrored arrays). Returns the first valid entry or null. */
function findLong(m: readonly number[], p: P, i0: number, last: number, H: number, spec: SessionSpec) {
  const { o, h, l, c } = p;
  let i = i0 + 6; // a = i-2 can be the last range bar (i0+4); b and c are after the range
  while (i <= last) {
    if (m[i]! >= spec.lastEntry) return null;
    const a = i - 2, b = i - 1;
    if (l[i]! > h[a]! && c[b]! > H && l[i]! > H) {
      const top = l[i]!, bot = h[a]!;
      let r = i + 1;
      while (r <= last && l[r]! > top) r++; // bars before the retest cannot close below the gap: their lows are above it
      if (r > last) return null;
      let next = Math.min(r + 15, last) + 1; // where to look for the next FVG if this one fails
      for (let e = r; e <= Math.min(r + 15, last); e++) {
        if (c[e]! < bot) { next = e + 1; break; } // gap fully filled: setup cancelled
        const green = c[e]! > o[e]!, prevRed = c[e - 1]! < o[e - 1]!;
        if (green && prevRed && o[e]! <= c[e - 1]! && c[e]! >= o[e - 1]!) {
          const k = e + 1;
          if (k > last || m[k]! >= spec.lastEntry) return null;
          let stop = Infinity;
          for (let j = r; j <= e; j++) stop = Math.min(stop, l[j]!);
          const entry = o[k]!, risk = entry - stop;
          if (!(risk > 0)) { next = e + 1; break; }
          return { fvgIdx: i, retestIdx: r, engulfIdx: e, entryIdx: k, entry, stop, target: entry + 3 * risk };
        }
      }
      i = Math.max(next, i + 1) + 2; // the next FVG's c bar must come after `next` (its a bar at `next` or later)
      continue;
    }
    i++;
  }
  return null;
}

function simulate(p: P, k: number, last: number, entry: number, stop: number, target: number) {
  for (let j = k; j <= last; j++) {
    if (j > k && p.o[j]! <= stop) return { exit: p.o[j]!, idx: j };
    if (p.l[j]! <= stop) return { exit: stop, idx: j };
    if (p.h[j]! >= target) return { exit: target, idx: j };
  }
  return { exit: p.c[last]!, idx: last };
}

/** The day's trade (earliest entry of long and short), or null. Short prices are reported in normal (not mirrored) terms. */
export function firstCandleTrade(d: DayBars, spec: SessionSpec): Trade | null {
  const i0 = d.m.indexOf(spec.orStart);
  if (i0 < 0 || i0 + 4 >= d.m.length) return null;
  for (let k = 1; k < 5; k++) if (d.m[i0 + k] !== spec.orStart + k) return null;
  let last = -1;
  for (let j = 0; j < d.m.length; j++) if (d.m[j]! <= spec.exitMin) last = j;
  if (last < i0 + 7) return null;
  const H = Math.max(...d.h.slice(i0, i0 + 5)), L = Math.min(...d.l.slice(i0, i0 + 5));
  const up: P = { o: [...d.o], h: [...d.h], l: [...d.l], c: [...d.c] };
  const dn: P = { o: d.o.map((x) => -x), h: d.l.map((x) => -x), l: d.h.map((x) => -x), c: d.c.map((x) => -x) };
  const sL = findLong(d.m, up, i0, last, H, spec), sS = findLong(d.m, dn, i0, last, -L, spec);
  const pick = sL && (!sS || sL.entryIdx <= sS.entryIdx) ? { s: sL, dir: 1 as const, p: up } : sS ? { s: sS, dir: -1 as const, p: dn } : null;
  if (!pick) return null;
  const { s, dir, p } = pick;
  const x = simulate(p, s.entryIdx, last, s.entry, s.stop, s.target);
  return { date: d.date, dir, entryIdx: s.entryIdx, entry: dir * s.entry, stop: dir * s.stop, target: dir * s.target, exit: dir * x.exit, exitIdx: x.idx,
    r: (x.exit - s.entry) / (s.entry - s.stop), engulfIdx: s.engulfIdx, fvgIdx: s.fvgIdx, retestIdx: s.retestIdx };
}

/** Same entry bar and stop distance, but a given direction (random-direction baseline). Result in R. */
export function tradeWithDirection(d: DayBars, spec: SessionSpec, t: Trade, dir: 1 | -1): number {
  let last = -1;
  for (let j = 0; j < d.m.length; j++) if (d.m[j]! <= spec.exitMin) last = j;
  const risk = Math.abs(t.entry - t.stop);
  const p: P = dir === 1 ? { o: [...d.o], h: [...d.h], l: [...d.l], c: [...d.c] } : { o: d.o.map((x) => -x), h: d.l.map((x) => -x), l: d.h.map((x) => -x), c: d.c.map((x) => -x) };
  const e = dir * t.entry;
  const x = simulate(p, t.entryIdx, last, e, e - risk, e + 3 * risk);
  return (x.exit - e) / risk;
}

/** Cost of one round trip in R. Dukascopy: one spread (ask - bid at the engulfing bar; day median if missing) + 0.001% of the price per side. Exchange: per-share cost per side. */
export function costR(d: DayBars, t: Trade, perShare?: number): number {
  const risk = Math.abs(t.entry - t.stop);
  if (perShare !== undefined) return (2 * perShare) / risk;
  let sp = d.spread?.[t.engulfIdx];
  if (sp === undefined || !(sp >= 0)) {
    const all = (d.spread ?? []).filter((x): x is number => x !== undefined && x >= 0).sort((a, b) => a - b);
    sp = all.length ? all[Math.floor(all.length / 2)]! : 0;
  }
  return (sp + 2 * 0.00001 * Math.abs(t.entry)) / risk;
}
