/**
 * S/R + Fibonacci + confirmation (experiments/fib-confluence-preregistration.md) on hourly QQQ, GLD (Alpaca SIP) and PAXG (Binance).
 * Run: npx tsx src/cli/fib-confluence.ts   Writes reports/fib-confluence.md
 */
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";
import { fibTrades, type Bars, type Opts, type Trade } from "../fib/confluence.js";

const D = "data/branch", LATE = "2021-07-01";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);

function etfHours(sym: string): Bars {
  const ss = completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
  const day: string[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
  for (const s of ss) {
    let cur = -1;
    for (let i = 0; i < s.minute.length; i++) {
      const m = s.minute[i]!;
      if (m < 570 || m >= 960) continue;
      const k = Math.floor((m - 570) / 60);
      if (k !== cur) { cur = k; day.push(s.date); o.push(s.o[i]!); h.push(s.h[i]!); l.push(s.l[i]!); c.push(s.c[i]!); continue; }
      const j = c.length - 1;
      h[j] = Math.max(h[j]!, s.h[i]!); l[j] = Math.min(l[j]!, s.l[i]!); c[j] = s.c[i]!;
    }
  }
  return { day, o, h, l, c };
}
function cryptoHours(sym: string): Bars {
  const b = loadMinuteBars(D, sym, "2020-09", "2026-09", "binance");
  const day: string[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
  let cur = -1;
  for (let i = 0; i < b.t.length; i++) {
    const k = Math.floor(b.t[i]! / 3_600_000);
    if (k !== cur) { cur = k; day.push(new Date(k * 3_600_000).toISOString().slice(0, 10)); o.push(b.o[i]!); h.push(b.h[i]!); l.push(b.l[i]!); c.push(b.c[i]!); continue; }
    const j = c.length - 1;
    h[j] = Math.max(h[j]!, b.h[i]!); l[j] = Math.min(l[j]!, b.l[i]!); c[j] = b.c[i]!;
  }
  return { day, o, h, l, c };
}

const INST: { name: string; bars: Bars; hold: number; cost: (e: number, x: number) => number }[] = [
  { name: "QQQ", bars: etfHours("QQQ"), hold: 14, cost: () => 2 * 0.0045 },
  { name: "GLD", bars: etfHours("GLD"), hold: 14, cost: () => 2 * 0.0045 },
  { name: "PAXG", bars: cryptoHours("PAXGUSDT"), hold: 48, cost: (e, x) => 0.0005 * (e + x) },
];
const allDays = [...new Set(INST.flatMap((x) => x.bars.day))].sort();

type V = { confirm: Opts["confirm"]; stopMode: Opts["stopMode"]; noCost?: boolean; flipSeed?: number };
function run(v: V, only?: string): (Trade & { inst: string })[] {
  const out: (Trade & { inst: string })[] = [];
  for (const x of INST) {
    if (only && x.name !== only) continue;
    const rnd = v.flipSeed !== undefined ? mulberry32(v.flipSeed) : undefined;
    const o: Opts = { confirm: v.confirm, stopMode: v.stopMode, holdBars: x.hold, cost: v.noCost ? () => 0 : x.cost, ...(rnd ? { flip: () => rnd() < 0.5 } : {}) };
    const t = fibTrades(x.bars, o);
    out.push(...t.map((y) => ({ ...y, inst: x.name })));
  }
  return out;
}
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
function dailySharpe(ts: { day: string; r: number }[], from: string) {
  const days = allDays.filter((d) => d >= from), by = new Map<string, number>();
  for (const t of ts) if (t.day >= from) by.set(t.day, (by.get(t.day) ?? 0) + t.r);
  const r = days.map((d) => by.get(d) ?? 0), m = mean(r), sd = Math.sqrt(mean(r.map((x) => (x - m) ** 2)));
  const years = (Date.parse(days.at(-1)!) - Date.parse(days[0]!)) / (365.25 * 864e5);
  return (m / sd) * Math.sqrt(days.length / years);
}
function stats(ts: (Trade & { inst: string })[]) {
  const r = ts.map((t) => t.r), late = ts.filter((t) => t.day >= LATE);
  const boot = bootstrapByDay(ts.map((t) => ({ day: t.day, r: t.r })));
  const lm = late.length ? mean(late.map((t) => t.r)) : NaN, ls = dailySharpe(ts, LATE);
  const c2 = mean(r) > 0 && boot >= 0.95, c3 = lm > 0 && ls >= 0.5;
  return { n: ts.length, win: ts.filter((t) => t.r > 0).length / ts.length, mean: mean(r), boot, lateN: late.length, lateMean: lm, lateSharpe: ls,
    verdict: c2 && c3 ? "GO (на хартия)" : c2 ? "слабо" : "STOP" };
}
const row = (name: string, ts: (Trade & { inst: string })[]) => {
  if (!ts.length) return `| ${name} | 0 | | | | | |`;
  const s = stats(ts);
  return `| ${name} | ${s.n} | ${fmt(100 * s.win, 0)}% | **${fmt(s.mean, 3)}** | ${fmt(100 * s.boot, 1)}% | ${s.lateN} · ${fmt(s.lateMean, 3)} · ${fmt(s.lateSharpe, 2)} | ${s.verdict} |`;
};
const head = ["| Вариант | Сделки | Печеливши | Средно R | Bootstrap > 0 | 2021-07 –: сделки · R · Sharpe | Решение |", "| --- | --- | --- | --- | --- | --- | --- |"];

const MAIN: V = { confirm: "rsi", stopMode: "L" };
const main = run(MAIN);
let rndSum = 0, rndBeat = 0;
for (let k = 0; k < 100; k++) { const m = mean(run({ ...MAIN, flipSeed: 1000 + k }).map((t) => t.r)); rndSum += m; if (mean(main.map((t) => t.r)) > m) rndBeat++; }
const exitKinds = (ts: Trade[]) => { let st = 0, tg = 0, tm = 0; for (const t of ts) { if (Math.abs(t.exit - t.stop) < 1e-9 || (t.dir === 1 ? t.exit < t.stop : t.exit > t.stop)) st++; else if (Math.abs(t.exit - t.target) < 1e-9 || (t.dir === 1 ? t.exit > t.target : t.exit < t.target)) tg++; else tm++; } return `стоп ${st}, цел ${tg}, по време ${tm}`; };

const out = ["# „Ниво + Фибоначи + потвърждение“: резултати", "", "Правила: `experiments/fib-confluence-preregistration.md`. Часови свещи; R = печалба / риск, нетно след разходи.", "",
  "## Присъда", "", ...head, row("**P1: QQQ + GLD + PAXG, RSI**", main), "",
  `Случайна посока (същите входове и разстояния, 100 повторения): средно ${fmt(rndSum / 100, 3)} R; стратегията е по-добра в ${rndBeat} от 100.`, "",
  `Изходи (P1): ${exitKinds(main)}. Сделки по инструмент: ${INST.map((x) => `${x.name} ${main.filter((t) => t.inst === x.name).length}`).join(", ")}.`, "",
  "## Описателно", "", ...head,
  ...INST.map((x) => row(`${x.name}, RSI`, main.filter((t) => t.inst === x.name))),
  row("без потвърждение", run({ confirm: "none", stopMode: "L" })),
  row("MACD вместо RSI", run({ confirm: "macd", stopMode: "L" })),
  row("стоп зад 0.786", run({ confirm: "rsi", stopMode: "f786" })),
  row("без разходи", run({ ...MAIN, noCost: true })),
  row("без потвърждение, без разходи", run({ confirm: "none", stopMode: "L", noCost: true })), "",
  "## По години (P1, средно R на сделка · брой)", "", [...new Set(main.map((t) => t.day.slice(0, 4)))].sort().map((y) => { const a = main.filter((t) => t.day.startsWith(y)); return `${y}: ${fmt(mean(a.map((t) => t.r)), 3)} · ${a.length}`; }).join("; "), "",
  "Проверка: независим Python код (`scripts/research/xcheck_fib.py`, писан по текста на правилата) върху часовите свещи на GLD дава същите сделки: 77 от 77 с RSI и 373 от 373 без потвърждение (вход, посока, изход и R). Часовите свещи са сверени ръчно с минутните данни за 3 часа.", "",
  `Данни: ${INST.map((x) => `${x.name} ${x.bars.c.length} часови свещи (${x.bars.day[0]} – ${x.bars.day.at(-1)})`).join("; ")}.`, ""];
const text = out.join("\n");
console.log(text);
writeFileSync("reports/fib-confluence.md", text + "\n");
writeFileSync("/tmp/claude-0/-home-claude/9e47a7b8-9735-5e0f-a619-81e08cda7ace/scratchpad/fib-main-trades.json", JSON.stringify(main));
