// FFCC "Failed Auction Model" (experiments/ffcc-failed-auction-preregistration.md): developing volume profile from
// 09:30, failed push beyond VAH/VAL, displacement candle, entry at its close, stop beyond the extreme, target 1.5R.
import type { Session } from "../intraday/sessions.js";

export interface Candle { start: number; o: number; h: number; l: number; c: number; v: number }

/** Candles of `len` minutes from 09:30; each carries the index (exclusive) of the last minute bar it covers. */
export function candles(s: Session, len: number): (Candle & { end: number })[] {
  const out: (Candle & { end: number })[] = [];
  for (let i = 0; i < s.minute.length; i++) {
    const m = s.minute[i]!;
    if (m < 570 || m >= 960) continue;
    const start = 570 + Math.floor((m - 570) / len) * len, v = s.v?.[i] ?? 0, last = out[out.length - 1];
    if (last && last.start === start) { last.h = Math.max(last.h, s.h[i]!); last.l = Math.min(last.l, s.l[i]!); last.c = s.c[i]!; last.v += v; last.end = i + 1; }
    else out.push({ start, o: s.o[i]!, h: s.h[i]!, l: s.l[i]!, c: s.c[i]!, v, end: i + 1 });
  }
  return out;
}

/** Developing volume profile in $0.01 rows (integer cents), stored in an array around the first price. */
export class Profile {
  private vol: Float64Array = new Float64Array(0);
  private base = 0;
  private lo = Infinity;
  private hi = -Infinity;
  total = 0;
  add(lo: number, hi: number, v: number) {
    if (!(v > 0)) return;
    const a = Math.round(lo * 100), b = Math.round(hi * 100), n = b - a + 1;
    if (!this.vol.length) { this.base = a - 20000; this.vol = new Float64Array(40000 + n); }
    if (a - this.base < 0 || b - this.base >= this.vol.length) { // grow
      const nb = Math.min(this.base, a - 20000), ne = Math.max(this.base + this.vol.length, b + 20000), v2 = new Float64Array(ne - nb);
      v2.set(this.vol, this.base - nb); this.vol = v2; this.base = nb;
    }
    for (let r = a; r <= b; r++) this.vol[r - this.base]! += v / n;
    this.lo = Math.min(this.lo, a); this.hi = Math.max(this.hi, b);
    this.total += v;
  }
  /** POC, VAH, VAL in dollars (null if empty). */
  levels(share = 0.7): { poc: number; vah: number; val: number } | null {
    if (!this.total) return null;
    const get = (r: number) => this.vol[r - this.base]!;
    let poc = this.lo, best = -1;
    for (let r = this.lo; r <= this.hi; r++) { const v = get(r); if (v > best) { best = v; poc = r; } } // strict >: lowest price on a tie
    let a = poc, b = poc, inside = best;
    while (inside < share * this.total - 1e-9 && (a > this.lo || b < this.hi)) {
      const up = b < this.hi ? get(b + 1) : -1, dn = a > this.lo ? get(a - 1) : -1;
      if (up >= dn) { b++; inside += up; } else { a--; inside += dn; }
    }
    return { poc: poc / 100, vah: b / 100, val: a / 100 };
  }
}

export interface FTrade { date: string; dir: 1 | -1; entryMin: number; entry: number; stop: number; target: number; exit: number; exitMin: number; r: number }
export interface FOpts { len: number; target: "1.5R" | "POC"; stop: "extreme" | "candle"; cost: number; flip?: () => boolean }

/** All trades of one session. Shorts at the VAH and longs at the VAL are tracked independently; one open trade at a time. */
export function sessionTrades(s: Session, o: FOpts): FTrade[] {
  const cs = candles(s, o.len), prof = new Profile(), out: FTrade[] = [];
  // per side: push state
  const st = { short: { active: false, ext: 0, since: 0 }, long: { active: false, ext: 0, since: 0 } };
  let open: { dir: 1 | -1; entry: number; stop: number; target: number; k: number } | null = null;
  const bodies: number[] = [];
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k]!;
    const lv = prof.levels();
    // manage an open trade on this candle (entered at an earlier candle's close)
    if (open) {
      const { dir, stop, target } = open;
      let exit = NaN;
      if (c.start >= 955) exit = c.o;
      else if (dir === -1 ? c.h >= stop : c.l <= stop) exit = stop;
      else if (dir === -1 ? c.l <= target : c.h >= target) exit = target;
      if (!Number.isNaN(exit)) {
        const risk = Math.abs(open.entry - stop);
        out.push({ date: s.date, dir, entryMin: cs[open.k]!.start + o.len, entry: open.entry, stop, target, exit, exitMin: c.start, r: (dir * (exit - open.entry) - 2 * o.cost) / risk });
        open = null;
      }
    }
    const recent = bodies.slice(-20), avgBody = recent.length >= 6 ? recent.reduce((p, q) => p + q, 0) / recent.length : NaN; // up to 20 previous candles (at least 6)
    if (lv && c.start >= 600 && c.start + o.len <= 900) {
      // ---- short side at the VAH
      const S = st.short;
      if (c.h > lv.vah && (!S.active || c.h > S.ext)) { S.active = true; S.ext = c.h; S.since = k; }
      else if (S.active && k - S.since <= 6) {
        const prev = cs[k - 1]!;
        const disp = c.c < c.o && c.o - c.c >= 1.5 * avgBody && c.c < prev.l && c.c < lv.vah;
        if (disp && !open) {
          const entry = c.c, stop = o.stop === "extreme" ? S.ext + 0.01 : entry + (c.h - c.l);
          const target = o.target === "1.5R" ? entry - 1.5 * (stop - entry) : lv.poc;
          if (stop > entry && target < entry) open = { dir: -1, entry, stop, target, k };
          S.active = false;
        }
      } else if (S.active) S.active = false;
      // ---- long side at the VAL (mirror)
      const L = st.long;
      if (c.l < lv.val && (!L.active || c.l < L.ext)) { L.active = true; L.ext = c.l; L.since = k; }
      else if (L.active && k - L.since <= 6) {
        const prev = cs[k - 1]!;
        const disp = c.c > c.o && c.c - c.o >= 1.5 * avgBody && c.c > prev.h && c.c > lv.val;
        if (disp && !open) {
          const entry = c.c, stop = o.stop === "extreme" ? L.ext - 0.01 : entry - (c.h - c.l);
          const target = o.target === "1.5R" ? entry + 1.5 * (entry - stop) : lv.poc;
          if (stop < entry && target > entry) open = { dir: 1, entry, stop, target, k };
          L.active = false;
        }
      } else if (L.active) L.active = false;
    }
    // random direction: mirror stop and target around the entry
    if (open && open.k === k && o.flip && o.flip()) {
      const d: number = open.entry;
      open = { dir: (open.dir === 1 ? -1 : 1) as 1 | -1, entry: d, stop: 2 * d - open.stop, target: 2 * d - open.target, k };
    }
    bodies.push(Math.abs(c.c - c.o));
    for (let i = k ? cs[k - 1]!.end : 0; i < c.end; i++) prof.add(s.l[i]!, s.h[i]!, s.v?.[i] ?? 0);
  }
  if (open) { // session data ended before 15:55
    const last = cs[cs.length - 1]!, risk = Math.abs(open.entry - open.stop);
    out.push({ date: s.date, dir: open.dir, entryMin: cs[open.k]!.start + o.len, entry: open.entry, stop: open.stop, target: open.target, exit: last.c, exitMin: last.start, r: (open.dir * (last.c - open.entry) - 2 * o.cost) / risk });
  }
  return out;
}
