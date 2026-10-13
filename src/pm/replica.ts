// N3 — replica of the Weather Bot signal with the model runs available at decision time
// (experiments/weather-botreplica-preregistration.md).
import { mulberry32 } from "../evaluate.js";
import { priceAt, ret, type Pt } from "./common.js";
import { eventDay, icaoOf, localToUtc, parseBucket, type WEvent } from "./weather.js";

export const DELAY_H: Record<string, number> = { icon_d2: 3, icon_eu: 4, icon_global: 5, gfs_global: 6, ecmwf_ifs025: 8 };
export const EUROPE = new Set(["EDDM", "EGLC", "LEMD", "LFPB", "LFPG", "LIMC", "UUWW"]);
export const modelsFor = (icao: string) => (EUROPE.has(icao) ? ["icon_d2", "icon_eu", "ecmwf_ifs025"] : ["ecmwf_ifs025", "gfs_global", "icon_global"]);
export const TZ: Record<string, string> = { EDDM: "Europe/Berlin", EGLC: "Europe/London", KATL: "America/New_York", KLGA: "America/New_York", KORD: "America/Chicago", LEMD: "Europe/Madrid", LFPB: "Europe/Paris", LFPG: "Europe/Paris", LIMC: "Europe/Rome", RJTT: "Asia/Tokyo", UUWW: "Europe/Moscow", ZSPD: "Asia/Shanghai" };

/** Latest 00/06/12/18 UTC run that started at least delayH hours before t (ms). */
export const runFor = (tMs: number, delayH: number) => Math.floor((tMs - delayH * 3_600_000) / 21_600_000) * 21_600_000;

export interface Run { readonly time: readonly string[]; readonly temp: readonly (number | null)[] } // UTC "YYYY-MM-DDTHH:MM"
export type RunIndex = Map<string, Map<number, Run>>; // "ICAO|model" -> init ms -> run

const localDate = (utcIso: string, tz: string) => new Date(`${utcIso}:00Z`).toLocaleDateString("sv-SE", { timeZone: tz });

/** Max of one run over the local day D (>= 20 hourly values), else null. */
export function runDayMax(run: Run, D: string, tz: string): number | null {
  const v: number[] = [];
  run.time.forEach((t, i) => { const x = run.temp[i]; if (x !== null && x !== undefined && localDate(t, tz) === D) v.push(x); });
  return v.length >= 20 ? Math.max(...v) : null;
}
export const median = (xs: readonly number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

/** The bot's forecast for station/day at local hour: median of the models' day maxima from the runs available then. */
export function botForecast(idx: RunIndex, icao: string, D: string, hour: number): { value: number; models: number } | null {
  const tz = TZ[icao];
  if (!tz) return null;
  const T = localToUtc(D, 0, hour, tz) * 1000;
  const vals: number[] = [];
  for (const m of modelsFor(icao)) {
    const run = idx.get(`${icao}|${m}`)?.get(runFor(T, DELAY_H[m]!));
    const mx = run ? runDayMax(run, D, tz) : null;
    if (mx !== null) vals.push(mx);
  }
  return vals.length >= 2 ? { value: median(vals), models: vals.length } : null;
}

export interface N3Trade { readonly id: string; readonly city: string; readonly day: string; readonly label: string; readonly p: number; readonly win: boolean; readonly r: number }

export function runReplica(events: readonly WEvent[], idx: RunIndex, prices: Map<string, Record<string, Pt[]>>, hour: number, cost = 0.01, cap = 0.72, seeds = 100) {
  const counts: Record<string, number> = {};
  const inc = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const trades: N3Trade[] = [], favorite: N3Trade[] = [], pools: { p: number; win: boolean }[][] = [];
  const picks = new Map<string, { label: string; value: number; p: number | null; win: boolean }>(); // "city|day" -> pick (descriptive)
  let hits = 0, picked = 0, priceSum = 0, priced = 0;
  for (const e of events) {
    const D = eventDay(e);
    if (!D || D < "2026-06-01" || D > "2026-10-10") continue;
    const city = e.title.replace(/^Highest temperature in /, "").replace(/ on .*$/, "");
    const icao = icaoOf(e.desc);
    const bs = e.markets.map((m) => ({ m, b: parseBucket(m.label) }));
    if (!icao || !TZ[icao] || !bs.length || bs.some((x) => !x.b)) { inc("excluded: station/bucket"); continue; }
    const winners = bs.filter(({ m }) => m.final[Math.max(0, m.outcomes.indexOf("Yes"))] === "1");
    if (winners.length !== 1) { inc("excluded: not exactly one winner"); continue; }
    const f = botForecast(idx, icao, D, hour);
    if (!f) { inc("excluded: fewer than 2 model runs"); continue; }
    const x = Math.round(f.value);
    const pick = bs.find(({ b }) => b!.lo <= x && x <= b!.hi);
    if (!pick) { inc("excluded: no bucket for the forecast"); continue; }
    const ph = prices.get(e.id);
    if (!ph) { inc("excluded: no prices"); continue; }
    const T = localToUtc(D, 0, hour, TZ[icao]!);
    const at = (label: string) => priceAt([...(ph[label] ?? [])].sort((a, b) => a[0] - b[0]), T, 3 * 3600);
    const win = pick.m === winners[0]!.m;
    const p = at(pick.m.label);
    picked++; if (win) hits++;
    if (p !== null) { priceSum += p; priced++; }
    picks.set(`${city}|${D}`, { label: pick.m.label, value: f.value, p, win });
    const all = bs.map(({ m }) => ({ label: m.label, p: at(m.label), win: m === winners[0]!.m })).filter((s) => s.p !== null) as { label: string; p: number; win: boolean }[];
    if (all.length) { const fav = all.reduce((a, b) => (b.p > a.p ? b : a)); favorite.push({ id: e.id, city, day: D, label: fav.label, p: fav.p, win: fav.win, r: ret(fav.p + cost, fav.win ? 1 : 0) }); }
    if (p === null) { inc("no price at T"); continue; }
    if (p > cap) { inc(`price above ${cap}`); continue; }
    inc("traded");
    trades.push({ id: e.id, city, day: D, label: pick.m.label, p, win, r: ret(p + cost, win ? 1 : 0) });
    pools.push(all.filter((s) => s.p >= 0.02 && s.p <= 0.95).map((s) => ({ p: s.p, win: s.win })));
  }
  const randomMeans: number[] = [];
  for (let s = 0; s < seeds; s++) {
    const rnd = mulberry32(7000 + s);
    let sum = 0, n = 0;
    for (const pool of pools) { if (!pool.length) continue; const y = pool[Math.floor(rnd() * pool.length)]!; sum += ret(y.p + cost, y.win ? 1 : 0); n++; }
    randomMeans.push(n ? sum / n : NaN);
  }
  return { trades, favorite, randomMeans, counts, picks, hitRate: hits / picked, avgPickPrice: priceSum / priced, picked };
}
