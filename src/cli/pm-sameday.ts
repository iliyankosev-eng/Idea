/**
 * Same-day weather tests N1 / N2 (experiments/weather-sameday-preregistration.md).
 * Needs the pmdata branch at data/pm (w/events.json, w/prices, w/fc1, w/obs). Run: npx tsx src/cli/pm-sameday.ts  Writes reports/weather-sameday.md
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fmt } from "../evaluate.js";
import { bootstrapByDay, mean, verdict, type Pt } from "../pm/common.js";
import { buildFc1, runSameDay, type Fc1, type NOptions } from "../pm/sameday.js";
import { eventDay, icaoOf, localToUtc, parseBucket, type WEvent } from "../pm/weather.js";

const D = process.argv[2] ?? "data/pm";
const gz = <T>(p: string): T => JSON.parse(gunzipSync(readFileSync(p)).toString()) as T;
const events = JSON.parse(readFileSync(`${D}/w/events.json`, "utf8")) as WEvent[];
const prices = new Map<string, Record<string, Pt[]>>();
for (const f of readdirSync(`${D}/w/prices`)) prices.set(f.replace(".json.gz", ""), gz(`${D}/w/prices/${f}`));
const chunks = new Map<string, { tz: string; hs: Record<string, (number | null)[] | string[]>[] }>();
for (const f of readdirSync(`${D}/w/fc1`)) {
  const c = gz<{ icao: string; unit: string; timezone: string; hourly: Record<string, (number | null)[] | string[]> }>(`${D}/w/fc1/${f}`);
  const k = `${c.icao}|${c.unit === "fahrenheit" ? "F" : "C"}`;
  const cur = chunks.get(k) ?? { tz: c.timezone, hs: [] };
  cur.hs.push(c.hourly);
  chunks.set(k, cur);
}
const fc = new Map<string, Fc1>([...chunks].map(([k, v]) => [k, buildFc1(v.tz, v.hs)]));
const obs = new Map<string, Pt[]>();
for (const f of readdirSync(`${D}/w/obs`)) {
  const rows: Pt[] = [];
  for (const line of readFileSync(`${D}/w/obs/${f}`, "utf8").trim().split("\n").slice(1)) {
    const [, valid, t] = line.split(",");
    const v = Number(t);
    if (!valid || !Number.isFinite(v)) continue;
    rows.push([Date.parse(valid.replace(" ", "T") + ":00Z") / 1000, v]);
  }
  obs.set(f.replace(".csv", ""), rows.sort((a, b) => a[0] - b[0]));
}
const ctx = { fc, obs, prices };
const out: string[] = ["# Weather в самия ден (N1, N2): резултати", "", "Правила: `experiments/weather-sameday-preregistration.md`. Резултат = печалба на $1 залог, разход 0.01.", ""];

// Data check: METAR daily maximum vs the bucket that won
let agree = 0, near = 0, n = 0;
for (const e of events) {
  const Dd = eventDay(e), icao = icaoOf(e.desc);
  const bs = e.markets.map((m) => parseBucket(m.label));
  if (!Dd || !icao || bs.some((b) => !b)) continue;
  const unit = bs[0]!.unit, f = fc.get(`${icao}|${unit}`), o = obs.get(icao);
  const w = e.markets.findIndex((m) => m.final[Math.max(0, m.outcomes.indexOf("Yes"))] === "1");
  if (!f || !o || w < 0) continue;
  const a = localToUtc(Dd, 0, 0, f.tz), b = localToUtc(Dd, 1, 0, f.tz);
  const day = o.filter(([t]) => t >= a && t < b).map(([, v]) => (unit === "F" ? v : (v - 32) / 1.8));
  if (day.length < 12) continue;
  const mx = Math.round(Math.max(...day)), wb = bs[w]!;
  n++;
  if (mx >= wb.lo && mx <= wb.hi) agree++;
  if (mx >= wb.lo - 1 && mx <= wb.hi + 1) near++;
}
out.push(`**Проверка на данните:** дневният максимум по METAR попада в печелившото кошче в ${agree}/${n} (${fmt((100 * agree) / n, 1)}%) събития, а в ±1 градус в ${fmt((100 * near) / n, 1)}%.`, "");

const head = ["| Вариант | Сделки (дни) | Печеливши | Ср. цена | Средно на $1 | Bootstrap > 0 | Случаен избор · по-добро от | Присъда |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
function line(name: string, o: NOptions) {
  const r = runSameDay(events, ctx, o);
  const m = mean(r.trades.map((t) => t.r)), boot = bootstrapByDay(r.trades), beats = r.randomMeans.filter((x) => m > x).length;
  const fav = mean(r.favorite.map((t) => t.r));
  return { row: `| ${name} | ${r.trades.length} (${new Set(r.trades.map((t) => t.day)).size}) | ${fmt((100 * r.trades.filter((t) => t.win).length) / r.trades.length, 1)}% | ${fmt(mean(r.trades.map((t) => t.p)), 3)} | ${fmt(m, 3)} | ${fmt(100 * boot, 1)}% | ${fmt(mean(r.randomMeans), 3)} · ${beats}/100 | **${verdict(m, boot, beats)}** |`, r, fav, m };
}
const base = { cost: 0.01, threshold: 0.1, bothSides: false };
const n1 = line("**N1 като бота, 10:00**", { ...base, rule: "N1", hour: 10 });
const n2 = line("**N2 с измерванията, 10:00**", { ...base, rule: "N2", hour: 10 });
out.push("## Присъда (основни варианти)", "", ...head, n1.row, n2.row, "", "## Варианти (не влияят на присъдата)", "", ...head,
  line("N1, 08:00", { ...base, rule: "N1", hour: 8 }).row, line("N1, 12:00", { ...base, rule: "N1", hour: 12 }).row,
  line("N2, 08:00", { ...base, rule: "N2", hour: 8 }).row, line("N2, 12:00", { ...base, rule: "N2", hour: 12 }).row,
  line("N2, 10:00, и НЕ", { ...base, rule: "N2", hour: 10, bothSides: true }).row,
  line("N2, 12:00, и НЕ", { ...base, rule: "N2", hour: 12, bothSides: true }).row,
  line("N2, 10:00, разход 0.02", { ...base, rule: "N2", hour: 10, cost: 0.02 }).row, "",
  `Фаворит на пазара в 10:00 (средно на $1): ${fmt(n1.fav, 3)}.`, "", "Какво стана със събитията (N1):", ...Object.entries(n1.r.counts).sort().map(([k, v]) => `- ${k}: ${v}`), "",
  "Какво стана със събитията (N2):", ...Object.entries(n2.r.counts).sort().map(([k, v]) => `- ${k}: ${v}`), "");
for (const [nm, x] of [["N1", n1], ["N2", n2]] as const) {
  const by = new Map<string, number[]>();
  for (const t of x.r.trades) (by.get(t.city) ?? by.set(t.city, []).get(t.city)!).push(t.r);
  out.push(`**${nm} по градове:** ` + [...by].sort().map(([c, v]) => `${c} ${v.length}: ${fmt(mean(v), 3)}`).join("; "), "");
  const bm = new Map<string, number[]>();
  for (const t of x.r.trades) (bm.get(t.day.slice(0, 7)) ?? bm.set(t.day.slice(0, 7), []).get(t.day.slice(0, 7))!).push(t.r);
  out.push(`**${nm} по месеци:** ` + [...bm].sort().map(([c, v]) => `${c} ${v.length}: ${fmt(mean(v), 3)}`).join("; "), "");
}
// Descriptive: what N1 did on the 4 days of the bot's public signals (Paris/London 10.09: 21°C; Madrid 12.09: 33°C; Munich 12.09: 23°C)
out.push("**Дните на публичните сигнали на бота (описателно):** " + ([["Paris", "2026-09-10", "21°C"], ["London", "2026-09-10", "21°C"], ["Madrid", "2026-09-12", "33°C"], ["Munich", "2026-09-12", "23°C"]] as const).map(([c, d, b]) => {
  const t = n1.r.trades.find((x) => x.city === c && x.day === d);
  return `${c} ${d} (бот: ${b}) → N1: ${t ? `${t.label} на ${fmt(t.p, 2)}, ${t.win ? "печели" : "губи"}` : "без сделка"}`;
}).join("; "), "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/weather-sameday.md", text + "\n");
