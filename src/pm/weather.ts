// W — daily high temperature markets vs public weather models (experiments/polymarket-preregistration.md).
import { mulberry32 } from "../evaluate.js";
import { phi, priceAt, ret, type Pt } from "./common.js";

export interface WMarket { readonly label: string; readonly outcomes: readonly string[]; readonly final: readonly string[] }
export interface WEvent { readonly id: string; readonly title: string; readonly endDate: string; readonly desc: string; readonly markets: readonly WMarket[] }

export interface Bucket { readonly label: string; readonly lo: number; readonly hi: number; readonly unit: "F" | "C" }

/** "28-29°F" -> 28..29, "15°C" -> 15..15, "27°F or below" -> -inf..27, "38°F or higher" -> 38..inf. Null if not recognised. */
export function parseBucket(label: string): Bucket | null {
  const m = label.trim().replace(/−/g, "-").match(/^(-?\d+)(?:\s*-\s*(-?\d+))?\s*°\s*([FC])(?:\s+or\s+(below|higher))?$/);
  if (!m) return null;
  const a = Number(m[1]), b = m[2] !== undefined ? Number(m[2]) : a, unit = m[3] as "F" | "C";
  if (m[4] === "below") return m[2] === undefined ? { label, lo: -Infinity, hi: a, unit } : null;
  if (m[4] === "higher") return m[2] === undefined ? { label, lo: a, hi: Infinity, unit } : null;
  return b >= a ? { label, lo: a, hi: b, unit } : null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Event date D = endDate's UTC date, checked against "on <Month> <day>" in the title. Null if they disagree. */
export function eventDay(e: Pick<WEvent, "title" | "endDate">): string | null {
  const m = e.title.toLowerCase().match(/ on ([a-z]+) (\d{1,2})\??$/);
  if (!m) return null;
  const d = e.endDate.slice(0, 10);
  return MONTHS.indexOf(m[1]!) + 1 === Number(d.slice(5, 7)) && Number(m[2]) === Number(d.slice(8, 10)) ? d : null;
}

export function icaoOf(desc: string): string | null {
  const m = desc.match(/wunderground\.com\/history\/daily\/(?:[^/\s]+\/)+([A-Za-z0-9]{4})(?=[/?#.,\s)]|$)/i) ?? desc.match(/timeseries\?site=([A-Za-z0-9]{4})\b/i);
  return m ? m[1]!.toUpperCase() : null;
}

/** Offset of a time zone from UTC in milliseconds at instant utcMs. */
function tzOffset(tz: string, utcMs: number): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - utcMs;
}
/** Local wall-clock time (date D shifted by dayOffset days, at `hour`) in time zone tz -> unix seconds. */
export function localToUtc(D: string, dayOffset: number, hour: number, tz: string): number {
  const [y, m, d] = D.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d + dayOffset, hour);
  let utc = guess - tzOffset(tz, guess);
  utc = guess - tzOffset(tz, utc);
  return utc / 1000;
}
/** Decision time: 12:00 local time on the day before D, as unix seconds. */
export function decisionTime(D: string, tz: string): number {
  return localToUtc(D, -1, 12, tz);
}

/** Hourly previous_day2 forecast -> daily mean of the models' 24-hour maxima (>= 2 models with >= 20 hours each). */
export function dailyForecastMax(hourly: Record<string, (number | null)[] | string[]>): Map<string, number> {
  const times = hourly.time as string[];
  const models = Object.keys(hourly).filter((k) => k.startsWith("temperature_2m_previous_day2"));
  const per = new Map<string, number[][]>(); // date -> per model list of values
  times.forEach((t, i) => {
    const d = t.slice(0, 10);
    if (!per.has(d)) per.set(d, models.map(() => []));
    models.forEach((k, j) => { const v = (hourly[k] as (number | null)[])[i]; if (v !== null && v !== undefined) per.get(d)![j]!.push(v); });
  });
  const out = new Map<string, number>();
  for (const [d, lists] of per) {
    const maxima = lists.filter((l) => l.length >= 20).map((l) => Math.max(...l));
    if (maxima.length >= 2) out.set(d, maxima.reduce((a, b) => a + b, 0) / maxima.length);
  }
  return out;
}

export interface WContext {
  /** "ICAO|F" or "ICAO|C" -> { timezone, daily forecast max by date } in that unit */
  readonly forecasts: Map<string, { tz: string; max: Map<string, number> }>;
  /** event id -> label -> hourly price history of the YES token */
  readonly prices: Map<string, Record<string, Pt[]>>;
}
export interface WOptions { readonly threshold: number; readonly cost: number }
export interface WTrade { readonly id: string; readonly city: string; readonly day: string; readonly label: string; readonly p: number; readonly q: number; readonly win: boolean; readonly r: number }
export interface WResult {
  readonly trades: WTrade[];
  readonly favorite: WTrade[];
  readonly randomMeans: number[];
  readonly brier: { model: number; market: number; n: number };
  readonly counts: Record<string, number>;
  /** every bucket with a price at T (for calibration tables) */
  readonly scored: { p: number; q: number; win: boolean }[];
}

const actual = (b: Bucket) => (Number.isFinite(b.lo) && Number.isFinite(b.hi) ? (b.lo + b.hi) / 2 : Number.isFinite(b.hi) ? b.hi : b.lo);
const DAY_MS = 86_400_000;

/** Run the pre-registered rule over events (any order; sorted by date inside). */
export function runWeather(events: readonly WEvent[], ctx: WContext, o: WOptions, seeds = 100): WResult {
  const counts: Record<string, number> = {};
  const inc = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const hist = new Map<string, { d: number; err: number }[]>(); // per station (ICAO), errors of past events
  const trades: WTrade[] = [], favorite: WTrade[] = [];
  const randomPools: { p: number; win: boolean }[][] = []; // per traded event: the eligible buckets
  let bm = 0, bk = 0, bn = 0;
  const allScored: { p: number; q: number; win: boolean }[] = [];
  const rows = events.map((e) => ({ e, D: eventDay(e) })).filter((x) => { if (!x.D) inc("excluded: date mismatch"); return !!x.D; }).sort((a, b) => (a.D! < b.D! ? -1 : a.D! > b.D! ? 1 : 0));

  for (const { e, D } of rows) {
    const city = e.title.replace(/^Highest temperature in /, "").replace(/ on .*$/, "");
    const buckets = e.markets.map((m) => ({ m, b: parseBucket(m.label) }));
    if (!buckets.length || buckets.some((x) => !x.b)) { inc("excluded: unparsed bucket"); continue; }
    const unit = buckets[0]!.b!.unit;
    if (buckets.some((x) => x.b!.unit !== unit)) { inc("excluded: mixed units"); continue; }
    const icao = icaoOf(e.desc);
    const fc = icao ? ctx.forecasts.get(`${icao}|${unit}`) : undefined;
    if (!icao || !fc) { inc("excluded: no station/forecast"); continue; }
    const winners = buckets.filter(({ m }) => m.final[Math.max(0, m.outcomes.indexOf("Yes"))] === "1");
    if (winners.length !== 1) { inc("excluded: not exactly one winner"); continue; }
    const F = fc.max.get(D!);
    if (F === undefined) { inc("excluded: no forecast for the day"); continue; }
    const dMs = Date.parse(`${D}T00:00:00Z`);
    const err = actual(winners[0]!.b!) - F;
    const h = hist.get(icao) ?? hist.set(icao, []).get(icao)!;
    const prior = h.filter((x) => x.d <= dMs - 2 * DAY_MS).slice(-30);
    h.push({ d: dMs, err }); // used only by later events (d <= their D - 2 days)
    if (prior.length < 10) { inc("warm-up (fewer than 10 earlier events)"); continue; }
    const mu = prior.reduce((a, x) => a + x.err, 0) / prior.length;
    const sd = Math.sqrt(prior.reduce((a, x) => a + (x.err - mu) ** 2, 0) / (prior.length - 1));
    const sigma = Math.max(sd, unit === "F" ? 1.5 : 1);
    const center = F + mu;
    const T = decisionTime(D!, fc.tz);
    const ph = ctx.prices.get(e.id);
    if (!ph) { inc("excluded: no price file"); continue; }
    const scored = buckets.map(({ m, b }) => {
      const hi = Number.isFinite(b!.hi) ? phi((b!.hi + 0.5 - center) / sigma) : 1;
      const lo = Number.isFinite(b!.lo) ? phi((b!.lo - 0.5 - center) / sigma) : 0;
      const hs = [...(ph[m.label] ?? [])].sort((x, y) => x[0] - y[0]);
      return { label: m.label, q: hi - lo, p: priceAt(hs, T, 3 * 3600), win: m === winners[0]!.m };
    });
    inc("evaluated");
    if (scored.every((s) => s.p !== null)) {
      bn += scored.length;
      for (const s of scored) { const y = s.win ? 1 : 0; bm += (s.q - y) ** 2; bk += (s.p! - y) ** 2; }
    }
    const priced = scored.filter((s) => s.p !== null) as { label: string; q: number; p: number; win: boolean }[];
    for (const s of priced) allScored.push({ p: s.p, q: s.q, win: s.win });
    if (priced.length) {
      const fav = priced.reduce((a, b) => (b.p > a.p ? b : a));
      favorite.push({ id: e.id, city, day: D!, label: fav.label, p: fav.p, q: fav.q, win: fav.win, r: ret(fav.p + o.cost, fav.win ? 1 : 0) });
    }
    const elig = priced.filter((s) => s.p >= 0.02 && s.p <= 0.95);
    if (!elig.length) { inc("no eligible bucket"); continue; }
    const best = elig.reduce((a, b) => (b.q - b.p > a.q - a.p ? b : a));
    if (best.q - best.p < o.threshold) { inc("no trade (edge below threshold)"); continue; }
    trades.push({ id: e.id, city, day: D!, label: best.label, p: best.p, q: best.q, win: best.win, r: ret(best.p + o.cost, best.win ? 1 : 0) });
    randomPools.push(elig.map((s) => ({ p: s.p, win: s.win })));
  }
  const randomMeans: number[] = [];
  for (let s = 0; s < seeds; s++) {
    const rnd = mulberry32(7000 + s);
    let sum = 0;
    for (const pool of randomPools) { const x = pool[Math.floor(rnd() * pool.length)]!; sum += ret(x.p + o.cost, x.win ? 1 : 0); }
    randomMeans.push(randomPools.length ? sum / randomPools.length : NaN);
  }
  return { trades, favorite, randomMeans, brier: { model: bm / bn, market: bk / bn, n: bn }, counts, scored: allScored };
}
