/** Builds scripts/options-plan.json: for every SPY session 2024-02-01..2026-09-30, the 0DTE option symbols N3 needs
 * (iron condor legs + ATM straddle, experiments/new3-preregistration.md) and the 09:55-10:05 ET window in UTC.
 * Run: npx tsx scripts/options-plan.ts */
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../src/data/intraday.js";
import { completeSessions, loadCalendar, toSessions } from "../src/intraday/sessions.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const ss = completeSessions(toSessions(loadMinuteBars(D, "SPY", "2024-02", "2026-09", "alpaca"), cal), cal).kept;
const occ = (date: string, cp: "C" | "P", k: number) => `SPY${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}${cp}${String(Math.round(k * 1000)).padStart(8, "0")}`;
const plan: { date: string; S: number; start: string; end: string; legs: Record<string, string> }[] = [];
for (const s of ss) {
  const i = s.minute.indexOf(599); // the 09:59 bar
  if (i < 0) continue;
  const S = s.c[i]!;
  const kSC = Math.ceil(S * 1.005), kSP = Math.floor(S * 0.995), kLC = Math.ceil(S * 1.01), kLP = Math.floor(S * 0.99), kA = Math.round(S);
  // UTC time of 09:55 New York on that date: offset from the 09:59 bar timestamp is not stored in Session, so use Intl
  const probe = new Date(`${s.date}T14:00:00Z`);
  const nyHour = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(probe);
  const off = 14 - nyHour; // 4 in summer, 5 in winter
  const hh = (h: number, m: number) => `${s.date}T${String(h + off).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  plan.push({ date: s.date, S, start: hh(9, 55), end: hh(10, 6), legs: { sc: occ(s.date, "C", kSC), sp: occ(s.date, "P", kSP), lc: occ(s.date, "C", kLC), lp: occ(s.date, "P", kLP), ac: occ(s.date, "C", kA), ap: occ(s.date, "P", kA) } });
}
writeFileSync("scripts/options-plan.json", JSON.stringify(plan));
console.log(plan.length, "days; first", JSON.stringify(plan[0]), "last", JSON.stringify(plan.at(-1)));
