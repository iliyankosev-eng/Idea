/**
 * N3 — replica of the Weather Bot signal (experiments/weather-botreplica-preregistration.md).
 * Needs the pmdata branch at data/pm with w/runs. Run: npx tsx src/cli/pm-replica.ts   Writes reports/weather-botreplica.md
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fmt } from "../evaluate.js";
import { bootstrapByDay, mean, verdict, type Pt } from "../pm/common.js";
import { runReplica, type Run, type RunIndex } from "../pm/replica.js";
import type { WEvent } from "../pm/weather.js";

const D = process.argv[2] ?? "data/pm";
const events = JSON.parse(readFileSync(`${D}/w/events.json`, "utf8")) as WEvent[];
const prices = new Map<string, Record<string, Pt[]>>();
for (const f of readdirSync(`${D}/w/prices`)) prices.set(f.replace(".json.gz", ""), JSON.parse(gunzipSync(readFileSync(`${D}/w/prices/${f}`)).toString()));
const idx: RunIndex = new Map();
let nRuns = 0;
for (const icao of existsSync(`${D}/w/runs`) ? readdirSync(`${D}/w/runs`) : []) for (const m of readdirSync(`${D}/w/runs/${icao}`)) {
  const mp = new Map<number, Run>();
  for (const f of readdirSync(`${D}/w/runs/${icao}/${m}`)) {
    const init = Date.parse(`${f.slice(0, 13)}:${f.slice(13, 15)}:00Z`);
    mp.set(init, JSON.parse(readFileSync(`${D}/w/runs/${icao}/${m}/${f}`, "utf8")));
    nRuns++;
  }
  idx.set(`${icao}|${m}`, mp);
}
const out: string[] = ["# N3: копие на сигнала на Weather Bot с най-свежите прогони: резултати", "", `Правила: \`experiments/weather-botreplica-preregistration.md\`. Прогони: ${nRuns}. Резултат = печалба на $1 залог, разход 0.01.`, "",
  "| Вариант | Сделки (дни) | Печеливши | Ср. цена | Средно на $1 | Bootstrap > 0 | Случаен избор · по-добро от | Присъда |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
const res: Record<string, ReturnType<typeof runReplica>> = {};
for (const [name, hour, cost] of [["**N3, 08:00 (основен)**", 8, 0.01], ["N3, 10:00", 10, 0.01], ["N3, 08:00, разход 0.02", 8, 0.02]] as const) {
  const r = runReplica(events, idx, prices, hour, cost);
  res[name] = r;
  const m = mean(r.trades.map((t) => t.r)), boot = bootstrapByDay(r.trades), beats = r.randomMeans.filter((x) => m > x).length;
  out.push(`| ${name} | ${r.trades.length} (${new Set(r.trades.map((t) => t.day)).size}) | ${fmt((100 * r.trades.filter((t) => t.win).length) / r.trades.length, 1)}% | ${fmt(mean(r.trades.map((t) => t.p)), 3)} | ${fmt(m, 3)} | ${fmt(100 * boot, 1)}% | ${fmt(mean(r.randomMeans), 3)} · ${beats}/100 | **${verdict(m, boot, beats)}** |`);
}
const main = res["**N3, 08:00 (основен)**"]!;
out.push("", `- Кошчето на сигнала печели в **${fmt(100 * main.hitRate, 1)}%** от ${main.picked} дни-градове. Средната му цена в 08:00 е ${fmt(main.avgPickPrice, 3)}.`,
  `- Фаворит на пазара в 08:00: средно ${fmt(mean(main.favorite.map((t) => t.r)), 3)} на $1 (${main.favorite.length} събития).`, "", "Какво стана със събитията:", ...Object.entries(main.counts).sort().map(([k, v]) => `- ${k}: ${v}`), "");
const bot: [string, string, string][] = [["Paris", "2026-09-10", "21°C"], ["London", "2026-09-10", "21°C"], ["Madrid", "2026-09-12", "33°C"], ["Munich", "2026-09-12", "23°C"], ["Munich", "2026-09-18", "21°C"]];
out.push("**Съвпадение със сигналите на бота (описателно):** " + bot.map(([c, d, b]) => {
  const p = main.picks.get(`${c}|${d}`);
  return `${c} ${d}: бот ${b}, N3 ${p ? `${p.label} (медиана ${fmt(p.value, 1)}, цена ${p.p === null ? "-" : fmt(p.p, 2)}, ${p.win ? "печели" : "губи"})` : "няма"}`;
}).join("; "), "");
const by = new Map<string, number[]>();
for (const t of main.trades) (by.get(t.city) ?? by.set(t.city, []).get(t.city)!).push(t.r);
out.push("**По градове:** " + [...by].sort().map(([c, v]) => `${c} ${v.length}: ${fmt(mean(v), 3)}`).join("; "), "");
const bm = new Map<string, number[]>();
for (const t of main.trades) (bm.get(t.day.slice(0, 7)) ?? bm.set(t.day.slice(0, 7), []).get(t.day.slice(0, 7))!).push(t.r);
out.push("**По месеци:** " + [...bm].sort().map(([c, v]) => `${c} ${v.length}: ${fmt(mean(v), 3)}`).join("; "), "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/weather-botreplica.md", text + "\n");
