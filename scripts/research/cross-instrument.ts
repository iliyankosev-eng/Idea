// experiments/cross-instrument-preregistration.md - every earlier strategy on 18 instruments.
import { readFileSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../../src/data/intraday.js";
import { COST_PER_SHARE as C, dt1, dt2, dt3, dt3Late, dt4, type DayRet } from "../../src/daytrade/dt.js";
import { dt7, dt8 } from "../../src/daytrade/dt78.js";
import { n1 } from "../../src/daytrade/new3.js";
import { fibTrades, type Bars } from "../../src/fib/confluence.js";
import { costR, firstCandleTrade } from "../../src/ict/firstCandle.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../../src/intraday/sessions.js";
import { segments, splitDays } from "../../src/intraday/splits.js";
import { bootstrapByDay } from "../../src/pm/common.js";
import { sessionTrades } from "../../src/social/ffcc.js";
import { rangeTrade } from "../../src/social/rangebot.js";
import { silvioTrades, V2 } from "../../src/social/silvio.js";

const D = "data/branch", cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const SYMS = ["SPY", "QQQ", "DIA", "IWM", "GLD", "SLV", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "INTC", "BA", "XOM", "PFE"];
const ORIG: Record<string, string[]> = { DT1: ["SPY", "QQQ"], DT2: ["QQQ"], DT3: ["QQQ"], "DT3-bot": ["QQQ"], DT4: ["SPY"], DT7: ["SPY", "QQQ"], DT8: ["SPY", "QQQ"], N1: ["SPY", "QQQ"], FFCC: ["SPY", "QQQ"], "Range A": ["QQQ"], "Range B": ["QQQ"], Silvio: ["QQQ", "DIA"], Fib: ["QQQ", "GLD"], "First candle": ["SPY", "QQQ", "IWM", "GLD"] };
const DAILY = new Set(["DT1", "DT2", "DT3", "DT3-bot", "DT4", "DT7", "DT8", "N1"]);
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const END = "2026-10-31";
type Pt = { day: string; r: number };
const res: Record<string, Record<string, Pt[]>> = {}; // strategy -> symbol -> daily returns (daily family) or trades (R family)
const put = (st: string, sym: string, x: Pt[]) => { (res[st] ??= {})[sym] = x.filter((p) => p.day >= "2016-01-01" && p.day <= END); };
const hours = (ss: readonly Session[]): Bars => {
  const day: string[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
  for (const s of ss) { let cur = -1; for (let i = 0; i < s.minute.length; i++) { const m = s.minute[i]!; if (m < 570 || m >= 960) continue; const k = Math.floor((m - 570) / 60); if (k !== cur) { cur = k; day.push(s.date); o.push(s.o[i]!); h.push(s.h[i]!); l.push(s.l[i]!); c.push(s.c[i]!); continue; } const j = c.length - 1; h[j] = Math.max(h[j]!, s.h[i]!); l[j] = Math.min(l[j]!, s.l[i]!); c[j] = s.c[i]!; } }
  return { day, o, h, l, c };
};
const notes: string[] = [];
for (const sym of SYMS) {
  const t0 = Date.now();
  const ss = completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-10", "alpaca"), cal), cal).kept;
  const rows = readFileSync(`${D}/daily/alpaca/${sym}.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r[0]! <= END);
  const daily = { date: rows.map((r) => r[0]!), c: rows.map((r) => Number(r[4])) };
  const sp = splitDays(ss, daily), seg = segments(ss, sp);
  notes.push(`${sym}: ${ss.length} sessions ${ss[0]?.date}..${ss.at(-1)?.date}; split days: ${[...sp].join(", ") || "none"}`);
  const per = <T>(f: (x: Session[]) => T[]) => seg.flatMap(f);
  const dr = (x: DayRet[]): Pt[] => x.map((d) => ({ day: d.day, r: d.r }));
  put("DT1", sym, dr(per((x) => dt1(x, { dynamic: true, execNextOpen: true, cost: C, maxLev: 2, exitMin: 955 }))));
  put("DT2", sym, dr(per((x) => dt2(x, C))));
  put("DT3", sym, dr(per((x) => dt3(x, C))));
  put("DT3-bot", sym, dr(per((x) => dt3Late(x, C, 20, 2))).map((p) => (fomc.has(p.day) ? { ...p, r: 0 } : p)));
  put("DT4", sym, dr(per((x) => dt4(x, C))));
  put("DT7", sym, dr(per((x) => dt7(x, C))));
  put("N1", sym, dr(per((x) => n1(x, { cost: C }))));
  { // DT8 on adjusted daily closes, cost as a fraction of the raw close
    const rawClose = new Map(ss.map((s) => [s.date, s.c[s.c.length - 1]!]));
    const d8 = dt8(daily, 0);
    put("DT8", sym, d8.map((x) => ({ day: x.day, r: x.trades ? x.r - 2 * C / (rawClose.get(x.day) ?? Infinity) : x.r })));
  }
  put("FFCC", sym, per((x) => x.flatMap((s) => sessionTrades(s, { len: 5, target: "1.5R", stop: "extreme", cost: C }))).map((t) => ({ day: t.date, r: t.r })));
  put("Range A", sym, per((x) => x.flatMap((s) => { const t = rangeTrade(s, 0.5, 0.5); return t ? [{ day: t.date, r: t.r }] : []; })));
  put("Range B", sym, per((x) => x.flatMap((s) => { const t = rangeTrade(s, 0.25, 0.75); return t ? [{ day: t.date, r: t.r }] : []; })));
  put("Silvio", sym, per((x) => (x.length > 30 ? silvioTrades(x, { rr: 2, cost: C, trend: true, th: V2 }) : [])).map((t) => ({ day: t.date, r: t.r })));
  put("Fib", sym, per((x) => { const b = hours(x); return b.c.length > 300 ? fibTrades(b, { confirm: "rsi", stopMode: "L", holdBars: 14, cost: () => 2 * C }) : []; }).map((t) => ({ day: t.day, r: t.r })));
  put("First candle", sym, per((x) => x.flatMap((s) => { const d = { date: s.date, m: s.minute, o: s.o, h: s.h, l: s.l, c: s.c }; const t = firstCandleTrade(d, { orStart: 570, lastEntry: 720, exitMin: 959 }); return t ? [{ day: s.date, r: t.r - costR(d, t, C) }] : []; })));
  console.error(`${sym} done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync("reports/cross-instrument.json", JSON.stringify({ res, notes }));
console.error("saved reports/cross-instrument.json");
