/**
 * N4: DT3 with 0DTE QQQ options instead of shares (experiments/options-dt3-preregistration.md).
 * Data: scripts/options-plan-qqq.json + data/optqqq/qqq0dte_dt3.json.gz (branch optdata-qqq).
 * Run: npx tsx src/cli/options-dt3.ts   Writes reports/options-dt3.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { COST_PER_SHARE as C, dt3Late, perf, type DayRet } from "../daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";

type Plan = { date: string; dir: 1 | -1; S: number; stop: number; stopMin: number | null; p1555: number; off: number; kA: number; kO: number; legs: { atm: string; otm: string } };
type OB = [string, number, number, number, number, number, number];
const plan = JSON.parse(readFileSync("scripts/options-plan-qqq.json", "utf8")) as Plan[];
const bars = JSON.parse(gunzipSync(readFileSync("data/optqqq/qqq0dte_dt3.json.gz")).toString()) as Record<string, Record<string, OB[]>>;
const LATE = "2025-06-01";

export interface OptTrade { date: string; entry: number; exit: number; how: string }
/** One day's option trade by the pre-registered rules, or null when there is no entry bar 09:50-09:54. */
export function optTrade(p: Plan, leg: "atm" | "otm", ob: OB[] | undefined): OptTrade | null {
  if (!ob?.length) return null;
  const K = leg === "atm" ? p.kA : p.kO;
  const byMin = new Map<number, number>(); // NY minute -> close
  for (const b of ob) { const d = new Date(b[0]); byMin.set(d.getUTCHours() * 60 + d.getUTCMinutes() - p.off * 60, b[4]); }
  const first = (a: number, b: number) => { for (let m = a; m <= b; m++) if (byMin.has(m)) return byMin.get(m)!; return undefined; };
  const lastIn = (a: number, b: number) => { for (let m = b; m >= a; m--) if (byMin.has(m)) return byMin.get(m)!; return undefined; };
  const entry = first(590, 594);
  if (entry === undefined) return null;
  const intrinsic = (px: number) => Math.max(0, p.dir * (px - K));
  if (p.stopMin !== null && p.stopMin < 955) { const x = first(p.stopMin, p.stopMin + 5); return { date: p.date, entry, exit: x ?? intrinsic(p.stop), how: x === undefined ? "stop-intrinsic" : "stop" }; }
  const x = lastIn(950, 955);
  return { date: p.date, entry, exit: x ?? intrinsic(p.p1555), how: x === undefined ? "time-intrinsic" : "time" };
}

if (process.argv[1]?.endsWith("options-dt3.ts")) {
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const run = (leg: "atm" | "otm", cost: number) => plan.map((p) => optTrade(p, leg, bars[p.date]?.[p.legs[leg]])).filter((t): t is OptTrade => !!t).map((t) => ({ ...t, r: 0.01 * (t.exit - t.entry - 2 * cost) / (t.entry + cost), usd: 100 * (t.exit - t.entry - 2 * cost) }));
  const days = plan.map((p) => p.date);
  const daily = (ts: { date: string; r: number }[]): DayRet[] => { const m = new Map(ts.map((t) => [t.date, t.r])); return days.map((day) => ({ day, r: m.get(day) ?? 0, trades: m.has(day) ? 1 : 0 })); };
  const row = (name: string, ts: { date: string; r: number }[]) => {
    const d = daily(ts), late = d.filter((x) => x.day >= LATE), boot = bootstrapByDay(d.map((x) => ({ day: x.day, r: x.r })));
    const sh = (x: DayRet[]) => perf(x).sharpe * Math.sqrt((plan.length / 2.66) / 252); // trade days per year instead of 252
    const m = mean(d.map((x) => x.r)), ml = mean(late.map((x) => x.r)), c2 = m > 0 && boot >= 0.95, c3 = ml > 0 && sh(late) >= 0.5;
    return `| ${name} | ${ts.length} | ${fmt(100 * ts.filter((t) => t.r > 0).length / ts.length, 0)}% | ${fmt(10000 * m, 1)} | ${fmt(100 * boot, 1)}% | ${fmt(sh(d), 2)} | ${fmt(10000 * ml, 1)} · ${fmt(sh(late), 2)} | ${c2 && c3 ? "GO (на хартия)" : c2 ? "слабо" : "STOP"} |`;
  };
  // DT3 with shares on the same days (1% risk)
  const cal = loadCalendar("data/branch/daily/alpaca/calendar.csv");
  const qqq = completeSessions(toSessions(loadMinuteBars("data/branch", "QQQ", "2024-01", "2026-09", "alpaca"), cal), cal).kept;
  const sh = new Map(dt3Late(qqq, C, 20).map((x) => [x.day, x.r]));
  const shares = plan.map((p) => ({ date: p.date, r: sh.get(p.date) ?? 0 }));
  const atm = run("atm", 0.035), otm = run("otm", 0.035);
  const hows = (ts: OptTrade[]) => Object.entries(ts.reduce((a, t) => ({ ...a, [t.how]: (a[t.how] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(", ");
  const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor(f * (a.length - 1))]!;
  const head = ["| Вариант | Сделки | Печеливши | Средно на сделка (bp от капитала) | Bootstrap > 0 | Sharpe | 2025-06 –: средно · Sharpe | Решение |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  const out = ["# N4: DT3 с 0DTE опции на QQQ", "", "Правила: `experiments/options-dt3-preregistration.md`. 2024-02 – 2026-09, дни със сделка на DT3 (09:50). Премията е 1% от капитала на сделка; разход $0.035 на акция и страна.", "",
    "## Присъда", "", ...head, row("**P: ATM опция, разход $0.035**", atm), "",
    "## Описателно", "", ...head, row("DT3 с акции, същите дни (риск 1%)", shares), row("ATM, разход $0.01", run("atm", 0.01)), row("ATM, разход $0.06", run("atm", 0.06)), row("0.5% извън парите, разход $0.035", otm), "",
    `Дни в плана: ${plan.length}; без бар за вход: ATM ${plan.length - atm.length}, OTM ${plan.length - otm.length}. Изходи ATM: ${hows(atm)}.`,
    `Премия на входа (за 1 акция): ATM медиана $${fmt(q(atm.map((t) => t.entry), 0.5), 2)} (10%–90%: $${fmt(q(atm.map((t) => t.entry), 0.1), 2)}–$${fmt(q(atm.map((t) => t.entry), 0.9), 2)}); OTM медиана $${fmt(q(otm.map((t) => t.entry), 0.5), 2)}.`,
    `Резултат на сделка в % от премията, ATM: средна печалба +${fmt(100 * mean(atm.filter((t) => t.r > 0).map((t) => t.r / 0.01)), 0)}%, средна загуба ${fmt(100 * mean(atm.filter((t) => t.r <= 0).map((t) => t.r / 0.01)), 0)}%.`, "",
    "## Сметка $500, по 1 договор на ден", "", "1000 случайни пренареждания на дните. „Спира“ = в някой момент парите не стигат за един договор.", "",
    "| Опция | Цена на 1 договор (медиана) | Среден резултат на договор | Най-лош ден | Сметката спира | Медиана на края (ако не спре) |", "| --- | --- | --- | --- | --- | --- |"];
  for (const [name, ts] of [["ATM", atm], ["0.5% извън парите", otm]] as const) {
    const rnd = mulberry32(42); let ruin = 0; const ends: number[] = [];
    for (let it = 0; it < 1000; it++) {
      const idx = ts.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
      let b = 500, dead = false;
      for (const i of idx) { const t = ts[i]!; if (b < 100 * (t.entry + 0.035)) { dead = true; break; } b += t.usd; }
      if (dead) ruin++; else ends.push(b);
    }
    out.push(`| ${name} | $${fmt(100 * q(ts.map((t) => t.entry), 0.5), 0)} | $${fmt(mean(ts.map((t) => t.usd)), 1)} | $${fmt(Math.min(...ts.map((t) => t.usd)), 0)} | ${fmt(ruin / 10, 0)}% | ${ends.length ? "$" + fmt(q(ends, 0.5), 0) : "—"} |`);
  }
  out.push("");
  const text = out.join("\n");
  console.log(text);
  writeFileSync("reports/options-dt3.md", text + "\n");
}
