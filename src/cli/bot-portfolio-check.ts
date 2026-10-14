/**
 * Post-hoc: the candidate bot portfolio (DT3 QQQ without FOMC days + DT8 SPY), 50/50 of capital, vs buy and hold.
 * Run: npx tsx src/cli/bot-portfolio-check.ts
 */
import { readFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { byYear, COST_PER_SHARE, dt1, dt3, perf, type DayRet } from "../daytrade/dt.js";
import { dt8 } from "../daytrade/dt78.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const rows = readFileSync(`${D}/daily/alpaca/SPY.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r[0]! <= "2026-09-30");
const spyD = { date: rows.map((r) => r[0]!), c: rows.map((r) => Number(r[4])) };
const a = dt3(sessions("QQQ"), COST_PER_SHARE).map((x) => (fomc.has(x.day) ? { ...x, r: 0, trades: 0 } : x));
const b = new Map(dt8(spyD, COST_PER_SHARE).map((x) => [x.day, x.r]));
const c = new Map(dt1(sessions("SPY"), { dynamic: true, execNextOpen: true, cost: COST_PER_SHARE }).map((x) => [x.day, x.r]));
const hold = new Map(spyD.c.slice(1).map((v, i) => [spyD.date[i + 1]!, v / spyD.c[i]! - 1]));
const combo: DayRet[] = a.map((x) => ({ day: x.day, r: 0.5 * x.r + 0.5 * (b.get(x.day) ?? 0), trades: 1 }));
const combo3: DayRet[] = a.map((x) => ({ day: x.day, r: (x.r + (b.get(x.day) ?? 0) + (c.get(x.day) ?? 0)) / 3, trades: 1 }));
const hh: DayRet[] = a.map((x) => ({ day: x.day, r: hold.get(x.day) ?? 0, trades: 0 }));
const p = (n: string, rs: DayRet[]) => { const q = perf(rs); console.log(`${n.padEnd(44)} год. ${fmt(100 * q.cagr, 1).padStart(5)}%  Sharpe ${fmt(q.sharpe, 2)}  MDD ${fmt(100 * q.mdd, 1)}%  boot ${fmt(100 * bootstrapByDay(rs.map((y) => ({ day: y.day, r: y.r }))), 1)}%`); };
const lateOnly = (rs: DayRet[]) => rs.filter((x) => x.day >= "2021-01-01");
p("DT3 QQQ без FOMC", a); p("50/50 DT3 + DT8", combo); p("1/3 DT3 + DT8 + DT1", combo3); p("Купи и дръж SPY", hh);
p("50/50 DT3 + DT8, 2021-2026", lateOnly(combo)); p("Купи и дръж SPY, 2021-2026", lateOnly(hh));
let cv = 0, va = 0, vb = 0; const ma = a.reduce((s, x) => s + x.r, 0) / a.length, mb = a.reduce((s, x) => s + (b.get(x.day) ?? 0), 0) / a.length;
for (const x of a) { const y = b.get(x.day) ?? 0; cv += (x.r - ma) * (y - mb); va += (x.r - ma) ** 2; vb += (y - mb) ** 2; }
console.log(`corr(DT3, DT8) = ${fmt(cv / Math.sqrt(va * vb), 2)}`);
console.log("by year 50/50 vs SPY: " + [...byYear(combo)].map(([y, r]) => `${y} ${fmt(100 * r, 1)}/${fmt(100 * (byYear(hh).get(y) ?? 0), 1)}`).join("  "));
