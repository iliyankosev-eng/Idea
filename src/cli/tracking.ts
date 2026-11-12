/**
 * Bot vs backtest, trade by trade (point 4 of the bot review): DT3 as the bot traded it (botlog branch) against the same
 * rule on SIP minute bars for the same days.
 * Run: git worktree add data/botlog origin/botlog; npx tsx src/cli/tracking.ts [from=2026-10-14]   Writes reports/tracking.md
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";

const LOGS = "data/botlog", D = "data/branch", FROM = process.argv[2] ?? "2026-10-14";
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const lastMonth = readdirSync(`${D}/intraday/alpaca/QQQ/1m`).filter((f) => f.endsWith(".csv.gz")).sort().at(-1)!.slice(0, 7);
const ss = completeSessions(toSessions(loadMinuteBars(D, "QQQ", FROM.slice(0, 7), lastMonth, "alpaca"), cal), cal).kept.filter((s) => s.date >= FROM);

/** DT3 with the 09:50 entry on SIP bars for one session (same rules as dt3Late). */
export function backtestDay(s: Session): { dir: 1 | -1; entry: number; stop: number; exit: number; r: number } | { none: string } {
  if (s.minute[0] !== 570 || s.minute[4] !== 574) return { none: "no opening bars" };
  const i0 = s.minute.indexOf(590);
  if (i0 < 5) return { none: "no 09:50 bar" };
  const o0 = s.o[0]!, c4 = s.c[4]!;
  if (c4 === o0) return { none: "doji" };
  const dir = c4 > o0 ? 1 : -1;
  const stop = dir === 1 ? Math.min(...s.l.slice(0, 5)) : Math.max(...s.h.slice(0, 5));
  for (let i = 5; i < i0; i++) if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) return { none: "stop touched before 09:50" };
  const entry = s.o[i0]!, risk = dir * (entry - stop);
  if (!(risk > 0)) return { none: "price beyond the stop" };
  let exit = s.c[s.c.length - 1]!;
  for (let i = i0; i < s.minute.length; i++) {
    if (dir * (s.o[i]! - stop) <= 0 && i > i0) { exit = s.o[i]!; break; }
    if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) { exit = stop; break; }
  }
  return { dir, entry, stop, exit, r: (dir * (exit - entry)) / risk };
}

if (process.argv[1]?.endsWith("tracking.ts")) {
  type Fill = { t: string; side: string; qty: number; px: number; id: string };
  const fills = new Map<string, Fill>(), plans = new Map<string, { side: string; stop: number }>(), why = new Map<string, string>();
  for (const f of readdirSync(LOGS).filter((x) => x.endsWith(".log")).sort()) {
    const day = f.slice(0, 10);
    for (const line of readFileSync(`${LOGS}/${f}`, "utf8").split("\n")) {
      let m = line.match(/fill (\S+) QQQ (buy|sell) (\d+) @ ([\d.]+) \((\w+)(?:, (dt3-[\d-]+))?\)/);
      if (m) fills.set(m[1]!, { t: m[1]!, side: m[2]!, qty: +m[3]!, px: +m[4]!, id: m[6] ?? "" });
      m = line.match(/\[open\] DT3 plan (\{.*\})/);
      if (m) plans.set(day, JSON.parse(m[1]!));
      m = line.match(/\[open\] (DT3: no trade, .*|FOMC statement day.*|early close.*|too late.*)/);
      if (m) why.set(day, m[1]!);
    }
  }
  const fl = [...fills.values()].sort((a, b) => (a.t < b.t ? -1 : 1));
  const rows: string[] = [];
  let agree = 0, both = 0, sumBot = 0, sumBt = 0, slipIn = 0, days = 0, onlyBot = 0, onlyBt = 0;
  for (const s of ss) {
    days++;
    const bt = fomc.has(s.date) ? { none: "FOMC day" } : backtestDay(s);
    const p = plans.get(s.date), e = fl.find((x) => x.id === `dt3-${s.date}`);
    const x = e ? fl.find((y) => y.t > e.t && y.side !== e.side && y.qty === e.qty) : undefined;
    const botTraded = !!(p && e && x), btTraded = !("none" in bt);
    if (botTraded === btTraded) agree++;
    if (botTraded && !btTraded) onlyBot++;
    if (!botTraded && btTraded) onlyBt++;
    let cells: string;
    if (botTraded && btTraded) {
      const dir = e!.side === "buy" ? 1 : -1, rBot = (dir * (x!.px - e!.px)) / (dir * (e!.px - p!.stop)), overnight = x!.t.slice(0, 10) !== e!.t.slice(0, 10);
      const slip = (dir * (e!.px - bt.entry) / bt.entry) * 1e4;
      if (!overnight) { both++; sumBot += rBot; sumBt += bt.r; slipIn += slip; }
      cells = `${dir === 1 ? "лонг" : "шорт"}${dir !== bt.dir ? " (тестът: обратна посока!)" : ""} | ${fmt(e!.px, 2)} / ${fmt(bt.entry, 2)} (${slip >= 0 ? "+" : ""}${fmt(slip, 1)} bp) | ${fmt(x!.px, 2)} / ${fmt(bt.exit, 2)} | ${fmt(rBot, 2)} / ${fmt(bt.r, 2)} | ${overnight ? "държана през нощта (грешка), извън сбора" : ""}`;
    } else cells = `${botTraded ? "ботът търгува" : "ботът не"}; ${btTraded ? "тестът търгува" : "тестът не"} | | | | ${botTraded !== btTraded ? "РАЗЛИКА: " : ""}${(why.get(s.date) ?? ("none" in bt ? bt.none : "")).slice(0, 70)}`;
    rows.push(`| ${s.date} | ${cells} |`);
  }
  const out = ["# Ботът срещу теста, сделка по сделка (DT3)", "", `Дни: ${ss[0]?.date} – ${ss.at(-1)?.date}. Тест = същото правило върху SIP минутните данни за същия ден (вход на отварянето на свещта 09:50). R = резултат / риск.`, "",
    `- Еднакво решение „търгува / не търгува“: **${agree} от ${days} дни** (само ботът: ${onlyBot}; само тестът: ${onlyBt}).`,
    `- Дни със сделка и в двете (без държаните през нощта): ${both}. Сбор R: **бот ${fmt(sumBot, 2)}, тест ${fmt(sumBt, 2)}**.`,
    `- Среден вход на бота спрямо теста: ${fmt(both ? slipIn / both : NaN, 1)} bp (плюс = по-лош вход за бота).`, "",
    "| Дата | Посока | Вход бот / тест | Изход бот / тест | R бот / тест | Бележка |", "| --- | --- | --- | --- | --- | --- |", ...rows, ""];
  const text = out.join("\n");
  console.log(text);
  writeFileSync("reports/tracking.md", text + "\n");
}
