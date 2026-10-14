/**
 * Pre-registered FOMC filter check (experiments/dt6-preregistration.md, addendum): mean net daily return on FOMC statement days
 * vs other days, for DT1 (SPY) and DT3 (QQQ), in 2016-2020 and 2021-2026. Run: npx tsx src/cli/fomc-check.ts
 */
import { readFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { COST_PER_SHARE, dt1, dt3, type DayRet } from "../daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function report(name: string, rs: DayRet[]) {
  for (const [a, b] of [["2016-01-01", "2020-12-31"], ["2021-01-01", "2026-09-30"]] as const) {
    const p = rs.filter((x) => x.day >= a && x.day <= b);
    const f = p.filter((x) => fomc.has(x.day)).map((x) => x.r), o = p.filter((x) => !fomc.has(x.day)).map((x) => x.r);
    console.log(`${name} ${a.slice(0, 4)}-${b.slice(0, 4)}: FOMC days ${f.length}, mean ${fmt(10000 * mean(f), 1)} bp | other days ${o.length}, mean ${fmt(10000 * mean(o), 1)} bp -> FOMC ${mean(f) < mean(o) ? "worse" : "better"}`);
  }
}
const SPY = sessions("SPY"), QQQ = sessions("QQQ");
report("DT1 SPY", dt1(SPY, { dynamic: true, execNextOpen: true, cost: COST_PER_SHARE }));
report("DT3 QQQ", dt3(QQQ, COST_PER_SHARE));
