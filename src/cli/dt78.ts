/**
 * DT7 overnight + DT8 RSI(2) (experiments/dt78-preregistration.md). Run: npx tsx src/cli/dt78.ts   Writes reports/dt78.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { byYear, COST_PER_SHARE, perf, type DayRet } from "../daytrade/dt.js";
import { dt7, dt8, type Daily } from "../daytrade/dt78.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const daily = (sym: string): Daily => {
  const rows = readFileSync(`${D}/daily/alpaca/${sym}.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r[0]! <= "2026-09-30");
  return { date: rows.map((r) => r[0]!), c: rows.map((r) => Number(r[4])) };
};
const hold = (d: Daily): DayRet[] => d.c.slice(1).map((c, i) => ({ day: d.date[i + 1]!, r: c / d.c[i]! - 1, trades: 0 }));
const between = (rs: DayRet[], a: string, b: string) => rs.filter((x) => x.day >= a && x.day <= b);
const boot = (rs: DayRet[]) => bootstrapByDay(rs.map((x) => ({ day: x.day, r: x.r })));
const head = ["| Вариант | Период | Сделки | Год. доходност | Sharpe | Макс. спад | Bootstrap > 0 |", "| --- | --- | --- | --- | --- | --- | --- |"];
const line = (n: string, rs: DayRet[]) => { const p = perf(rs); return `| ${n} | ${rs[0]?.day} – ${rs.at(-1)?.day} | ${p.trades} | ${fmt(100 * p.cagr, 1)}% | ${fmt(p.sharpe, 2)} | ${fmt(100 * p.mdd, 1)}% | ${fmt(100 * boot(rs), 1)}% |`; };
const verdict = (rs: DayRet[]) => { const p = perf(rs), b = boot(rs), o = perf(between(rs, "2021-01-01", "2026-09-30")); const c2 = p.meanDaily > 0 && b >= 0.95, c3 = o.meanDaily > 0 && o.sharpe >= 0.5; return `${c2 && c3 ? "GO (за бота, на хартия)" : c2 ? "слабо" : "STOP"} (C2 ${c2 ? "да" : "не"}, C3 ${c3 ? "да" : "не"}; 2021–2026 Sharpe ${fmt(o.sharpe, 2)})`; };

const SPY = sessions("SPY"), QQQ = sessions("QQQ");
const d7 = dt7(SPY, COST_PER_SHARE), d7q = dt7(QQQ, COST_PER_SHARE);
const dS = daily("SPY"), dQ = daily("QQQ");
const d8 = dt8(dS, COST_PER_SHARE);
const out = ["# DT7 (нощна позиция) и DT8 (RSI(2)): резултати", "", "Правила: `experiments/dt78-preregistration.md`. Нетно, $0.0045 на акция и страна.", "",
  "## Присъда", "", `- **DT7 нощна позиция SPY:** ${verdict(d7)}`, `- **DT8 RSI(2) SPY:** ${verdict(d8)}`, "", "## Детайли", "", ...head,
  line("**DT7 SPY** нощ (затваряне → отваряне)", d7), line("SPY ден (отваряне → затваряне), справка", dt7(SPY, COST_PER_SHARE, true)), line("DT7 QQQ (описателно)", d7q),
  line("DT7 SPY 2021–2026", between(d7, "2021-01-01", "2026-09-30")),
  line("**DT8 SPY** RSI(2)", d8), line("DT8 SPY 2021–2026", between(d8, "2021-01-01", "2026-09-30")), line("DT8 QQQ (описателно)", dt8(dQ, COST_PER_SHARE)),
  line("Купи и дръж SPY (коригирано, справка)", hold(dS)), line("Купи и дръж QQQ (справка)", hold(dQ)), "",
  "**По години (%):** " + [...byYear(d7)].map(([y, r]) => `${y}: DT7 ${fmt(100 * r, 1)} / DT8 ${fmt(100 * (byYear(d8).get(y) ?? 0), 1)} / SPY ${fmt(100 * (byYear(hold(dS)).get(y) ?? 0), 1)}`).join("; "), "",
  `**Дял на дните в позиция:** DT7 ${fmt((100 * d7.filter((x) => x.trades).length) / d7.length, 0)}%, DT8 ${fmt((100 * d8.filter((x) => x.r !== 0).length) / d8.length, 0)}%.`, ""];
const text = out.join("\n");
console.log(text);
writeFileSync("reports/dt78.md", text + "\n");
