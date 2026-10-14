/**
 * DT6: Stocks-in-Play ORB + pre-open news (experiments/dt6-preregistration.md).
 * Needs data/branch and the newsdata branch at data/news. Run: npx tsx src/cli/dt6.ts   Writes reports/dt6.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { byYear, perf, type DayRet } from "../daytrade/dt.js";
import { candidates, portfolio, type SymDay } from "../daytrade/dt6.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch", N = process.argv[2] ?? "data/news";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const SYMS = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "INTC", "BA", "XOM", "PFE"];
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const days = sessions("SPY").map((s) => s.date).filter((d) => d >= "2016-02-01");
const cands: SymDay[] = [];
const newsCount: Record<string, number> = {};
for (const sym of SYMS) {
  const p = `${N}/news/${sym}.json.gz`;
  const news = existsSync(p) ? (JSON.parse(gunzipSync(readFileSync(p)).toString()) as [string, number, string][]).map((x) => Date.parse(x[0])).sort((a, b) => a - b) : [];
  newsCount[sym] = news.length;
  cands.push(...candidates(sym, sessions(sym), news).filter((c) => c.date >= "2016-02-01"));
  console.error(`${sym}: ${news.length} news items`);
}
const boot = (rs: DayRet[]) => bootstrapByDay(rs.map((x) => ({ day: x.day, r: x.r })));
const between = (rs: DayRet[], a: string, b: string) => rs.filter((x) => x.day >= a && x.day <= b);
const head = ["| Вариант | Сделки | Год. доходност | Sharpe | Макс. спад | Bootstrap > 0 | След публикуването (2024-05 –): Sharpe · год. |", "| --- | --- | --- | --- | --- | --- | --- |"];
const line = (name: string, rs: DayRet[]) => { const p = perf(rs), o = perf(between(rs, "2024-05-01", "2026-09-30")); return `| ${name} | ${p.trades} | ${fmt(100 * p.cagr, 1)}% | ${fmt(p.sharpe, 2)} | ${fmt(100 * p.mdd, 1)}% | ${fmt(100 * boot(rs), 1)}% | ${fmt(o.sharpe, 2)} · ${fmt(100 * o.cagr, 1)}% |`; };
const verdict = (rs: DayRet[]) => { const p = perf(rs), b = boot(rs), o = perf(between(rs, "2024-05-01", "2026-09-30")); const c2 = p.meanDaily > 0 && b >= 0.95, c3 = o.meanDaily > 0 && o.sharpe >= 0.5; return c2 && c3 ? "GO (за бота, на хартия)" : c2 ? "слабо" : "STOP"; };

const C = 0.0045;
const main = portfolio(days, cands, (c) => c.relVol >= 1, C);
const withNews = portfolio(days, cands, (c) => c.relVol >= 1 && c.hasNews, C);
const noNews = portfolio(days, cands, (c) => c.relVol >= 1 && !c.hasNews, C);
// does news help? bootstrap of the difference in mean daily return (news minus no news), blocks of 5 days
const diff = withNews.map((x, i) => x.r - noNews[i]!.r);
const rnd = mulberry32(77);
let pos = 0;
for (let rep = 0; rep < 2000; rep++) { let s = 0; for (let k = 0; k < diff.length;) { const st = Math.floor(rnd() * diff.length); for (let j = 0; j < 5 && k < diff.length; j++, k++) s += diff[(st + j) % diff.length]!; } if (s > 0) pos++; }
const cnt = (f: (c: SymDay) => boolean) => cands.filter(f).length;
const out: string[] = ["# DT6: ORB на „Stocks in Play“ + новини: резултати", "", "Правила: `experiments/dt6-preregistration.md`. Нетно, $0.0045 на акция и страна.", "",
  `Новини (Alpaca/Benzinga): ${SYMS.map((s) => `${s} ${newsCount[s]}`).join(", ")}.`, "",
  `Дни-акции, минали филтрите: ${cands.length}; от тях RelVol ≥ 1: ${cnt((c) => c.relVol >= 1)}; с новина преди отварянето: ${cnt((c) => c.relVol >= 1 && c.hasNews)}.`, "",
  "## Присъда", "", `- **DT6 основен:** ${verdict(main)}`, `- **DT6-N (само с новина):** ${verdict(withNews)}`, "", ...head,
  line("**DT6 основен** (RelVol ≥ 1)", main), line("**DT6-N** (RelVol ≥ 1 и новина)", withNews), line("DT6-noN (RelVol ≥ 1, без новина)", noNews),
  line("RelVol ≥ 2 (описателно)", portfolio(days, cands, (c) => c.relVol >= 2, C)), line("RelVol ≥ 2 и новина (описателно)", portfolio(days, cands, (c) => c.relVol >= 2 && c.hasNews, C)),
  line("всички, без RelVol филтър (описателно)", portfolio(days, cands, () => true, C)), line("основен, $0.01/акция", portfolio(days, cands, (c) => c.relVol >= 1, 0.01)), "",
  `**Помагат ли новините?** Средна дневна разлика (с новина − без новина): ${fmt(10000 * diff.reduce((a, b) => a + b, 0) / diff.length, 2)} bp; bootstrap > 0 в ${fmt((100 * pos) / 2000, 1)}% от повторенията.`, "",
  "**По години (основен / с новина), %:** " + [...byYear(main)].map(([y, r]) => `${y}: ${fmt(100 * r, 1)} / ${fmt(100 * (byYear(withNews).get(y) ?? 0), 1)}`).join("; "), ""];
const text = out.join("\n");
console.log(text);
writeFileSync("reports/dt6.md", text + "\n");
