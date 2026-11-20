// Investclub test (experiments/investclub-preregistration.md): Weinstein Stage 2 breakout (S1, weekly) and
// Kullamägi breakout (S2, daily) on all liquid US stocks, as portfolios with daily mark-to-market.

export interface Stock {
  readonly sym: string;
  readonly g: Int32Array; // global day index of each bar
  readonly o: Float64Array; readonly h: Float64Array; readonly l: Float64Array; readonly c: Float64Array; readonly v: Float64Array;
}
export interface Market {
  readonly days: readonly string[]; // global calendar (SPY days)
  readonly spy: Float64Array; // SPY close per global day
  readonly stocks: readonly Stock[];
  readonly at: readonly Int32Array[]; // at[s][global day] = local bar index or -1
}

export function buildMarket(days: readonly string[], spy: readonly number[], raw: readonly { sym: string; d: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }[]): Market {
  const di = new Map(days.map((d, i) => [d, i]));
  const stocks: Stock[] = [], at: Int32Array[] = [];
  for (const r of raw) {
    const keep: number[] = [];
    for (let i = 0; i < r.d.length; i++) if (di.has(r.d[i]!) && r.c[i]! > 0 && r.l[i]! > 0) keep.push(i);
    if (keep.length < 2) continue;
    const pick = (a: number[]) => Float64Array.from(keep.map((i) => a[i]!));
    const s: Stock = { sym: r.sym, g: Int32Array.from(keep.map((i) => di.get(r.d[i]!)!)), o: pick(r.o), h: pick(r.h), l: pick(r.l), c: pick(r.c), v: pick(r.v) };
    const m = new Int32Array(days.length).fill(-1);
    s.g.forEach((gd, k) => { m[gd] = k; });
    stocks.push(s); at.push(m);
  }
  return { days, spy: Float64Array.from(spy), stocks, at };
}

/** trailing simple moving average over the stock's own bars (NaN until n bars) */
export function sma(x: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(x.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i]!; if (i >= n) s -= x[i - n]!; if (i >= n - 1) out[i] = s / n; }
  return out;
}
/** 50-day average dollar volume per bar */
export function dvol50(s: Stock): Float64Array { return sma(Array.from(s.c, (c, i) => c * s.v[i]!), 50); }

// ---------------------------------------------------------------- portfolio engine
export interface Trade { sym: string; entryDay: number; exitDay: number; entry: number; exit: number; ret: number }
export interface Result { equity: Float64Array; trades: Trade[]; held?: number }
interface Pos { s: number; shares: number; entry: number; entryDay: number; stop: number; cost: number; day3done: boolean; proceeds: number }

/** Last known close of stock s at or before global day d (NaN if none). */
function lastClose(m: Market, s: number, d: number): number {
  const i = m.at[s]![d]!;
  if (i >= 0) return m.stocks[s]!.c[i]!;
  const g = m.stocks[s]!.g; // binary search: last bar on or before d (a halt can last for months)
  let lo = 0, hi = g.length - 1, k = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (g[mid]! <= d) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  return k >= 0 ? m.stocks[s]!.c[k]! : NaN;
}
/** true if global day d is after the stock's last bar */
const ended = (m: Market, s: number, d: number) => { const st = m.stocks[s]!; return st.g[st.g.length - 1]! < d; };

// ---------------------------------------------------------------- S1 Weinstein
export interface Weekly { wk: Int32Array; endDay: Int32Array; c: Float64Array; h: Float64Array; v: Float64Array }
/** Calendar weeks: global week id per day (Monday-based), and the last global day of each week. */
export function weeks(days: readonly string[]): { id: Int32Array; last: number[] } {
  const id = new Int32Array(days.length), last: number[] = [];
  let w = -1, prev = "";
  for (let i = 0; i < days.length; i++) {
    const t = new Date(days[i]! + "T00:00:00Z"), dow = (t.getUTCDay() + 6) % 7;
    const monday = new Date(t.getTime() - dow * 86400e3).toISOString().slice(0, 10);
    if (monday !== prev) { w++; prev = monday; last.push(i); }
    id[i] = w; last[w] = i;
  }
  return { id, last };
}
export function weeklyBars(s: Stock, wid: Int32Array): Weekly {
  const wk: number[] = [], end: number[] = [], c: number[] = [], h: number[] = [], v: number[] = [];
  for (let i = 0; i < s.g.length; i++) {
    const w = wid[s.g[i]!]!;
    if (wk.length && wk[wk.length - 1] === w) { const j = wk.length - 1; end[j] = s.g[i]!; c[j] = s.c[i]!; h[j] = Math.max(h[j]!, s.h[i]!); v[j] = v[j]! + s.v[i]!; }
    else { wk.push(w); end.push(s.g[i]!); c.push(s.c[i]!); h.push(s.h[i]!); v.push(s.v[i]!); }
  }
  return { wk: Int32Array.from(wk), endDay: Int32Array.from(end), c: Float64Array.from(c), h: Float64Array.from(h), v: Float64Array.from(v) };
}
export interface S1Sig { s: number; w: number; mrs: number }
/** S1 signals per global week. Also returns, per week, the stocks with close > MA30 (random-control pool) and the exit flags. */
export function s1Prepare(m: Market, liqMin = 20e6) {
  const W = weeks(m.days), nW = W.last.length;
  const spyW = W.last.map((d) => m.spy[d]!), spyMa = sma(spyW, 30);
  const sigs: S1Sig[][] = Array.from({ length: nW }, () => []), pool: number[][] = Array.from({ length: nW }, () => []);
  const below: Map<number, Set<number>> = new Map(); // week -> stocks whose weekly close < MA30
  m.stocks.forEach((st, s) => {
    const wb = weeklyBars(st, W.id), ma = sma(wb.c, 30), dv = dvol50(st);
    const rs = Array.from(wb.c, (c, k) => c / spyW[wb.wk[k]!]!), rsMa = sma(rs, 52), vMa = sma(wb.v, 10);
    for (let k = 0; k < wb.c.length; k++) {
      const w = wb.wk[k]!;
      if (W.last[w] !== wb.endDay[k]) continue; // the stock did not trade on the week's last day: no decision that week
      if (wb.c[k]! < ma[k]!) { if (!below.has(w)) below.set(w, new Set()); below.get(w)!.add(s); }
      const li = m.at[s]![wb.endDay[k]!]!;
      if (!(dv[li]! >= liqMin) || k < 52) continue;
      if (wb.c[k]! > ma[k]!) pool[w]!.push(s);
      // base top = highest weekly high of the 26 weeks before w; "fresh": last week did not close above ITS base top
      let hi = -Infinity, hiPrev = -Infinity;
      for (let j = k - 26; j < k; j++) hi = Math.max(hi, wb.h[j]!);
      for (let j = k - 27; j < k - 1; j++) hiPrev = Math.max(hiPrev, wb.h[j]!);
      const mrs = rs[k]! / rsMa[k]! - 1;
      if (wb.c[k]! > ma[k]! && ma[k]! > ma[k - 1]! && wb.c[k]! > hi && wb.c[k - 1]! <= hiPrev && wb.v[k]! >= 2 * vMa[k - 1]! && mrs > 0 && spyW[w]! > spyMa[w]!) sigs[w]!.push({ s, w, mrs });
    }
  });
  for (const a of sigs) a.sort((x, y) => y.mrs - x.mrs);
  return { W, sigs, pool, below };
}

export function runS1(m: Market, P: ReturnType<typeof s1Prepare>, cost: number, start: number, pick?: (w: number, n: number) => number[]): Result {
  const { W } = P, nD = m.days.length, eq = new Float64Array(nD).fill(NaN), trades: Trade[] = [];
  let cash = 1, held = 0;
  const pos: Pos[] = [], pendingExit = new Set<Pos>();
  let pendingEntry: number[] = [];
  const sell = (p: Pos, px: number, d: number) => { cash += p.shares * px * (1 - cost); trades.push({ sym: m.stocks[p.s]!.sym, entryDay: p.entryDay, exitDay: d, entry: p.entry, exit: px, ret: (p.shares * px * (1 - cost)) / p.cost - 1 }); pos.splice(pos.indexOf(p), 1); pendingExit.delete(p); };
  for (let d = start; d < nD; d++) {
    const prevEq = d > start ? eq[d - 1]! : 1;
    // 1) exits decided last week end, at today's open (if the stock trades today)
    for (const p of [...pendingExit]) { const i = m.at[p.s]![d]!; if (i >= 0) sell(p, m.stocks[p.s]!.o[i]!, d); }
    // 2) entries at today's open
    for (const s of pendingEntry) {
      if (pos.length >= 20 || pos.some((p) => p.s === s)) continue;
      const i = m.at[s]![d]!;
      if (i < 0) continue;
      const px = m.stocks[s]!.o[i]!, val = Math.min(0.05 * prevEq, cash);
      if (val < 0.005 * prevEq) continue;
      const shares = val / (px * (1 + cost));
      cash -= val;
      pos.push({ s, shares, entry: px, entryDay: d, stop: 0, cost: val, day3done: false, proceeds: 0 });
    }
    pendingEntry = [];
    // 3) delisted while held: out at the last close
    for (const p of [...pos]) if (ended(m, p.s, d)) sell(p, lastClose(m, p.s, d), d);
    // 4) mark to market
    let v = cash;
    for (const p of pos) v += p.shares * lastClose(m, p.s, d);
    eq[d] = v; held += pos.length;
    // 5) week end: decide exits and entries for the next day
    const w = W.id[d]!;
    if (W.last[w] === d) {
      const bl = P.below.get(w);
      for (const p of pos) if (bl?.has(p.s)) pendingExit.add(p);
      const real = P.sigs[w]!.map((x) => x.s);
      pendingEntry = pick ? (real.length ? pick(w, real.length) : []) : real;
    }
  }
  return { equity: eq, trades, held: held / (nD - start) };
}

// ---------------------------------------------------------------- S2 Kullamägi
export interface S2Prep { sig: { s: number; level: number; adr: number; r63: number }[][]; pool: { s: number; adr: number; r63: number }[][]; sma10: Float64Array[] }
export function s2Prepare(m: Market, liqMin = 20e6): S2Prep {
  const nD = m.days.length;
  const cand: { s: number; r63: number; adr: number; ok: boolean; level: number }[][] = Array.from({ length: nD }, () => []);
  const allR: number[][] = Array.from({ length: nD }, () => []); // R63 of every liquid stock (for the top-3% cut)
  const sma10s: Float64Array[] = [];
  m.stocks.forEach((st, s) => {
    const n = st.c.length, dv = dvol50(st), s10 = sma(st.c, 10), s20 = sma(st.c, 20), adr = sma(Array.from(st.h, (h, i) => h / st.l[i]! - 1), 20);
    sma10s.push(s10);
    for (let i = 63; i < n; i++) {
      if (!(dv[i]! >= liqMin)) continue;
      const r63 = st.c[i]! / st.c[i - 63]! - 1;
      allR[st.g[i]!]!.push(r63);
      if (!(r63 >= 0.3 && adr[i]! >= 0.04)) continue; // cannot be in the pool or a signal
      let hi = -Infinity, lo = Infinity;
      for (let j = i - 9; j <= i; j++) { hi = Math.max(hi, st.h[j]!); lo = Math.min(lo, st.l[j]!); }
      const ok = adr[i]! >= 0.04 && r63 >= 0.3 && st.c[i]! > s10[i]! && s10[i]! > s20[i]! && (hi - lo) / st.c[i]! <= 3 * adr[i]!;
      cand[st.g[i]!]!.push({ s, r63, adr: adr[i]!, ok, level: hi });
    }
  });
  const sig: S2Prep["sig"] = [], pool: S2Prep["pool"] = [];
  for (let d = 0; d < nD; d++) {
    const a = cand[d]!;
    if (!a.length) { sig.push([]); pool.push([]); continue; }
    const r = allR[d]!.sort((x, y) => x - y), thr = r[Math.min(r.length - 1, Math.floor(0.97 * r.length))]!;
    const top = a.filter((x) => x.r63 >= thr && x.r63 >= 0.3 && x.adr >= 0.04);
    pool.push(top.map((x) => ({ s: x.s, adr: x.adr, r63: x.r63 })));
    sig.push(top.filter((x) => x.ok).sort((x, y) => y.r63 - x.r63).map((x) => ({ s: x.s, level: x.level, adr: x.adr, r63: x.r63 })));
  }
  return { sig, pool, sma10: sma10s };
}

/** pick: random control - returns stocks to enter at the next open (no breakout condition). */
/** entryDayStop = false: optimistic bound - the entry day's low is assumed to have come before the entry (no stop that day). */
export function runS2(m: Market, P: S2Prep, cost: number, start: number, pick?: (d: number, n: number) => { s: number; adr: number }[], entryDayStop = true): Result {
  const nD = m.days.length, eq = new Float64Array(nD).fill(NaN), trades: Trade[] = [];
  let cash = 1, held = 0;
  const pos: (Pos & { sharesNow: number })[] = [];
  const close = (p: (typeof pos)[number], px: number, d: number, frac: number) => {
    const sh = p.sharesNow * frac;
    cash += sh * px * (1 - cost); p.proceeds += sh * px * (1 - cost); p.sharesNow -= sh;
    if (p.sharesNow <= 1e-12) { trades.push({ sym: m.stocks[p.s]!.sym, entryDay: p.entryDay, exitDay: d, entry: p.entry, exit: px, ret: p.proceeds / p.cost - 1 }); pos.splice(pos.indexOf(p), 1); }
  };
  let pending: { s: number; level: number; adr: number }[] = [];
  for (let d = start; d < nD; d++) {
    const prevEq = d > start ? eq[d - 1]! : 1;
    // held positions (entered before today)
    for (const p of [...pos]) {
      if (ended(m, p.s, d)) { close(p, lastClose(m, p.s, d), d, 1); continue; }
      const i = m.at[p.s]![d]!;
      if (i < 0) continue;
      const st = m.stocks[p.s]!;
      if (st.o[i]! <= p.stop) { close(p, st.o[i]!, d, 1); continue; }
      if (st.l[i]! <= p.stop) { close(p, p.stop, d, 1); continue; }
      const age = i - m.at[p.s]![p.entryDay]!; // trading days since entry
      if (age >= 3 && !p.day3done) {
        p.day3done = true;
        if (st.c[i]! > p.entry) { close(p, st.c[i]!, d, 0.5); p.stop = p.entry; }
      }
      if (age >= 3 && pos.includes(p) && st.c[i]! < P.sma10[p.s]![i]!) close(p, st.c[i]!, d, 1);
    }
    // entries today
    let invested = 0;
    for (const p of pos) invested += p.sharesNow * lastClose(m, p.s, d - 1);
    for (const x of pending) {
      if (pos.some((p) => p.s === x.s)) continue;
      const i = m.at[x.s]![d]!;
      if (i < 0) continue;
      const st = m.stocks[x.s]!;
      let entry: number;
      if (Number.isNaN(x.level)) entry = st.o[i]!; // random control: at the open
      else { if (!(st.h[i]! > x.level)) continue; entry = Math.max(st.o[i]!, x.level); }
      const stop = entry * (1 - x.adr), risk = entry - stop;
      let val = Math.min((0.005 * prevEq / risk) * entry, 0.2 * prevEq, prevEq - invested, cash);
      if (val < 0.005 * prevEq) continue;
      const shares = val / (entry * (1 + cost));
      cash -= val; invested += val;
      const p = { s: x.s, shares, sharesNow: shares, entry, entryDay: d, stop, cost: val, day3done: false, proceeds: 0 };
      pos.push(p);
      if ((entryDayStop || Number.isNaN(x.level)) && st.l[i]! <= stop) close(p, stop, d, 1); // conservative: the low may have come after the entry (exact for open entries)
    }
    pending = [];
    let v = cash;
    for (const p of pos) v += p.sharesNow * lastClose(m, p.s, d);
    eq[d] = v; held += pos.length;
    const real = P.sig[d]!;
    pending = pick ? (real.length ? pick(d, real.length).map((x) => ({ s: x.s, level: NaN, adr: x.adr })) : []) : real;
  }
  return { equity: eq, trades, held: held / (nD - start) };
}

// ---------------------------------------------------------------- measures
export function perfOf(eq: ArrayLike<number>, from: number, to: number) {
  const r: number[] = [];
  for (let d = from + 1; d <= to; d++) if (Number.isFinite(eq[d]!) && Number.isFinite(eq[d - 1]!)) r.push(eq[d]! / eq[d - 1]! - 1);
  const mean = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1));
  let peak = -Infinity, dd = 0;
  for (let d = from; d <= to; d++) { const x = eq[d]!; if (!Number.isFinite(x)) continue; peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); }
  const years = r.length / 252, total = eq[to]! / eq[from]!;
  return { cagr: total ** (1 / years) - 1, sharpe: (mean / sd) * Math.sqrt(252), maxDD: dd, rets: r };
}

/** Splits a symbol's history where the close jumps more than `k`x up or down in one day (unadjusted reverse splits,
 * spin-offs, a ticker reused by another company): each piece becomes its own "stock"; a position held across the
 * break leaves at the last close before it, as if the stock were delisted. */
export function splitAtJumps<T extends { sym: string; d: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }>(r: T, k = 5): T[] {
  const cuts = [0];
  for (let i = 1; i < r.c.length; i++) { const q = r.c[i]! / r.c[i - 1]!; if (q > k || q < 1 / k) cuts.push(i); }
  cuts.push(r.c.length);
  if (cuts.length === 2) return [r];
  const out: T[] = [];
  for (let j = 0; j + 1 < cuts.length; j++) { const a = cuts[j]!, b = cuts[j + 1]!; out.push({ ...r, sym: j ? `${r.sym}#${j}` : r.sym, d: r.d.slice(a, b), o: r.o.slice(a, b), h: r.h.slice(a, b), l: r.l.slice(a, b), c: r.c.slice(a, b), v: r.v.slice(a, b) }); }
  return out;
}
