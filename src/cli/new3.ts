/**
 * N1 (last 30 minutes), N2 (pre-FOMC drift), N3 (0DTE SPY iron condor), experiments/new3-preregistration.md.
 * Run: npx tsx src/cli/new3.ts [path to spy0dte_entry.json.gz]   Writes reports/new3.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { byYear, perf, type DayRet } from "../daytrade/dt.js";
import { n1, n2 } from "../daytrade/new3.js";
import { n3, type N3Day } from "../options/n3.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch", C = 0.0045;
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const sessions = (sym: string, a = "2016-01", b = "2026-09") => completeSessions(toSessions(loadMinuteBars(D, sym, a, b, "alpaca"), cal), cal).kept;
const S: Record<string, Session[]> = Object.fromEntries(["SPY", "QQQ", "IWM", "GLD"].map((s) => [s, sessions(s)]));
const boot = (rs: DayRet[]) => bootstrapByDay(rs.map((x) => ({ day: x.day, r: x.r })));
const after = (rs: DayRet[], a: string, b = "2099") => rs.filter((x) => x.day >= a && x.day < b);
const verdict = (rs: DayRet[], late: string) => { const p = perf(rs), q = perf(after(rs, late)); const c2 = p.meanDaily > 0 && boot(rs) >= 0.95, c3 = q.meanDaily > 0 && q.sharpe >= 0.5; return c2 && c3 ? "GO (на хартия)" : c2 ? "слабо" : "STOP"; };
const row = (name: string, rs: DayRet[], late: string) => { const p = perf(rs), q = perf(after(rs, late)); return `| ${name} | ${p.trades} | ${fmt(100 * p.cagr, 1)}% | ${fmt(p.sharpe, 2)} | ${fmt(100 * p.mdd, 1)}% | ${fmt(100 * boot(rs), 1)}% | ${fmt(q.sharpe, 2)} · ${fmt(100 * q.cagr, 1)}% | ${verdict(rs, late)} |`; };
const head = (late: string) => [`| Вариант | Сделки | Год. доходност | Sharpe | Макс. спад | Bootstrap > 0 | ${late}: Sharpe · год. | Решение по правилата |`, "| --- | --- | --- | --- | --- | --- | --- | --- |"];
const avg = (a: DayRet[], b: DayRet[]): DayRet[] => { const m = new Map(b.map((x) => [x.day, x])); return a.filter((x) => m.has(x.day)).map((x) => ({ day: x.day, r: (x.r + m.get(x.day)!.r) / 2, trades: x.trades + m.get(x.day)!.trades })); };

// ---------- N1 ----------
const n1s = (sym: string, o: Parameters<typeof n1>[1]) => n1(S[sym]!, o).filter((x) => x.day >= "2016-01-04");
const main = avg(n1s("SPY", { cost: C }), n1s("QQQ", { cost: C }));
const sigs = n1s("SPY", { cost: 0 }).filter((x) => x.trades);
const hit = sigs.filter((x) => Math.sign(x.r) === Math.sign(x.sig)).length / sigs.length;
const out: string[] = ["# N1–N3: резултати", "", "Правила: `experiments/new3-preregistration.md`. Нетно, $0.0045 на акция и страна, освен ако не пише друго.", "",
  "## N1: последните 30 минути следват посоката на деня (Baltussen et al. 2021)", "", ...head("2021–2026"),
  row("**N1: SPY + QQQ**", main, "2021-01-01"),
  row("SPY", n1s("SPY", { cost: C }), "2021-01-01"), row("QQQ", n1s("QQQ", { cost: C }), "2021-01-01"),
  row("SPY + QQQ, $0.01/акция", avg(n1s("SPY", { cost: 0.01 }), n1s("QQQ", { cost: 0.01 })), "2021-01-01"),
  row("SPY + QQQ, само |сигнал| > 1%", avg(n1s("SPY", { cost: C, minAbs: 0.01 }), n1s("QQQ", { cost: C, minAbs: 0.01 })), "2021-01-01"),
  row("SPY + QQQ, без разходи", avg(n1s("SPY", { cost: 0 }), n1s("QQQ", { cost: 0 })), "2021-01-01"),
  row("IWM", n1s("IWM", { cost: C }), "2021-01-01"), row("GLD", n1s("GLD", { cost: C }), "2021-01-01"),
  row("винаги лонг 15:30–16:00, SPY + QQQ (сравнение)", avg(n1s("SPY", { cost: C, alwaysLong: true }), n1s("QQQ", { cost: C, alwaysLong: true })), "2021-01-01"), "",
  `SPY, без разходи: посоката на последните 30 минути съвпада със сигнала в ${fmt(100 * hit, 1)}% от ${sigs.length} дни.`, "",
  "**По години (N1, %):** " + [...byYear(main)].map(([y, r]) => `${y}: ${fmt(100 * r, 1)}`).join("; "), ""];

// ---------- N2 ----------
const r2 = n2(S["SPY"]!, fomc, C).filter((x) => x.day >= "2016-01-04");
const ev = r2.filter((x) => x.trades);
out.push("## N2: ръст преди решението на Фед (Lucca, Moench 2015)", "", ...head("2021–2026"), row("**N2: SPY, предното затваряне → 13:59 в деня на решението**", r2, "2021-01-01"), "",
  `Събития: ${ev.length}; средно ${fmt(100 * ev.reduce((a, x) => a + x.r, 0) / ev.length, 3)}% на събитие; положителни ${fmt(100 * ev.filter((x) => x.r > 0).length / ev.length, 0)}%. ` +
  `За сравнение, средната нетна доходност на SPY от затваряне до 13:59 на следващия ден за всички дни: ${fmt(100 * n2(S["SPY"]!, new Set(S["SPY"]!.map((s) => s.date)), C).filter((x) => x.trades).reduce((a, x, _, arr) => a + x.r / arr.length, 0), 3)}%.`, "");

// ---------- N3 ----------
const optPath = process.argv[2] ?? "data/options/spy0dte_entry.json.gz";
if (existsSync(optPath)) {
  const opt = JSON.parse(gunzipSync(readFileSync(optPath)).toString()) as Record<string, Record<string, [string, number, number, number, number, number, number][]>>;
  const plan = JSON.parse(readFileSync("scripts/options-plan.json", "utf8")) as { date: string; S: number; start: string; legs: Record<string, string> }[];
  const spy = new Map(sessions("SPY", "2024-02", "2026-09").map((s) => [s.date, s]));
  const days: N3Day[] = plan.filter((p) => spy.has(p.date)).map((p) => ({ date: p.date, S: p.S, close: spy.get(p.date)!.c.at(-1)!, t10: new Date(Date.parse(p.start) + 5 * 60000).toISOString().slice(0, 16), legs: p.legs as N3Day["legs"], bars: opt[p.date] ?? {} }));
  const res = n3(days, 0.01), res2 = n3(days, 0.02);
  const ic = res.map((x) => ({ day: x.date, r: x.icRet, trades: x.ic ? 1 : 0 })).filter((x) => x.trades), ic2 = res2.map((x) => ({ day: x.date, r: x.icRet, trades: x.ic ? 1 : 0 })).filter((x) => x.trades);
  const st = res.filter((x) => x.straddle !== undefined).map((x) => ({ day: x.date, r: x.straddle!, trades: 1 }));
  const n = days.length, skipped = n - ic.length;
  const sh = (rs: DayRet[]) => { const m = rs.reduce((a, x) => a + x.r, 0) / rs.length, sd = Math.sqrt(rs.reduce((a, x) => a + (x.r - m) ** 2, 0) / (rs.length - 1)); return { m, sd, s: (m / sd) * Math.sqrt(252), worst: Math.min(...rs.map((x) => x.r)), win: rs.filter((x) => x.r > 0).length / rs.length }; };
  const line3 = (name: string, rs: DayRet[]) => { const a = sh(rs), b = sh(after(rs, "2025-06-01")); const c2 = a.m > 0 && boot(rs) >= 0.95, c3 = b.m > 0 && b.s >= 0.5; return `| ${name} | ${rs.length} | ${fmt(100 * a.win, 0)}% | ${fmt(100 * a.m, 2)}% | ${fmt(a.s, 2)} | ${fmt(100 * a.worst, 1)}% | ${fmt(100 * boot(rs), 1)}% | ${fmt(100 * b.m, 2)}% · ${fmt(b.s, 2)} | ${c2 && c3 ? "GO (на хартия)" : c2 ? "слабо" : "STOP"} |`; };
  out.push("## N3: 0DTE iron condor на SPY (вход 10:00, до изтичането)", "", `Дни в плана: ${n}; със сделка: ${ic.length}; пропуснати (липсва сделка по някой крак в 09:55–10:05): ${skipped}.`, "",
    "| Вариант | Дни | Печеливши | Средно на ден | Sharpe | Най-лош ден | Bootstrap > 0 | 2025-06 –: средно · Sharpe | Решение |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    line3("**Iron condor, $0.01/крак** (доходност върху риска)", ic), line3("Iron condor, $0.02/крак", ic2), line3("Къс ATM стредъл, $0.01/крак (в % от цената на SPY)", st), "");
} else out.push("## N3", "", `Няма данни за опциите (${optPath}).`, "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/new3.md", text + "\n");
