/**
 * Asia session 15-min ORB + volume + retest (experiments/asia-orb-preregistration.md) on Binance BTC, ETH, PAXG.
 * Run: npx tsx src/cli/asia-orb.ts   Writes reports/asia-orb.md
 */
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { ASIA_MAIN, asiaTrade, asiaWithDirection, type AsiaDay, type AsiaOpts } from "../ict/asiaOrb.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch", FEE = 0.0005;
const fmtNy = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const off = new Map<number, number>();
const nyOffset = (ms: number) => { // minutes to add to UTC for New York, cached per UTC hour
  const hk = Math.floor(ms / 3600_000);
  let v = off.get(hk);
  if (v === undefined) { const p = Object.fromEntries(fmtNy.formatToParts(new Date(hk * 3600_000)).map((x) => [x.type, x.value])); v = (Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - hk * 3600_000) / 60000; off.set(hk, v); }
  return v;
};
function days(sym: string, from: string): AsiaDay[] {
  const b = loadMinuteBars(D, sym, from, "2026-09", "binance");
  const by = new Map<string, { m: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }>();
  for (let i = 0; i < b.t.length; i++) {
    const loc = b.t[i]! + nyOffset(b.t[i]!) * 60000;
    const iso = new Date(loc).toISOString(), mod = +iso.slice(11, 13) * 60 + +iso.slice(14, 16);
    if (mod < 18 * 60) continue; // the session runs 18:00 -> 23:59 New York (m 0..359); trades end by 22:00 at the latest
    const date = iso.slice(0, 10), m = mod - 18 * 60;
    let d = by.get(date);
    if (!d) { d = { m: [], o: [], h: [], l: [], c: [], v: [] }; by.set(date, d); }
    d.m.push(m); d.o.push(b.o[i]!); d.h.push(b.h[i]!); d.l.push(b.l[i]!); d.c.push(b.c[i]!); d.v.push(b.v[i]!);
  }
  return [...by.entries()].sort(([a], [z]) => (a < z ? -1 : 1)).map(([date, d]) => ({ date, ...d }));
}
interface Row { inst: string; day: string; gross: number; net: number; rnd: number }
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
function run(opt: AsiaOpts, data: [string, AsiaDay[]][]): Row[] {
  const out: Row[] = [];
  for (const [inst, ds] of data) {
    const rnd = mulberry32(7);
    for (const d of ds) {
      const t = asiaTrade(d, opt);
      if (!t) continue;
      const cost = (2 * FEE * Math.abs(t.entry)) / Math.abs(t.entry - t.stop);
      let rr = 0;
      for (let k = 0; k < 100; k++) rr += asiaWithDirection(d, t, rnd() < 0.5 ? 1 : -1, opt);
      out.push({ inst, day: d.date, gross: t.r, net: t.r - cost, rnd: rr / 100 - cost });
    }
  }
  return out;
}
function sharpe(rs: Row[]) {
  const by = new Map<string, number[]>();
  for (const r of rs) (by.get(r.day) ?? by.set(r.day, []).get(r.day)!).push(r.net);
  const d = [...by.values()].map(mean), m = mean(d), sd = Math.sqrt(mean(d.map((x) => (x - m) ** 2)));
  return (m / sd) * Math.sqrt(252);
}
function line(name: string, rs: Row[]) {
  if (!rs.length) return `| ${name} | 0 | | | | | | | |`;
  const late = rs.filter((r) => r.day >= "2023-01-01"), boot = bootstrapByDay(rs.map((r) => ({ day: r.day, r: r.net })));
  const c2 = mean(rs.map((r) => r.net)) > 0 && boot >= 0.95, c3 = mean(late.map((r) => r.net)) > 0 && sharpe(late) >= 0.5;
  return `| ${name} | ${rs.length} | ${fmt(100 * rs.filter((r) => r.gross > 0).length / rs.length, 0)}% | ${fmt(mean(rs.map((r) => r.gross)), 3)} | **${fmt(mean(rs.map((r) => r.net)), 3)}** | ${fmt(mean(rs.map((r) => r.rnd)), 3)} | ${fmt(100 * boot, 1)}% | ${fmt(mean(late.map((r) => r.net)), 3)} · ${fmt(sharpe(late), 2)} | ${c2 && c3 ? "GO (на хартия)" : c2 ? "слабо" : "STOP"} |`;
}
const data: [string, AsiaDay[]][] = [["BTC", days("BTCUSDT", "2020-01")], ["ETH", days("ETHUSDT", "2020-01")], ["PAXG", days("PAXGUSDT", "2020-09")]];
const main = run(ASIA_MAIN, data), noVol = run({ ...ASIA_MAIN, volMult: 0 }, data), t2 = run({ ...ASIA_MAIN, targetR: 2 }, data);
const head = ["| Вариант | Сделки | Печеливши | Бруто R | Нето R | Случайна посока, нето R | Bootstrap > 0 | 2023–2026: нето R · Sharpe | Решение |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
const out = ["# Asia session 15-min ORB + обем + ретест: резултати", "", "Правила: `experiments/asia-orb-preregistration.md`. Binance 1 минута; разход 0.05% на страна; R = печалба / риск (стоп в средата на диапазона).", "",
  "## Присъда", "", ...head, line("**P1: BTC + ETH + PAXG**", main), "",
  "## Детайли", "", ...head, ...["BTC", "ETH", "PAXG"].map((i) => line(i, main.filter((r) => r.inst === i))), line("без условие за обема (всички)", noVol), line("с цел 2R (всички)", t2), "",
  "**По години (P1, средно нето R):** " + [...new Set(main.map((r) => r.day.slice(0, 4)))].sort().map((y) => `${y}: ${fmt(mean(main.filter((r) => r.day.startsWith(y)).map((r) => r.net)), 3)}`).join(" · "), "",
  `Дни с данни: ${data.map(([i, d]) => `${i} ${d.length}`).join(", ")}.`, ""];
const text = out.join("\n");
console.log(text);
writeFileSync("reports/asia-orb.md", text + "\n");
