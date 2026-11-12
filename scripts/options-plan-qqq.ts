/** Builds scripts/options-plan-qqq.json for N4 (experiments/options-dt3-preregistration.md): for every DT3 (09:50) trade day
 * 2024-02-01..2026-09-30 the 0DTE QQQ option symbols (ATM + 0.5% OTM) and the 09:50-16:00 ET window in UTC.
 * Run: npx tsx scripts/options-plan-qqq.ts */
import { readFileSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../src/data/intraday.js";
import { completeSessions, loadCalendar, toSessions } from "../src/intraday/sessions.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const ss = completeSessions(toSessions(loadMinuteBars(D, "QQQ", "2024-01", "2026-09", "alpaca"), cal), cal).kept.filter((s) => s.date >= "2024-02-01");
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const occ = (date: string, cp: "C" | "P", k: number) => `QQQ${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}${cp}${String(Math.round(k * 1000)).padStart(8, "0")}`;
const plan: unknown[] = [];
for (const s of ss) {
  if (fomc.has(s.date) || s.minute[0] !== 570 || s.minute[4] !== 574) continue;
  const i0 = s.minute.indexOf(590);
  if (i0 < 5) continue;
  const o0 = s.o[0]!, c4 = s.c[4]!;
  if (c4 === o0) continue;
  const dir = c4 > o0 ? 1 : -1;
  const stop = dir === 1 ? Math.min(...s.l.slice(0, 5)) : Math.max(...s.h.slice(0, 5));
  let touched = false;
  for (let i = 5; i < i0; i++) if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) touched = true;
  const S = s.o[i0]!;
  if (touched || !(dir * (S - stop) > 0)) continue;
  let stopMin: number | null = null;
  for (let i = i0; i < s.minute.length; i++) if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) { stopMin = s.minute[i]!; break; }
  const j = s.minute.indexOf(955), p1555 = j >= 0 ? s.o[j]! : s.c[s.c.length - 1]!;
  const cp = dir === 1 ? "C" : "P", kA = Math.round(S), kO = Math.round(S * (1 + 0.005 * dir));
  const nyHour = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(`${s.date}T14:00:00Z`));
  const off = 14 - nyHour;
  const hh = (h: number, m: number) => `${s.date}T${String(h + off).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  plan.push({ date: s.date, dir, S, stop, stopMin, p1555, off, kA, kO, start: hh(9, 50), end: hh(16, 0), legs: { atm: occ(s.date, cp, kA), otm: occ(s.date, cp, kO) } });
}
writeFileSync("scripts/options-plan-qqq.json", JSON.stringify(plan));
console.log(plan.length, "days; first", JSON.stringify(plan[0]), "last", JSON.stringify(plan.at(-1)));
