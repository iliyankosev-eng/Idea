/**
 * Post-hoc robustness checks for DT1 and DT3 (added AFTER the results; they do not change the pre-registered verdicts).
 * Run: npx tsx src/cli/daytrade5-check.ts
 */
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { byYear, dt1, dt3, perf, type DayRet } from "../daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const SPY = sessions("SPY"), QQQ = sessions("QQQ");
const between = (rs: DayRet[], a: string, b: string) => rs.filter((x) => x.day >= a && x.day <= b);
const line = (name: string, rs: DayRet[]) => { const p = perf(rs); return `${name.padEnd(46)} Sharpe ${fmt(p.sharpe, 2).padStart(6)}  год. ${fmt(100 * p.cagr, 1).padStart(6)}%  MDD ${fmt(100 * p.mdd, 1).padStart(6)}%  boot ${fmt(100 * bootstrapByDay(rs.map((x) => ({ day: x.day, r: x.r }))), 1)}%`; };
console.log("--- cost per share and side (DT3 QQQ / DT1 SPY) ---");
for (const c of [0.0045, 0.01, 0.02, 0.03]) {
  console.log(line(`DT3 QQQ $${c}`, dt3(QQQ, c)), "| OOS", fmt(perf(between(dt3(QQQ, c), "2024-01-01", "2026-09-30")).sharpe, 2));
  console.log(line(`DT1 SPY $${c}`, dt1(SPY, { dynamic: true, execNextOpen: true, cost: c })), "| OOS", fmt(perf(between(dt1(SPY, { dynamic: true, execNextOpen: true, cost: c }), "2024-05-01", "2026-09-30")).sharpe, 2));
}
const a = dt3(QQQ, 0.0045), b = dt1(SPY, { dynamic: true, execNextOpen: true, cost: 0.0045 }), q1 = dt1(QQQ, { dynamic: true, execNextOpen: true, cost: 0.0045 });
console.log("\n--- by year (%) ---");
const ya = byYear(a), yb = byYear(b), yq = byYear(q1);
for (const y of [...ya.keys()]) console.log(`${y}  DT3 QQQ ${fmt(100 * ya.get(y)!, 1).padStart(6)}   DT1 SPY ${fmt(100 * (yb.get(y) ?? NaN), 1).padStart(6)}   DT1 QQQ ${fmt(100 * (yq.get(y) ?? NaN), 1).padStart(6)}`);
// correlation and a 50/50 combination (same days)
const mb = new Map(b.map((x) => [x.day, x.r]));
const both = a.filter((x) => mb.has(x.day)).map((x) => ({ day: x.day, r1: x.r, r2: mb.get(x.day)! }));
const m1 = both.reduce((s, x) => s + x.r1, 0) / both.length, m2 = both.reduce((s, x) => s + x.r2, 0) / both.length;
let cv = 0, v1 = 0, v2 = 0; for (const x of both) { cv += (x.r1 - m1) * (x.r2 - m2); v1 += (x.r1 - m1) ** 2; v2 += (x.r2 - m2) ** 2; }
console.log(`\ncorrelation of daily returns DT3 QQQ vs DT1 SPY: ${fmt(cv / Math.sqrt(v1 * v2), 2)}`);
const combo: DayRet[] = both.map((x) => ({ day: x.day, r: 0.5 * x.r1 + 0.5 * x.r2, trades: 1 }));
console.log(line("50/50 DT3 QQQ + DT1 SPY, all", combo));
console.log(line("50/50, 2024-01 – 2026-09", between(combo, "2024-01-01", "2026-09-30")));
console.log(line("DT1 QQQ, 2024-05 – 2026-09", between(q1, "2024-05-01", "2026-09-30")));
console.log(line("DT3 QQQ, 2024-01 – 2026-09", between(a, "2024-01-01", "2026-09-30")));
console.log(`DT3 QQQ OOS exact Sharpe ${perf(between(a, "2024-01-01", "2026-09-30")).sharpe.toFixed(4)}`);
