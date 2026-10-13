// N — same-day weather rules (experiments/weather-sameday-preregistration.md).
import { mulberry32 } from "../evaluate.js";
import { phi, priceAt, ret, type Pt } from "./common.js";
import { eventDay, icaoOf, localToUtc, parseBucket, type Bucket, type WEvent } from "./weather.js";

export interface Fc1 {
  readonly tz: string;
  /** local hour "YYYY-MM-DDTHH:00" -> available model values */
  readonly hourly: Map<string, number[]>;
  /** date -> mean of the models' daily maxima (>= 2 models with >= 20 hours) */
  readonly dailyMax: Map<string, number>;
}
export interface NContext {
  readonly fc: Map<string, Fc1>; // "ICAO|F" / "ICAO|C"
  readonly obs: Map<string, Pt[]>; // ICAO -> [unix seconds, °F], sorted
  readonly prices: Map<string, Record<string, Pt[]>>;
}
export interface NOptions { readonly rule: "N1" | "N2"; readonly hour: number; readonly cost: number; readonly threshold: number; readonly bothSides: boolean }
export interface NTrade { readonly id: string; readonly city: string; readonly day: string; readonly label: string; readonly side: "YES" | "NO"; readonly p: number; readonly q: number; readonly win: boolean; readonly r: number }

/** Build Fc1 from Open-Meteo hourly arrays (times are local). */
export function buildFc1(tz: string, chunks: Record<string, (number | null)[] | string[]>[]): Fc1 {
  const hourly = new Map<string, number[]>();
  const perDay = new Map<string, number[][]>();
  for (const h of chunks) {
    const times = h.time as string[];
    const models = Object.keys(h).filter((k) => k.startsWith("temperature_2m_previous_day1"));
    times.forEach((t, i) => {
      const vals = models.map((k) => (h[k] as (number | null)[])[i]);
      hourly.set(t, vals.filter((v): v is number => v !== null && v !== undefined));
      const d = t.slice(0, 10);
      if (!perDay.has(d)) perDay.set(d, models.map(() => []));
      vals.forEach((v, j) => { if (v !== null && v !== undefined) perDay.get(d)![j]!.push(v); });
    });
  }
  const dailyMax = new Map<string, number>();
  for (const [d, lists] of perDay) {
    const mx = lists.filter((l) => l.length >= 20).map((l) => Math.max(...l));
    if (mx.length >= 2) dailyMax.set(d, mx.reduce((a, b) => a + b, 0) / mx.length);
  }
  return { tz, hourly, dailyMax };
}

const toUnit = (f: number, unit: "F" | "C") => (unit === "F" ? f : (f - 32) / 1.8);
const localHourKey = (utcSec: number, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utcSec * 1000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
};

/** Observation nearest to time t within ±30 min (in °F), or null. */
export function obsNear(obs: readonly Pt[], t: number): number | null {
  let best: number | null = null, bd = 1801;
  let lo = 0, hi = obs.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (obs[mid]![0] < t - 1800) lo = mid + 1; else hi = mid; }
  for (let i = lo; i < obs.length && obs[i]![0] <= t + 1800; i++) { const dd = Math.abs(obs[i]![0] - t); if (dd < bd) { bd = dd; best = obs[i]![1]; } }
  return best;
}

/** N2 center: c = max(F + today's offset over [T-3h, T), max so far); null if fewer than 2 matched hours or no observation so far. */
export function nowcast(F: number, fc: Fc1, obs: readonly Pt[], dayStart: number, T: number, unit: "F" | "C"): { c: number; offset: number; maxSoFar: number } | null {
  const diffs: number[] = [];
  for (let h = T - 3 * 3600; h < T; h += 3600) {
    const o = obsNear(obs, h);
    const m = fc.hourly.get(localHourKey(h, fc.tz));
    if (o === null || !m || m.length < 2) continue;
    diffs.push(toUnit(o, unit) - m.reduce((a, b) => a + b, 0) / m.length);
  }
  const so = obs.filter(([t]) => t >= dayStart && t < T).map(([, v]) => toUnit(v, unit));
  if (diffs.length < 2 || !so.length) return null;
  const offset = diffs.reduce((a, b) => a + b, 0) / diffs.length, maxSoFar = Math.max(...so);
  return { c: Math.max(F + offset, maxSoFar), offset, maxSoFar };
}

/** Probability of a bucket under Normal(c, sigma) truncated below at maxSoFar - 0.5; integer readings -> [lo - 0.5, hi + 0.5]. */
export function bucketProb(b: Bucket, c: number, sigma: number, maxSoFar: number): number {
  const A = maxSoFar - 0.5;
  const tail = 1 - phi((A - c) / sigma);
  if (tail <= 1e-12) return 0;
  const U = Number.isFinite(b.hi) ? b.hi + 0.5 : Infinity;
  const L = Math.max(Number.isFinite(b.lo) ? b.lo - 0.5 : -Infinity, A);
  if (U <= L) return 0;
  return ((U === Infinity ? 1 : phi((U - c) / sigma)) - phi((L - c) / sigma)) / tail;
}

const actual = (b: Bucket) => (Number.isFinite(b.lo) && Number.isFinite(b.hi) ? (b.lo + b.hi) / 2 : Number.isFinite(b.hi) ? b.hi : b.lo);

export function runSameDay(events: readonly WEvent[], ctx: NContext, o: NOptions, seeds = 100) {
  const counts: Record<string, number> = {};
  const inc = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const histF = new Map<string, { d: string; err: number }[]>(), histC = new Map<string, { d: string; err: number }[]>();
  const trades: NTrade[] = [], favorite: NTrade[] = [], pools: { p: number; win: boolean }[][] = [];
  const rows = events.map((e) => ({ e, D: eventDay(e) })).filter((x) => x.D).sort((a, b) => (a.D! < b.D! ? -1 : a.D! > b.D! ? 1 : 0));
  for (const { e, D } of rows) {
    const city = e.title.replace(/^Highest temperature in /, "").replace(/ on .*$/, "");
    const bs = e.markets.map((m) => ({ m, b: parseBucket(m.label) }));
    if (!bs.length || bs.some((x) => !x.b)) { inc("excluded: unparsed bucket"); continue; }
    const unit = bs[0]!.b!.unit;
    const icao = icaoOf(e.desc);
    const fc = icao ? ctx.fc.get(`${icao}|${unit}`) : undefined;
    const obs = icao ? ctx.obs.get(icao) : undefined;
    if (!icao || !fc || !obs) { inc("excluded: no station/forecast/observations"); continue; }
    const winners = bs.filter(({ m }) => m.final[Math.max(0, m.outcomes.indexOf("Yes"))] === "1");
    if (winners.length !== 1) { inc("excluded: not exactly one winner"); continue; }
    const F = fc.dailyMax.get(D!);
    if (F === undefined) { inc("excluded: no forecast"); continue; }
    const act = actual(winners[0]!.b!);
    const T = localToUtc(D!, 0, o.hour, fc.tz), dayStart = localToUtc(D!, 0, 0, fc.tz);
    const nc = nowcast(F, fc, obs, dayStart, T, unit);
    // histories (only events before D are used)
    const hF = histF.get(icao) ?? histF.set(icao, []).get(icao)!;
    const hC = histC.get(icao) ?? histC.set(icao, []).get(icao)!;
    const priorF = hF.filter((x) => x.d < D!).slice(-30), priorC = hC.filter((x) => x.d < D!).slice(-30);
    hF.push({ d: D!, err: act - F });
    if (nc) hC.push({ d: D!, err: act - nc.c });
    const ph = ctx.prices.get(e.id);
    if (!ph) { inc("excluded: no prices"); continue; }
    const priced = bs.map(({ m, b }) => {
      const h = [...(ph[m.label] ?? [])].sort((x, y) => x[0] - y[0]);
      return { label: m.label, b: b!, p: priceAt(h, T, 3 * 3600), win: m === winners[0]!.m };
    }).filter((x) => x.p !== null) as { label: string; b: Bucket; p: number; win: boolean }[];
    if (priced.length) {
      const fav = priced.reduce((a, b) => (b.p > a.p ? b : a));
      favorite.push({ id: e.id, city, day: D!, label: fav.label, side: "YES", p: fav.p, q: NaN, win: fav.win, r: ret(fav.p + o.cost, fav.win ? 1 : 0) });
    }
    const elig = priced.filter((s) => s.p >= 0.02 && s.p <= 0.95);
    if (o.rule === "N1") {
      if (priorF.length < 10) { inc("warm-up"); continue; }
      const m = priorF.reduce((a, x) => a + x.err, 0) / priorF.length;
      const x = Math.round(F + m);
      const pick = priced.find((s) => s.b.lo <= x && x <= s.b.hi);
      if (!pick) { inc("no price for the forecast bucket"); continue; }
      if (pick.p > 0.72) { inc("price above 0.72"); continue; }
      inc("traded");
      trades.push({ id: e.id, city, day: D!, label: pick.label, side: "YES", p: pick.p, q: NaN, win: pick.win, r: ret(pick.p + o.cost, pick.win ? 1 : 0) });
      pools.push(elig.map((s) => ({ p: s.p, win: s.win })));
      continue;
    }
    if (!nc) { inc("excluded: not enough observations"); continue; }
    if (priorC.length < 10) { inc("warm-up"); continue; }
    const mu = priorC.reduce((a, x) => a + x.err, 0) / priorC.length;
    const sd = Math.sqrt(priorC.reduce((a, x) => a + (x.err - mu) ** 2, 0) / (priorC.length - 1));
    const sigma = Math.max(sd, unit === "F" ? 1 : 0.5);
    let best: { s: (typeof elig)[number]; side: "YES" | "NO"; edge: number; q: number } | null = null;
    for (const s of elig) {
      const q = bucketProb(s.b, nc.c, sigma, nc.maxSoFar);
      const cands: ["YES" | "NO", number][] = [["YES", q - s.p]];
      if (o.bothSides) cands.push(["NO", s.p - q]);
      for (const [side, edge] of cands) if (!best || edge > best.edge) best = { s, side, edge, q };
    }
    if (!best || best.edge < o.threshold) { inc("no trade (edge below threshold)"); continue; }
    inc("traded");
    const win = best.side === "YES" ? best.s.win : !best.s.win;
    const price = best.side === "YES" ? best.s.p : 1 - best.s.p;
    trades.push({ id: e.id, city, day: D!, label: best.s.label, side: best.side, p: price, q: best.q, win, r: ret(price + o.cost, win ? 1 : 0) });
    pools.push(elig.map((s) => ({ p: s.p, win: s.win })));
  }
  const randomMeans: number[] = [];
  for (let s = 0; s < seeds; s++) {
    const rnd = mulberry32(7000 + s);
    let sum = 0, n = 0;
    for (const pool of pools) { if (!pool.length) continue; const x = pool[Math.floor(rnd() * pool.length)]!; sum += ret(x.p + o.cost, x.win ? 1 : 0); n++; }
    randomMeans.push(n ? sum / n : NaN);
  }
  return { trades, favorite, randomMeans, counts };
}
