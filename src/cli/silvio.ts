/**
 * silviotrades supply/demand entry model (experiments/silvio-sd-preregistration.md) on QQQ + DIA (+ SPY descriptive).
 * Run: npx tsx src/cli/silvio.ts   Writes reports/silvio-sd.md
 */
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";
import { silvioTrades, V1, V2, type DayTrade, type RunOpts } from "../social/silvio.js";

const D = "data/branch", LATE = "2021-07-01", C = 0.0045;
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const S: Record<string, Session[]> = {};
for (const sym of ["QQQ", "DIA", "SPY"]) S[sym] = completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const days = [...new Set(Object.values(S).flatMap((ss) => ss.map((s) => s.date)))].sort();

type T = DayTrade & { inst: string };
const run = (syms: string[], o: RunOpts): T[] => syms.flatMap((sym) => silvioTrades(S[sym]!, o).map((t) => ({ ...t, inst: sym })));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
function sharpe(ts: T[], from: string) {
  const ds = days.filter((d) => d >= from), by = new Map<string, number>();
  for (const t of ts) if (t.date >= from) by.set(t.date, (by.get(t.date) ?? 0) + t.r);
  const r = ds.map((d) => by.get(d) ?? 0), m = mean(r), sd = Math.sqrt(mean(r.map((x) => (x - m) ** 2)));
  return (m / sd) * Math.sqrt(252);
}
function row(name: string, ts: T[]) {
  if (!ts.length) return `| ${name} | 0 | | | | | |`;
  const r = ts.map((t) => t.r), late = ts.filter((t) => t.date >= LATE), boot = bootstrapByDay(ts.map((t) => ({ day: t.date, r: t.r })));
  const lm = mean(late.map((t) => t.r)), ls = sharpe(ts, LATE), c2 = mean(r) > 0 && boot >= 0.95, c3 = lm > 0 && ls >= 0.5;
  return `| ${name} | ${ts.length} | ${fmt(100 * ts.filter((t) => t.r > 0).length / ts.length, 0)}% | **${fmt(mean(r), 3)}** | ${fmt(100 * boot, 1)}% | ${late.length} · ${fmt(lm, 3)} · ${fmt(ls, 2)} | ${c2 && c3 ? "GO (на хартия)" : c2 ? "слабо" : "STOP"} |`;
}
const head = ["| Вариант | Сделки | Печеливши | Средно R | Bootstrap > 0 | 2021-07 –: сделки · R · Sharpe | Решение |", "| --- | --- | --- | --- | --- | --- | --- |"];
const MAIN: RunOpts = { rr: 2, cost: C, trend: true, th: V2 }, P1 = ["QQQ", "DIA"];
const main = run(P1, MAIN);
let rs = 0, beat = 0;
for (let k = 0; k < 100; k++) { const rnd = mulberry32(500 + k); const m = mean(run(P1, { ...MAIN, flip: () => rnd() < 0.5 }).map((t) => t.r)); rs += m; if (mean(main.map((t) => t.r)) > m) beat++; }
const kinds = (ts: T[]) => { let st = 0, tg = 0, tm = 0; for (const t of ts) { const d = t.dir; if (d * (t.exit - t.stop) <= 1e-9) st++; else if (d * (t.exit - t.target) >= -1e-9) tg++; else tm++; } return `стоп ${st}, цел ${tg}, при затварянето ${tm}`; };
const out = ["# silviotrades „big candle, small candle with big wick“: резултати", "", "Правила: `experiments/silvio-sd-preregistration.md`. QQQ вместо NQ, DIA вместо YM; редовна сесия; нетно, $0.0045 на акция и страна; R = печалба / риск.", "",
  "## Присъда", "", ...head, row("v1 (първите прагове): неубедително, твърде малко сделки", run(P1, { ...MAIN, th: V1 })), row("**P1 (v2): QQQ + DIA, цел 2R**", main), "",
  `Случайна посока (същите входове и разстояния, 100 повторения): средно ${fmt(rs / 100, 3)} R; стратегията е по-добра в ${beat} от 100.`, "",
  `Изходи (P1, v2): ${kinds(main)}. Сделки на година: ${fmt(main.length / 10.75, 0)}. Покупки ${main.filter((t) => t.dir === 1).length}, продажби ${main.filter((t) => t.dir === -1).length}.`, "",
  "## Описателно (v2)", "", ...head,
  row("QQQ", main.filter((t) => t.inst === "QQQ")), row("DIA", main.filter((t) => t.inst === "DIA")), row("SPY", run(["SPY"], MAIN)),
  row("цел 1R", run(P1, { ...MAIN, rr: 1 })), row("без филтъра за тренд", run(P1, { ...MAIN, trend: false })), row("без разходи", run(P1, { ...MAIN, cost: 0 })), "",
  "## По години (P1 v2, средно R · брой)", "", [...new Set(main.map((t) => t.date.slice(0, 4)))].sort().map((y) => { const a = main.filter((t) => t.date.startsWith(y)); return `${y}: ${fmt(mean(a.map((t) => t.r)), 3)} · ${a.length}`; }).join("; "), "",
  "Проверка: независим Python код (`scripts/research/xcheck_silvio.py`, писан по текста на правилата) за QQQ (v2) дава същите 77 сделки (дата, посока, вход, изход, R).", "",
  "Самокритика: v1 (праговете, записани първо) даде само 9 сделки за 10 години. v2 е с по-меки прагове, избрани по броя сетъпи (без да гледам резултата) и записани преди пускането (`experiments/silvio-sd-preregistration.md`, добавка v2).", "",
  `Данни: ${Object.entries(S).map(([k, v]) => `${k} ${v.length} сесии (${v[0]!.date} – ${v.at(-1)!.date})`).join("; ")}.`, ""];
const text = out.join("\n");
console.log(text);
writeFileSync("reports/silvio-sd.md", text + "\n");
