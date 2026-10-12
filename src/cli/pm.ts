/**
 * Polymarket tests W (weather), P (pulse), K (cluster). Rules: experiments/polymarket-preregistration.md.
 * Needs the pmdata branch at data/pm:  git fetch origin pmdata && git worktree add data/pm FETCH_HEAD
 * Run: npx tsx src/cli/pm.ts   Writes reports/polymarket.md
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fmt } from "../evaluate.js";
import { bootstrapByDay, mean, verdict, type Pt, type Trade } from "../pm/common.js";
import { clusterReturn, findClusters, findSpikes, holdReturn, randomMeans, resolved, type TradeRow } from "../pm/flow.js";
import { dailyForecastMax, runWeather, type WContext, type WEvent, type WTrade } from "../pm/weather.js";

const D = process.argv[2] ?? "data/pm";
const gz = <T>(p: string): T => JSON.parse(gunzipSync(readFileSync(p)).toString()) as T;
const json = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const pct = (x: number) => `${fmt(100 * x, 1)}%`;
const out: string[] = ["# Polymarket: Weather, Pulse, Cluster: резултати", "",
  "Правила: `experiments/polymarket-preregistration.md` (записани преди данните). Резултат = печалба на $1 залог; разход 0.01 на страна.", ""];

function summary(name: string, ts: Trade[], rnd: number[]) {
  const m = mean(ts.map((t) => t.r)), boot = bootstrapByDay(ts), beats = rnd.filter((x) => m > x).length;
  return { name, n: ts.length, days: new Set(ts.map((t) => t.day)).size, win: ts.filter((t) => t.r > 0).length / ts.length, m, boot, beats, rndMean: mean(rnd), v: verdict(m, boot, beats) };
}
const head = ["| Тест | Сделки (дни) | Печеливши | Средно на $1 | Bootstrap > 0 | Случаен избор: средно · стратегията по-добра от | Присъда |", "| --- | --- | --- | --- | --- | --- | --- |"];
const line = (s: ReturnType<typeof summary>) =>
  `| ${s.name} | ${s.n} (${s.days}) | ${pct(s.win)} | ${fmt(s.m, 3)} | ${pct(s.boot)} | ${fmt(s.rndMean, 3)} · ${s.beats}/100 | **${s.v}** |`;
const verdictRows: string[] = [];

// ---------------- W ----------------
if (existsSync(`${D}/w/events.json`)) {
  const events = json<WEvent[]>(`${D}/w/events.json`);
  const forecasts: WContext["forecasts"] = new Map();
  for (const f of readdirSync(`${D}/w/fc`)) {
    const c = gz<{ icao: string; unit: string; timezone: string; hourly: Record<string, (number | null)[] | string[]> }>(`${D}/w/fc/${f}`);
    const key = `${c.icao}|${c.unit === "fahrenheit" ? "F" : "C"}`;
    const cur = forecasts.get(key) ?? { tz: c.timezone, max: new Map<string, number>() };
    for (const [d, v] of dailyForecastMax(c.hourly)) cur.max.set(d, v);
    forecasts.set(key, cur);
  }
  const prices: WContext["prices"] = new Map();
  for (const f of readdirSync(`${D}/w/prices`)) prices.set(f.replace(".json.gz", ""), gz<Record<string, Pt[]>>(`${D}/w/prices/${f}`));
  const ctx = { forecasts, prices };
  const main = runWeather(events, ctx, { threshold: 0.1, cost: 0.01 });
  const s = summary("**W основен** (праг 0.10, разход 0.01)", main.trades, main.randomMeans);
  verdictRows.push(line({ ...s, name: "W — Weather" }));
  out.push("## W — Weather", "",
    `Събития: ${events.length} (12-те града). Станции с прогнози: ${forecasts.size}. Ценови файлове: ${prices.size}.`, "",
    "Какво стана със събитията:", "", ...Object.entries(main.counts).sort().map(([k, v]) => `- ${k}: ${v}`), "", ...head, line(s));
  for (const [thr, cost] of [[0.05, 0.01], [0.2, 0.01], [0.1, 0], [0.1, 0.02]] as const) {
    const r = runWeather(events, ctx, { threshold: thr, cost });
    out.push(line(summary(`праг ${thr}, разход ${cost}`, r.trades, r.randomMeans)));
  }
  const fav = summary("„фаворит на пазара“ (разход 0.01)", main.favorite, []);
  out.push("", `- **Фаворит на пазара** (най-скъпото кошче): ${fav.n} събития, сбъдва се в ${pct(fav.win)}, средно ${fmt(fav.m, 3)} на $1.`,
    `- **Средна цена при вход** в основния вариант: ${fmt(mean(main.trades.map((t) => t.p)), 3)}; средна вероятност по модела: ${fmt(mean(main.trades.map((t) => t.q)), 3)}.`,
    `- **Brier score** (по-малко = по-точно), ${main.brier.n} кошчета: модел ${fmt(main.brier.model, 4)}, пазар ${fmt(main.brier.market, 4)}.`, "",
    "**Калибриране на пазара** (всички кошчета с цена в момента на решение):", "", "| Цена | Кошчета | Средна цена | Реално сбъднати |", "| --- | --- | --- | --- |");
  for (const [a, b] of [[0, 0.05], [0.05, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]] as const) {
    const xs = main.scored.filter((x) => x.p >= a && x.p < b);
    if (xs.length) out.push(`| ${a}–${Math.min(b, 1)} | ${xs.length} | ${fmt(mean(xs.map((x) => x.p)), 3)} | ${pct(xs.filter((x) => x.win).length / xs.length)} |`);
  }
  const byCity = new Map<string, WTrade[]>();
  for (const t of main.trades) (byCity.get(t.city) ?? byCity.set(t.city, []).get(t.city)!).push(t);
  out.push("", "**По градове (основен вариант, описателно):**", "", "| Град | Сделки | Печеливши | Средно на $1 |", "| --- | --- | --- | --- |",
    ...[...byCity].sort().map(([c, ts]) => `| ${c} | ${ts.length} | ${pct(ts.filter((t) => t.r > 0).length / ts.length)} | ${fmt(mean(ts.map((t) => t.r)), 3)} |`));
  const half = (t: WTrade) => `${t.day.slice(0, 4)} H${Number(t.day.slice(5, 7)) <= 6 ? 1 : 2}`;
  const byHalf = new Map<string, WTrade[]>();
  for (const t of main.trades) (byHalf.get(half(t)) ?? byHalf.set(half(t), []).get(half(t))!).push(t);
  out.push("", "**По полугодия:** " + [...byHalf].sort().map(([h, ts]) => `${h}: ${ts.length} сделки, ${fmt(mean(ts.map((t) => t.r)), 3)}`).join("; "), "");
}

// ---------------- P ----------------
if (existsSync(`${D}/p/markets.json`)) {
  interface PM { id: string; q: string; final: string[]; closedTime: string }
  const ms = json<PM[]>(`${D}/p/markets.json`);
  const data: { h: Pt[]; close: number; yes: 0 | 1 }[] = [];
  let noHist = 0, unresolved = 0;
  for (const m of ms) {
    const p = `${D}/p/h/${m.id}.json.gz`;
    if (!existsSync(p) || !m.closedTime) { noHist++; continue; }
    const yes = resolved(m.final, 0);
    if (yes === null) { unresolved++; continue; }
    const h = gz<Pt[]>(p).sort((a, b) => a[0] - b[0]);
    if (h.length < 10) { noHist++; continue; }
    data.push({ h, close: Date.parse(m.closedTime.replace(" ", "T").replace("+00", "Z")) / 1000, yes });
  }
  const sig = data.flatMap((x) => findSpikes(x.h, x.close).map((s) => ({ x, s })));
  out.push("## P — Pulse", "", `Пазари: ${ms.length}; с история и ясен изход: ${data.length} (без история: ${noHist}, неясен изход: ${unresolved}). Скокове: ${sig.length} (нагоре ${sig.filter((z) => z.s.dir === 1).length}).`, "", ...head);
  const dayOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  for (const [label, hold] of [["24 ч (основен)", 24 * 3600], ["1 ч", 3600], ["6 ч", 6 * 3600], ["до края", Infinity]] as const) {
    for (const [nm, sideOf] of [["PC срещу", (d: 1 | -1) => (d === 1 ? -1 : 1) as 1 | -1], ["PM с движението", (d: 1 | -1) => d]] as const) {
      const ts: Trade[] = [];
      const used: typeof sig = [];
      for (const z of sig) {
        const r = holdReturn(z.x.h, z.x.close, z.x.yes, z.s.t, sideOf(z.s.dir), hold, 0.01);
        if (r !== null) { ts.push({ day: dayOf(z.s.t), r }); used.push(z); }
      }
      const rnd = randomMeans(used.length, 100, (rr, i) => {
        const { x } = used[i]!;
        const a = x.h[0]![0] + 3600, b = x.close - 86400;
        if (!(b > a)) return null;
        return holdReturn(x.h, x.close, x.yes, a + rr() * (b - a), rr() < 0.5 ? 1 : -1, hold, 0.01);
      });
      const s = summary(`${nm}, изход ${label}`, ts, rnd);
      out.push(line(s));
      if (hold === 24 * 3600) verdictRows.push(line({ ...s, name: nm.startsWith("PC") ? "PC — Pulse срещу движението" : "PM — Pulse с движението" }));
    }
  }
  out.push("");
}

// ---------------- K ----------------
if (existsSync(`${D}/k/sample-v2.json`)) {
  interface KM { id: string; final: string[]; closedTime: string }
  const ms = new Map(json<KM[]>(`${D}/k/markets-v2.json`).map((m) => [m.id, m]));
  const ids = json<string[]>(`${D}/k/sample-v2.json`);
  let incomplete = 0, missing = 0, unresolved = 0, nTrades = 0;
  const sig: { rows: TradeRow[]; close: number; res: [0 | 1 | null, 0 | 1 | null]; t: number; o: 0 | 1 }[] = [];
  for (const id of ids) {
    const p = `${D}/k/t2/${id}.json.gz`, m = ms.get(id);
    if (!existsSync(p) || !m?.closedTime) { missing++; continue; }
    const f = gz<{ complete: boolean; rows: TradeRow[] }>(p);
    if (!f.complete) { incomplete++; continue; }
    const res: [0 | 1 | null, 0 | 1 | null] = [resolved(m.final, 0), resolved(m.final, 1)];
    if (res[0] === null) { unresolved++; continue; }
    const rows = [...f.rows].sort((a, b) => a[0] - b[0]);
    nTrades += rows.length;
    const close = Date.parse(m.closedTime.replace(" ", "T").replace("+00", "Z")) / 1000;
    for (const c of findClusters(rows, close)) sig.push({ rows, close, res, t: c.t, o: c.outcome });
  }
  out.push("## K — Cluster", "", `Извадка: ${ids.length} пазара; използвани: ${ids.length - incomplete - missing - unresolved} (непълна история: ${incomplete}, липсващи: ${missing}, неясен изход: ${unresolved}); сделки: ${nTrades}. Клъстери: ${sig.length}.`, "", ...head);
  const ts: Trade[] = [];
  const used: typeof sig = [];
  for (const z of sig) {
    const r = clusterReturn(z.rows, z.t, z.o, z.res[z.o]!, 0.01);
    if (r !== null) { ts.push({ day: new Date(z.t * 1000).toISOString().slice(0, 10), r }); used.push(z); }
  }
  const rnd = randomMeans(used.length, 100, (rr, i) => {
    const z = used[i]!;
    const a = z.rows[0]![0], b = z.close - 6 * 3600;
    if (!(b > a)) return null;
    const o: 0 | 1 = rr() < 0.5 ? 0 : 1;
    return clusterReturn(z.rows, a + rr() * (b - a), o, z.res[o]!, 0.01);
  });
  const s = summary("K основен (държане до края)", ts, rnd);
  out.push(line(s), "", `- Средна цена при вход: ${fmt(mean(used.map((z) => { const k = z.rows.find((r) => r[0] >= z.t + 300 && r[3] === z.o); return k ? k[5] : NaN; }).filter(Number.isFinite)), 3)}.`, "");
  verdictRows.push(line({ ...s, name: "K — Cluster" }));
}

out.splice(4, 0, "## Присъда (основни варианти)", "", ...head, ...verdictRows, "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/polymarket.md", text + "\n");
