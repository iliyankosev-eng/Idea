/**
 * Reality checks for the bot: what the bot can actually see in real time on the free Alpaca plan vs what the backtests used.
 *  1. DT8: decision 20 minutes before the close (market-on-close cutoff) instead of at the close.
 *  2. DT3: opening range from the real-time IEX feed instead of SIP (2024-05..2026-09, data/probe-iex from the probe-iex branch).
 *  3. DT3 adaptation: opening range from SIP (available with a 15-minute delay) and entry at 09:50; sensitivity to the entry time.
 *  4. The realistic bot portfolio (50/50) vs buy and hold.
 * Run: npx tsx src/cli/bot-reality.ts   Writes reports/bot-reality.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { orbPlan, stopTouched, type Bar } from "../bot/logic.js";
import { byYear, COST_PER_SHARE as C, dt3, dt3Late, perf, type DayRet } from "../daytrade/dt.js";
import { dt8, rsi } from "../daytrade/dt78.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const sessions = (sym: string, a = "2016-01") => completeSessions(toSessions(loadMinuteBars(D, sym, a, "2026-09", "alpaca"), cal), cal).kept;
const noFomc = (rs: DayRet[]) => rs.map((x) => (fomc.has(x.day) ? { ...x, r: 0, trades: 0 } : x));
const after = (rs: DayRet[], a: string) => rs.filter((x) => x.day >= a);
const boot = (rs: DayRet[]) => bootstrapByDay(rs.map((x) => ({ day: x.day, r: x.r })));
const row = (name: string, rs: DayRet[], from = "2024-05-01") => { const p = perf(rs), q = perf(after(rs, from)); return `| ${name} | ${p.trades} | ${fmt(100 * p.cagr, 1)}% | ${fmt(p.sharpe, 2)} | ${fmt(100 * p.mdd, 1)}% | ${fmt(100 * boot(rs), 1)}% | ${fmt(q.sharpe, 2)} · ${fmt(100 * q.cagr, 1)}% |`; };
const HEAD = (late: string) => [`| Вариант | Сделки | Год. доходност | Sharpe | Макс. спад | Bootstrap > 0 | ${late}: Sharpe · год. |`, "| --- | --- | --- | --- | --- | --- | --- |"];
const out: string[] = ["# Ботът срещу бектеста: какво ботът наистина вижда", "", "Нетно, $0.0045 на акция и страна. Скрипт: `src/cli/bot-reality.ts`.", ""];

// ---------- 1. DT8 decided 20 minutes before the close ----------
const spy = sessions("SPY");
const ratio = new Map<string, number>(); // raw price at close-20 / raw last price
for (const s of spy) { const cut = s.minute[s.minute.length - 1]! + 1 - 20; let k = -1; for (let i = 0; i < s.minute.length && s.minute[i]! < cut; i++) k = i; if (k >= 0) ratio.set(s.date, s.c[k]! / s.c[s.c.length - 1]!); }
const rows = readFileSync(`${D}/daily/alpaca/SPY.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r[0]! <= "2026-09-30");
const date = rows.map((r) => r[0]!), c = rows.map((r) => Number(r[4]));
const sma = (xs: number[], n: number) => xs.slice(-n).reduce((a, b) => a + b, 0) / n;
let flips = 0;
const dt8Early: DayRet[] = [];
{ let inPos = false;
  for (let i = 1; i < c.length; i++) {
    let r = inPos ? c[i]! / c[i - 1]! - 1 : 0, trades = 0;
    const f = ratio.get(date[i]!);
    if (f !== undefined) {
      const ser = [...c.slice(0, i), c[i]! * f], px = ser[i]!, ref = c.slice(0, i + 1);
      const act = inPos ? px > sma(ser, 5) : i >= 199 && rsi(ser, 2)[i]! < 10 && px > sma(ser, 200);
      const actRef = inPos ? c[i]! > sma(ref, 5) : i >= 199 && rsi(ref, 2)[i]! < 10 && c[i]! > sma(ref, 200);
      if (act !== actRef) flips++;
      if (act && inPos) { inPos = false; r -= C / c[i]!; trades = 1; } else if (act) { inPos = true; r -= C / c[i]!; }
    }
    dt8Early.push({ day: date[i]!, r, trades });
  } }
const dt8Close = dt8({ date, c }, C);
out.push("## 1. DT8 (RSI(2) SPY): решение 20 минути преди затварянето", "",
  "Поръчката „на затварянето“ (MOC) трябва да е изпратена до 15:50, затова ботът решава в 15:40 с цената тогава, а не с цената на затварянето.", "",
  ...HEAD("2021–2026"), row("DT8 бектест (решение на затварянето)", dt8Close, "2021-01-01"), row("**DT8 като бота (решение в 15:40)**", dt8Early, "2021-01-01"), "",
  `Решението се различава в ${flips} от ${ratio.size} дни.`, "");

// ---------- 2. DT3: IEX vs SIP opening range (2024-05..2026-09) ----------
const qqq = sessions("QQQ");
const IEXF = "data/probe-iex/iex_QQQ_open.csv";
if (existsSync(IEXF)) {
  const fmtNy = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const iex = new Map<string, Map<number, Bar>>();
  for (const l of readFileSync(IEXF, "utf8").trim().split("\n").slice(1)) {
    const [t, o, h, lo, cc] = l.split(",");
    const p = Object.fromEntries(fmtNy.formatToParts(new Date(t!)).map((x) => [x.type, x.value]));
    const day = `${p.year}-${p.month}-${p.day}`;
    if (!iex.has(day)) iex.set(day, new Map());
    iex.get(day)!.set(+p.hour! * 60 + +p.minute!, { o: +o!, h: +h!, l: +lo!, c: +cc! });
  }
  const sim = (s: Session, dir: number, stop: number) => { // dt3() execution on SIP bars with a given direction and stop
    const entry = s.o[5]!, risk = dir * (entry - stop); if (!(risk > 0)) return 0;
    const target = entry + dir * 10 * risk, q = Math.min(0.01 / risk, 4 / entry); let exit = s.c[s.c.length - 1]!;
    for (let i = 5; i < s.minute.length; i++) {
      if (dir * (s.o[i]! - stop) <= 0 && i > 5) { exit = s.o[i]!; break; }
      if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) { exit = stop; break; }
      if (dir === 1 ? s.h[i]! >= target : s.l[i]! <= target) { exit = target; break; }
    }
    return dir * (exit - entry) * q - 2 * C * q;
  };
  const per = qqq.filter((s) => s.date >= "2024-05-01");
  const sipRs = noFomc(dt3(per, C));
  const A: DayRet[] = [], B: DayRet[] = [];
  let n = 0, miss = 0, sameDir = 0, both = 0;
  per.forEach((s, k) => {
    if (s.minute[0] !== 570 || s.minute[4] !== 574 || s.minute[5] !== 575) return;
    n++;
    A.push(sipRs[k]!);
    const m = iex.get(s.date), f5 = [570, 571, 572, 573, 574].map((x) => m?.get(x));
    if (f5.some((x) => !x) || fomc.has(s.date)) { if (f5.some((x) => !x)) miss++; B.push({ day: s.date, r: 0, trades: 0 }); return; }
    const pI = orbPlan(f5 as Bar[], s.o[5]!, 1e6), pS = orbPlan([0, 1, 2, 3, 4].map((i) => ({ o: s.o[i]!, h: s.h[i]!, l: s.l[i]!, c: s.c[i]! })), s.o[5]!, 1e6);
    if (pI && pS) { both++; if (pI.side === pS.side) sameDir++; }
    B.push({ day: s.date, r: pI ? sim(s, pI.side === "buy" ? 1 : -1, pI.stop) : 0, trades: pI ? 1 : 0 });
  });
  out.push("## 2. DT3 (ORB QQQ, 09:35): отварящият диапазон от IEX вместо от SIP", "",
    "Безплатният план на Alpaca дава в реално време само IEX (една борса, ~2–3% от обема). Бектестът е със SIP (всички борси). Същите дни, 2024-05 – 2026-09, изпълнение по SIP баровете; дните с FOMC са пропуснати.", "",
    ...HEAD("същият период"), row("DT3 09:35, диапазон от SIP (бектест)", A), row("**DT3 09:35, диапазон от IEX (каквото ботът вижда)**", B), "",
    `Дни: ${n}; без пълни IEX барове 09:30–09:34: ${miss}; дни със сделка и по двата източника: ${both}, от тях с обратна посока: ${both - sameDir}.`,
    "Причината (проверена): IEX баровете са само от сделките на IEX, затова цените им се различават от SIP средно с ~1.5 bp (медиана ~0.8 bp, и при отварянето, и при затварянето на 09:34). Когато първите 5 минути почти не мърдат, това обръща посоката. Малко дни, но с голямо влияние; стоповете също се разминават леко.", "");
} else out.push("## 2. DT3 IEX срещу SIP", "", `Липсва ${IEXF} (клон probe-iex).`, "");

// ---------- 3. DT3 with the SIP opening range and a delayed entry ----------
out.push("## 3. DT3 със SIP диапазона и вход по-късно (адаптация за бота, post-hoc)", "",
  "SIP баровете идват с 15 минути закъснение, така че диапазонът 09:30–09:34 от SIP е известен в 09:50. Вход в 09:50; денят се пропуска, ако стопът вече е докоснат между 09:35 и 09:50. Пробвах и други часове само за да видя колко е чувствително: 09:46 не е изпълнимо (SIP данните още ги няма), 09:55 е само за сравнение. 09:50 не е избрано по резултата, а е най-ранният момент, в който ботът има SIP данните.", "",
  ...HEAD("след публикуването на DT3 (2024-01 –)"));
for (const [name, e] of [["DT3 09:35 (оригинал, бектест)", 5], ["DT3 09:46 (проверка)", 16], ["**DT3 09:50 (ботът)**", 20], ["DT3 09:55 (проверка)", 25]] as const) out.push(row(name, noFomc(dt3Late(qqq, C, e)), "2024-01-01"));
out.push("", "Всички редове: без дните с FOMC.", "");

// ---------- 4. realistic bot portfolio ----------
const a = noFomc(dt3Late(qqq, C, 20)), b = new Map(dt8Early.map((x) => [x.day, x.r]));
const hold = new Map(c.slice(1).map((v, i) => [date[i + 1]!, v / c[i]! - 1]));
const combo: DayRet[] = a.map((x) => ({ day: x.day, r: 0.5 * x.r + 0.5 * (b.get(x.day) ?? 0), trades: x.trades }));
const hh: DayRet[] = a.map((x) => ({ day: x.day, r: hold.get(x.day) ?? 0, trades: 0 }));
out.push("## 4. Реалистичният бот: 50% DT3 (09:50, без FOMC) + 50% DT8 (решение в 15:40)", "",
  ...HEAD("2021–2026"), row("**Ботът (реалистично)**", combo, "2021-01-01"), row("Купи и дръж SPY", hh, "2021-01-01"), "",
  "**По години (бот / SPY), %:** " + [...byYear(combo)].map(([y, r]) => `${y}: ${fmt(100 * r, 1)} / ${fmt(100 * (byYear(hh).get(y) ?? 0), 1)}`).join("; "), "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/bot-reality.md", text + "\n");
