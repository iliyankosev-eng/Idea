// Asia session 15-minute ORB with a volume-confirmed break and a retest (experiments/asia-orb-preregistration.md).

/** One session of 1-minute bars; m = minutes since the session start (0 = 18:00 New York), ascending. */
export interface AsiaDay {
  readonly date: string;
  readonly m: readonly number[];
  readonly o: readonly number[];
  readonly h: readonly number[];
  readonly l: readonly number[];
  readonly c: readonly number[];
  readonly v: readonly number[];
}
export interface AsiaOpts {
  readonly volMult: number; // 1.5 main, 0 = no volume condition
  readonly lastEntry: number; // minutes after the session start (120 = 20:00)
  readonly hold: number; // 120 minutes
  readonly targetR?: number; // optional fixed target (descriptive)
}
export const ASIA_MAIN: AsiaOpts = { volMult: 1.5, lastEntry: 120, hold: 120 };
export interface AsiaTrade { readonly date: string; readonly dir: 1 | -1; readonly breakIdx: number; readonly retestIdx: number; readonly entryIdx: number; readonly entry: number; readonly stop: number; readonly exit: number; readonly exitIdx: number; readonly r: number }

/** Exit simulation in "long space" (prices of a short are negated): stop, optional target, else the close of the last bar within `hold` minutes. */
function sim(m: readonly number[], o: number[], h: number[], l: number[], c: number[], k: number, entry: number, stop: number, hold: number, target?: number) {
  let last = k;
  for (let j = k; j < m.length && m[j]! < m[k]! + hold; j++) last = j;
  for (let j = k; j <= last; j++) {
    if (j > k && o[j]! <= stop) return { exit: o[j]!, idx: j };
    if (l[j]! <= stop) return { exit: stop, idx: j };
    if (target !== undefined && h[j]! >= target) return { exit: target, idx: j };
  }
  return { exit: c[last]!, idx: last };
}

export function asiaTrade(d: AsiaDay, opt: AsiaOpts = ASIA_MAIN): AsiaTrade | null {
  for (let k = 0; k < 15; k++) if (d.m[k] !== k) return null;
  const H = Math.max(...d.h.slice(0, 15)), L = Math.min(...d.l.slice(0, 15)), R = H - L, M = (H + L) / 2;
  const vAvg = d.v.slice(0, 15).reduce((a, b) => a + b, 0) / 15;
  let b = -1, dir: 1 | -1 = 1;
  for (let i = 15; i < d.m.length && d.m[i]! < opt.lastEntry; i++) {
    const volOk = d.v[i]! >= opt.volMult * vAvg;
    if (d.c[i]! > H && volOk) { b = i; dir = 1; break; }
    if (d.c[i]! < L && volOk) { b = i; dir = -1; break; }
  }
  if (b < 0) return null;
  // long space
  const o = d.o.map((x) => dir * x), c = d.c.map((x) => dir * x);
  const h = dir === 1 ? [...d.h] : d.l.map((x) => -x), l = dir === 1 ? [...d.l] : d.h.map((x) => -x);
  const lvl = dir === 1 ? H : -L, mid = dir * M;
  for (let r = b + 1; r < d.m.length; r++) {
    const touched = l[r]! <= lvl + 0.25 * R;
    if (c[r]! < lvl) return null; // closed back inside the range (on the retest bar or before it)
    if (!touched) continue;
    const k = r + 1;
    if (k >= d.m.length || d.m[k]! >= opt.lastEntry) return null;
    const entry = o[k]!, risk = entry - mid;
    if (!(risk > 0)) return null;
    const x = sim(d.m, o, h, l, c, k, entry, mid, opt.hold, opt.targetR === undefined ? undefined : entry + opt.targetR * risk);
    return { date: d.date, dir, breakIdx: b, retestIdx: r, entryIdx: k, entry: dir * entry, stop: dir * mid, exit: dir * x.exit, exitIdx: x.idx, r: (x.exit - entry) / risk };
  }
  return null;
}

/** Same entry, stop distance and exit rule with a given direction (random-direction baseline). */
export function asiaWithDirection(d: AsiaDay, t: AsiaTrade, dir: 1 | -1, opt: AsiaOpts = ASIA_MAIN): number {
  const o = d.o.map((x) => dir * x), c = d.c.map((x) => dir * x);
  const h = dir === 1 ? [...d.h] : d.l.map((x) => -x), l = dir === 1 ? [...d.l] : d.h.map((x) => -x);
  const risk = Math.abs(t.entry - t.stop), e = dir * t.entry;
  const x = sim(d.m, o, h, l, c, t.entryIdx, e, e - risk, opt.hold, opt.targetR === undefined ? undefined : e + opt.targetR * risk);
  return (x.exit - e) / risk;
}
