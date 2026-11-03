/**
 * QuantLab "Session Open Momentum" claim check (experiments/quantlab-momentum-preregistration.md).
 * M1 = DT3 (entry 09:35), M2 = DT3 as the bot trades it (entry 09:50, no FOMC days). QQQ, 1% risk, $0.0045/share/side.
 * Run: npx tsx src/cli/quantlab.ts   Writes reports/quantlab-momentum.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { dt3Late, type DayRet } from "../daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";

const D = "data/branch", C = 0.0045;
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const Q = completeSessions(toSessions(loadMinuteBars(D, "QQQ", "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);

interface Setup { day: string; i0: number; dir: 1 | -1; entry: number; risk: number }
/** Same entry conditions as dt3Late (e = minutes after 09:30). */
function setups(ss: readonly Session[], e: number, skipFomc: boolean): Setup[] {
  const out: Setup[] = [];
  for (const s of ss) {
    if (skipFomc && fomc.has(s.date)) continue;
    if (s.minute[0] !== 570 || s.minute[4] !== 574) continue;
    const i0 = s.minute.indexOf(570 + e);
    if (i0 < 5) continue;
    const o0 = s.o[0]!, c4 = s.c[4]!;
    if (c4 === o0) continue;
    const dir = c4 > o0 ? 1 : -1;
    const stop = dir === 1 ? Math.min(...s.l.slice(0, 5)) : Math.max(...s.h.slice(0, 5));
    let touched = false;
    for (let i = 5; i < i0; i++) if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) touched = true;
    if (touched) continue;
    const entry = s.o[i0]!, risk = dir * (entry - stop);
    if (!(risk > 0)) continue;
    out.push({ day: s.date, i0, dir, entry, risk });
  }
  return out;
}
/** Trade from the setup's entry with direction `dir` and the same stop distance; result as a fraction of capital. */
function sim(s: Session, u: Setup, dir: 1 | -1): number {
  const stop = u.entry - dir * u.risk, target = u.entry + dir * 10 * u.risk, q = Math.min(0.01 / u.risk, 4 / u.entry);
  let exit = s.c[s.c.length - 1]!;
  for (let i = u.i0; i < s.minute.length; i++) {
    if (dir * (s.o[i]! - stop) <= 0 && i > u.i0) { exit = s.o[i]!; break; }
    if (dir === 1 ? s.l[i]! <= stop : s.h[i]! >= stop) { exit = stop; break; }
    if (dir === 1 ? s.h[i]! >= target : s.l[i]! <= target) { exit = target; break; }
  }
  return dir * (exit - u.entry) * q - 2 * C * q;
}

const byDay = new Map(Q.map((s) => [s.date, s]));
const out: string[] = ["# QuantLab „Session Open Momentum“: проверка на твърдението", "", "Правила: `experiments/quantlab-momentum-preregistration.md`. QQQ, риск 1% на сделка (макс. 4x ливъридж), $0.0045 на акция и страна.", ""];
const years = [...new Set(Q.map((s) => s.date.slice(0, 4)))].sort();

for (const [name, e, skip] of [["M1: DT3, вход 09:35", 5, false], ["M2: DT3 като бота, вход 09:50, без FOMC", 20, true]] as const) {
  const U = setups(Q, e, skip);
  const r = U.map((u) => sim(byDay.get(u.day)!, u, u.dir));
  // self-check: identical to the tested dt3Late
  const ref = new Map(dt3Late(Q, C, e).filter((x) => x.trades).map((x) => [x.day, x.r]));
  let bad = 0;
  U.forEach((u, k) => { if (Math.abs((ref.get(u.day) ?? NaN) - r[k]!) > 1e-12) bad++; });
  const refN = [...ref.keys()].filter((d) => !(skip && fomc.has(d))).length;
  if (bad || refN !== U.length) throw new Error(`${name}: mismatch with dt3Late (${bad} days, ${refN} vs ${U.length})`);
  const flip = U.map((u) => sim(byDay.get(u.day)!, u, u.dir === 1 ? -1 : 1));
  const rnd = mulberry32(2026);
  const N = 1000, simYear = new Map<string, number[]>(years.map((y) => [y, new Array(N).fill(0)])), simAll = new Array(N).fill(0);
  for (let k = 0; k < N; k++) U.forEach((u, j) => { const x = rnd() < 0.5 ? r[j]! : flip[j]!; { const a = simYear.get(u.day.slice(0, 4))!; a[k] = a[k]! + x; } simAll[k] = simAll[k]! + x; });
  const stat = (idx: number[]) => {
    const xs = idx.map((j) => r[j]!);
    let eq = 1, peak = 1, mdd = 0, since = 0, longest = 0, from = U[idx[0]!]!.day, span = "";
    idx.forEach((j, k) => { const x = xs[k]!; eq *= 1 + x; if (eq > peak) { peak = eq; since = 0; from = U[j]!.day; } else { since++; if (since > longest) { longest = since; span = `${from} – ${U[j]!.day}`; } } mdd = Math.min(mdd, eq / peak - 1); });
    const pos = xs.filter((x) => x > 0).reduce((a, b) => a + b, 0), neg = -xs.filter((x) => x < 0).reduce((a, b) => a + b, 0);
    return { n: xs.length, sum: xs.reduce((a, b) => a + b, 0), comp: eq - 1, mdd, win: xs.filter((x) => x > 0).length / xs.length, pf: pos / neg, longest, span };
  };
  const all = U.map((_, j) => j);
  const sa = stat(all);
  out.push(`## ${name}`, "", `Цял период 2016-01 – 2026-09: ${sa.n} сделки, печеливши ${fmt(100 * sa.win, 1)}%, profit factor ${fmt(sa.pf, 2)}, сума ${fmt(100 * sa.sum, 1)}%, с олихвяване ${fmt(100 * sa.comp, 1)}%, най-голям спад ${fmt(100 * sa.mdd, 1)}%, най-дълго без нов връх: ${sa.longest} сделки (${sa.span}). Случайна посока: стратегията бие ${simAll.filter((x) => sa.sum > x).length} от ${N}.`, "",
    "| Година | Сделки | Печеливши | PF | Сума | С олихвяване | Макс. спад | Бие случайна посока (от 1000) |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const y of years) {
    const idx = all.filter((j) => U[j]!.day.startsWith(y));
    if (!idx.length) continue;
    const s = stat(idx);
    out.push(`| ${y} | ${s.n} | ${fmt(100 * s.win, 0)}% | ${fmt(s.pf, 2)} | ${fmt(100 * s.sum, 1)}% | ${fmt(100 * s.comp, 1)}% | ${fmt(100 * s.mdd, 1)}% | ${simYear.get(y)!.filter((x) => s.sum > x).length} |`);
  }
  out.push("");
}

// QQQ buy and hold 2022 (closes of the regular session)
const closes = Q.map((s) => ({ d: s.date, c: s.c[s.c.length - 1]! }));
const c0 = closes.filter((x) => x.d < "2022-01-01").at(-1)!, y22 = closes.filter((x) => x.d.startsWith("2022"));
let pk = c0.c, dd = 0;
for (const x of y22) { pk = Math.max(pk, x.c); dd = Math.min(dd, x.c / pk - 1); }
const pk21 = Math.max(...closes.filter((x) => x.d >= "2021-01-01" && x.d <= "2022-12-31").map((x) => x.c)), lo22 = Math.min(...y22.map((x) => x.c));
out.push("## QQQ купи и дръж, 2022 (цени без дивиденти)", "", `Доходност ${fmt(100 * (y22.at(-1)!.c / c0.c - 1), 1)}%; най-голям спад в 2022 ${fmt(100 * dd, 1)}%; от върха (ноем. 2021) до дъното ${fmt(100 * (lo22 / pk21 - 1), 1)}%.`, "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/quantlab-momentum.md", text + "\n");
