/**
 * DT1-DT5: five published day trading strategies (experiments/daytrade5-preregistration.md).
 * Needs data/branch (npm run data:sync). Run: npx tsx src/cli/daytrade5.ts   Writes reports/daytrade5.md
 */
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { byYear, COST_PER_SHARE, dt1, dt2, dt3, dt4, dt5, perf, type DayRet } from "../daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch", TO = "2026-09";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", TO, "alpaca"), cal), cal).kept;
const SPY = sessions("SPY"), QQQ = sessions("QQQ");
const cryptoDays = (() => { const out: string[] = []; for (let t = Date.UTC(2020, 0, 2); t <= Date.UTC(2026, 8, 30); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10)); return out; })();
const crypto = (sym: string) => { const b = loadMinuteBars(D, sym, "2020-01", TO, "binance"); return { t: b.t, c: b.c }; };
const BTC = crypto("BTCUSDT"), ETH = crypto("ETHUSDT");

const between = (rs: DayRet[], a: string, b: string) => rs.filter((x) => x.day >= a && x.day <= b);
const boot = (rs: DayRet[]) => bootstrapByDay(rs.map((x) => ({ day: x.day, r: x.r })));
function row(name: string, rs: DayRet[], ppy = 252) {
  const p = perf(rs, ppy);
  return { p, b: boot(rs), line: `| ${name} | ${rs[0]?.day ?? "-"} – ${rs.at(-1)?.day ?? "-"} | ${p.trades} | ${fmt(100 * p.cagr, 1)}% | ${fmt(p.sharpe, 2)} | ${fmt(100 * p.mdd, 1)}% | ${fmt(100 * boot(rs), 1)}% |` };
}
const head = ["| Вариант | Период | Сделки | Год. доходност | Sharpe | Макс. спад | Bootstrap > 0 |", "| --- | --- | --- | --- | --- | --- | --- |"];
const out: string[] = ["# 5 публикувани day trading стратегии: резултати", "", "Правила: `experiments/daytrade5-preregistration.md`. Всичко е **нетно** (DT1–DT4: $0.0045 на акция и страна; DT5: 0.05% на страна), освен ако не пише друго.", ""];
const verdicts: string[] = [];
function judge(name: string, full: DayRet[], oos: DayRet[], ppy = 252) {
  const f = perf(full, ppy), b = boot(full), o = perf(oos, ppy);
  const c2 = f.meanDaily > 0 && b >= 0.95, c3 = o.meanDaily > 0 && o.sharpe >= 0.5;
  const v = c2 && c3 ? "GO (кандидат за бота, на хартия)" : c2 ? "слабо" : "STOP";
  verdicts.push(`| ${name} | ${fmt(f.sharpe, 2)} · ${fmt(100 * b, 1)}% | ${oos[0]?.day ?? "-"} – ${oos.at(-1)?.day ?? "-"}: Sharpe ${fmt(o.sharpe, 2)}, год. ${fmt(100 * o.cagr, 1)}% | ${c2 ? "да" : "не"} | ${c3 ? "да" : "не"} | **${v}** |`);
}

// ---------- DT1 ----------
const dt1Main = dt1(SPY, { dynamic: true, execNextOpen: true, cost: COST_PER_SHARE });
const dt1Paper = dt1(SPY, { dynamic: true, execNextOpen: false, cost: COST_PER_SHARE });
const paperYears: Record<string, number> = { "2016": -12.8, "2017": -6.9, "2018": 61.1, "2019": 6.9, "2020": 26.8, "2021": 34.8, "2022": 24.4, "2023": 37.2, "2024": 32.2 };
const yMain = byYear(dt1Main), yPaper = byYear(dt1Paper);
const ys = Object.keys(paperYears);
const corr = (a: number[], b: number[]) => { const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length; let s = 0, sa = 0, sb = 0; a.forEach((x, i) => { s += (x - ma) * (b[i]! - mb); sa += (x - ma) ** 2; sb += (b[i]! - mb) ** 2; }); return s / Math.sqrt(sa * sb); };
out.push("## DT1 — Noise Area intraday momentum (SPY)", "", "**Проверка 1, повтаряне на статията** (годишни доходности, %; динамичен размер):", "",
  "| Година | Статията | Наш, изпълнение като статията | Наш, следваща минута (основен) |", "| --- | --- | --- | --- |",
  ...ys.map((y) => `| ${y} | ${fmt(paperYears[y]!, 1)} | ${fmt(100 * (yPaper.get(y) ?? NaN), 1)} | ${fmt(100 * (yMain.get(y) ?? NaN), 1)} |`),
  "", `Корелация с годините на статията: изпълнение като статията ${fmt(corr(ys.map((y) => paperYears[y]!), ys.map((y) => 100 * (yPaper.get(y) ?? 0))), 2)}, основен ${fmt(corr(ys.map((y) => paperYears[y]!), ys.map((y) => 100 * (yMain.get(y) ?? 0))), 2)}.`, "", ...head,
  row("**основен** (динамичен, следваща минута)", dt1Main).line, row("изпълнение като статията", dt1Paper).line,
  row("100% размер", dt1(SPY, { dynamic: false, execNextOpen: true, cost: COST_PER_SHARE })).line,
  row("без разходи", dt1(SPY, { dynamic: true, execNextOpen: true, cost: 0 })).line,
  row("основен, след статията (2024-05 – 2026-09)", between(dt1Main, "2024-05-01", "2026-09-30")).line,
  row("QQQ (описателно)", dt1(QQQ, { dynamic: true, execNextOpen: true, cost: COST_PER_SHARE })).line, "");
judge("DT1 Noise Area, SPY", dt1Main, between(dt1Main, "2024-05-01", "2026-09-30"));

// ---------- DT2 ----------
const dt2Main = dt2(QQQ, COST_PER_SHARE);
const pub2 = between(dt2Main, "2018-01-02", "2023-09-28"), pub2gross = between(dt2(QQQ, 0), "2018-01-02", "2023-09-28"), pub2comm = between(dt2(QQQ, 0.0005), "2018-01-02", "2023-09-28");
out.push("## DT2 — VWAP тренд (QQQ)", "", "**Проверка 1:** статията дава за 2018-01-02 – 2023-09-28 +671%, MDD 9.4%, Sharpe 2.1.", "", ...head,
  row("публикуван период, без разходи", pub2gross).line, row("публикуван период, $0.0005/акция", pub2comm).line, row("публикуван период, **основен** ($0.0045)", pub2).line,
  row("**основен**, целият период", dt2Main).line, row("след статията (2023-10 – 2026-09)", between(dt2Main, "2023-10-01", "2026-09-30")).line,
  `| средно сделки на ден | | ${fmt(perf(dt2Main).trades / dt2Main.length, 1)} | | | | |`, "");
judge("DT2 VWAP, QQQ", dt2Main, between(dt2Main, "2023-10-01", "2026-09-30"));

// ---------- DT3 ----------
const dt3Main = dt3(QQQ, COST_PER_SHARE);
out.push("## DT3 — 5-минутен ORB (QQQ)", "", ...head, row("**основен** ($0.0045)", dt3Main).line, row("само комисиона $0.0035 (статията)", dt3(QQQ, 0.0035)).line,
  row("без разходи", dt3(QQQ, 0)).line, row("публикуван период 2016–2023, $0.0035", between(dt3(QQQ, 0.0035), "2016-01-01", "2023-12-31")).line,
  row("след статията (2024-01 – 2026-09)", between(dt3Main, "2024-01-01", "2026-09-30")).line, row("SPY (описателно)", dt3(SPY, COST_PER_SHARE)).line, "");
judge("DT3 ORB 5 мин, QQQ", dt3Main, between(dt3Main, "2024-01-01", "2026-09-30"));

// ---------- DT4 ----------
const dt4Main = dt4(SPY, COST_PER_SHARE);
out.push("## DT4 — първият половин час предсказва последния (SPY)", "", "Статията свършва през 2013 г., така че целият наш период 2016–2026 е след нея.", "", ...head,
  row("**основен**", dt4Main).line, row("без разходи", dt4(SPY, 0)).line, row("2016–2020", between(dt4Main, "2016-01-01", "2020-12-31")).line,
  row("2021–2026", between(dt4Main, "2021-01-01", "2026-09-30")).line, row("QQQ (описателно)", dt4(QQQ, COST_PER_SHARE)).line, "");
judge("DT4 intraday momentum, SPY", dt4Main, dt4Main);

// ---------- DT5 ----------
const dt5Main = dt5(BTC, cryptoDays, 0.0005);
out.push("## DT5 — Bitcoin, последният половин час преди 17:00 NY", "", "Статията свършва през 2020 г.", "", ...head,
  row("**основен** BTC (0.05%/страна)", dt5Main, 365).line, row("BTC, maker 0.02%", dt5(BTC, cryptoDays, 0.0002), 365).line, row("BTC, без разходи", dt5(BTC, cryptoDays, 0), 365).line,
  row("BTC 2020 (публикуван период), без разходи", between(dt5(BTC, cryptoDays, 0), "2020-01-01", "2020-12-31"), 365).line,
  row("BTC след статията (2021–2026)", between(dt5Main, "2021-01-01", "2026-09-30"), 365).line, row("ETH (описателно)", dt5(ETH, cryptoDays, 0.0005), 365).line, "");
judge("DT5 BTC последен половин час", dt5Main, between(dt5Main, "2021-01-01", "2026-09-30"), 365);

out.splice(4, 0, "## Присъда", "", "| Стратегия | Целият период: Sharpe · bootstrap | След публикуването | C2 | C3 | Решение |", "| --- | --- | --- | --- | --- | --- |", ...verdicts, "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/daytrade5.md", text + "\n");
