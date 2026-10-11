/**
 * H4 — Opening Range Reversal + PML/PMH sweep. Rules: experiments/h4-orr-preregistration.md (committed before the first run).
 * Needs the data branch with daily/alpaca/premarket (npm run data:sync). Run: npx tsx src/cli/h4.ts  Writes reports/h4-orr.md
 */
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { h4Signal, loadPremarket, type H4Signal } from "../intraday/h4.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";
import { simulateTrade, type IntradayTrade } from "../intraday/sim.js";

const D = "data/branch";
const SYMBOLS = ["SPY", "QQQ"];
const PERIODS: Record<string, [string, string]> = { A: ["2016-01-01", "2021-12-31"], B: ["2022-01-01", "2026-09-30"], C: ["2026-03-01", "2026-09-30"] };
const COST_R = 0.2, SEEDS = 100, REPS = 2000, BLOCK = 5, SHARE_COST = 0.0002;

interface T { sym: string; date: string; side: "long" | "short"; sig: H4Signal; trade: IntradayTrade; session: Session }

const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const all: Record<"main" | "orOnly", T[]> = { main: [], orOnly: [] };
const days: Record<string, Set<string>> = { A: new Set(), B: new Set(), C: new Set() };
for (const sym of SYMBOLS) {
  const pm = loadPremarket(`${D}/daily/alpaca/premarket/${sym}.csv`);
  const ss = completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
  for (const s of ss) {
    for (const [p, [a, b]] of Object.entries(PERIODS)) if (s.date >= a && s.date <= b) days[p]!.add(s.date);
    for (const [variant, usePm] of [["main", true], ["orOnly", false]] as const) {
      const sig = h4Signal(s, pm.get(s.date), usePm);
      if (!sig) continue;
      const trade = simulateTrade(s, sig.plan, 0);
      if (trade) all[variant].push({ sym, date: s.date, side: sig.side, sig, trade, session: s });
    }
  }
}

const inP = (t: T, p: string) => t.date >= PERIODS[p]![0] && t.date <= PERIODS[p]![1];
const netR = (t: T, costR: number) => t.trade.r - costR;
const shareNetR = (t: T) => t.trade.r - (2 * SHARE_COST * t.sig.entry) / t.sig.risk;

function stats(ts: T[], p: string, r: (t: T) => number) {
  const xs = ts.map(r), n = xs.length;
  const wins = xs.filter((x) => x > 0), losses = xs.filter((x) => x <= 0);
  const dl = [...days[p]!].sort();
  const byDay = new Map<string, number[]>();
  ts.forEach((t, i) => (byDay.get(t.date) ?? byDay.set(t.date, []).get(t.date)!).push(xs[i]!));
  const daily = dl.map((d) => { const v = byDay.get(d); return v ? v.reduce((a, b) => a + b, 0) / v.length : 0; });
  const rnd = mulberry32(42); let pos = 0;
  for (let rep = 0; rep < REPS && daily.length; rep++) {
    let sum = 0, k = 0;
    while (k < daily.length) { const st = Math.floor(rnd() * daily.length); for (let j = 0; j < BLOCK && k < daily.length; j++, k++) sum += daily[(st + j) % daily.length]!; }
    if (sum > 0) pos++;
  }
  const years = dl.length / 252;
  return { n, perYear: n / years, win: (100 * wins.length) / n, avgWin: wins.reduce((a, b) => a + b, 0) / wins.length, avgLoss: losses.reduce((a, b) => a + b, 0) / losses.length,
    mean: xs.reduce((a, b) => a + b, 0) / n, boot: pos / REPS };
}

/** Random direction, same session, same entry minute, same % distances to stop and target. */
function randomMeans(ts: T[], costR: number): number[] {
  const out: number[] = [];
  for (let sd = 0; sd < SEEDS; sd++) {
    const rnd = mulberry32(5000 + sd); let sum = 0, n = 0;
    for (const t of ts) {
      const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
      const stopPct = t.sig.risk / t.sig.entry, targetPct = Math.abs(t.sig.plan.target! - t.sig.entry) / t.sig.entry;
      const r = simulateTrade(t.session, { dir, entryMinute: t.sig.entryMinute, exitMinute: t.sig.plan.exitMinute, stop: null, target: null, stopPct, targetPct }, 0);
      if (r) { sum += r.r - costR; n++; }
    }
    out.push(sum / n);
  }
  return out;
}

const row = (label: string, s: ReturnType<typeof stats>) =>
  `| ${label} | ${s.n} · ${fmt(s.perYear, 0)} | ${fmt(s.win, 1)} | ${fmt(s.avgWin, 2)} · ${fmt(s.avgLoss, 2)} | ${fmt(s.mean, 3)} | ${fmt(s.boot * 100, 0)}% |`;
const head = ["| Вариант | Сделки · на година | Успеваемост % | Ср. печалба R · ср. загуба R | Средно R на сделка | Bootstrap > 0 |", "| --- | --- | --- | --- | --- | --- |"];

const out: string[] = ["# H4 — Opening Range Reversal + PML/PMH sweep (setup-ът на Brandon Flood)", "",
  "Правила: experiments/h4-orr-preregistration.md. Резултат в R (печалба / риск) върху цената на SPY/QQQ. Основен разход 0.2R на сделка.", ""];
const main = all.main;
for (const p of ["A", "B", "C"]) {
  const ts = main.filter((t) => inP(t, p));
  out.push(`## Период ${p} (${PERIODS[p]![0]} – ${PERIODS[p]![1]})`, "", ...head,
    row("Преди разходи (0R)", stats(ts, p, (t) => netR(t, 0))),
    row("Разход 0.1R", stats(ts, p, (t) => netR(t, 0.1))),
    row("**Разход 0.2R (основен)**", stats(ts, p, (t) => netR(t, COST_R))),
    row("Разход 0.4R", stats(ts, p, (t) => netR(t, 0.4))),
    row("Акции вместо опции (0.02% на страна)", stats(ts, p, shareNetR)),
    row("Само покупки (0.2R)", stats(ts.filter((t) => t.side === "long"), p, (t) => netR(t, COST_R))),
    row("Само къси продажби (0.2R)", stats(ts.filter((t) => t.side === "short"), p, (t) => netR(t, COST_R))),
    row("Само SPY (0.2R)", stats(ts.filter((t) => t.sym === "SPY"), p, (t) => netR(t, COST_R))),
    row("Само QQQ (0.2R)", stats(ts.filter((t) => t.sym === "QQQ"), p, (t) => netR(t, COST_R))),
    row("Вариант без PML/PMH (0.2R)", stats(all.orOnly.filter((t) => inP(t, p)), p, (t) => netR(t, COST_R))), "");
}

const B = main.filter((t) => inP(t, "B"));
const sB = stats(B, "B", (t) => netR(t, COST_R));
const rm = randomMeans(B, COST_R);
const beats = rm.filter((x) => sB.mean > x).length;
const reasons = ["target", "stop", "time"].map((r) => `${r}: ${B.filter((t) => t.trade.reason === r).length}`).join(", ");
out.push("## Присъда (период B, разход 0.2R, SPY и QQQ заедно)", "",
  `- Сделки: ${sB.n} (${fmt(sB.perYear, 0)} на година); изходи: ${reasons}.`,
  `- Средно на сделка: ${fmt(sB.mean, 3)}R; bootstrap > 0: ${fmt(sB.boot * 100, 0)}%.`,
  `- Случайна посока (100 серии): средно ${fmt(rm.reduce((a, b) => a + b, 0) / rm.length, 3)}R; стратегията е по-добра от ${beats} от 100.`,
  `- **Решение: ${sB.mean > 0 && sB.boot >= 0.95 && beats >= 95 ? "GO (следене напред)" : (sB.mean > 0 && sB.boot >= 0.95) || beats >= 95 ? "слабо" : "STOP"}**`, "");

// How close is the mechanical rule to his own posted opening-range-reversal trades? (date, symbol, side, approx. entry time)
const his: [string, string, "long" | "short", string][] = [
  ["2026-03-06", "SPY", "long", "10:05"], ["2026-04-23", "SPY", "short", "09:53"], ["2026-05-07", "SPY", "long", "09:55"], ["2026-05-15", "SPY", "long", "09:50"],
  ["2026-07-14", "SPY", "long", "10:20"], ["2026-07-16", "SPY", "long", "09:52"], ["2026-07-22", "SPY", "long", "10:45"], ["2026-07-28", "SPY", "long", "10:10"],
  ["2026-08-07", "QQQ", "long", "10:50"], ["2026-08-10", "SPY", "long", "09:48"], ["2026-08-11", "SPY", "long", "09:45"], ["2026-08-17", "SPY", "long", "10:05"],
  ["2026-08-18", "SPY", "long", "10:10"], ["2026-08-19", "SPY", "long", "10:05"], ["2026-08-20", "SPY", "long", "10:20"], ["2026-09-08", "SPY", "long", "10:05"],
  ["2026-09-10", "SPY", "long", "10:15"], ["2026-09-17", "SPY", "long", "10:15"],
];
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const lines: string[] = [];
let sameDay = 0, sameSide = 0, near = 0;
for (const [d, sym, side, time] of his) {
  const t = main.find((x) => x.date === d && x.sym === sym) ?? null;
  const o = all.orOnly.find((x) => x.date === d && x.sym === sym) ?? null;
  if (t) sameDay++;
  if (t && t.side === side) sameSide++;
  const ok = t && t.side === side && Math.abs(t.sig.entryMinute - hm(time)) <= 20;
  if (ok) near++;
  const f = (x: T | null) => (x ? `${x.side}, вход ${Math.floor(x.sig.entryMinute / 60)}:${String(x.sig.entryMinute % 60).padStart(2, "0")}, ${fmt(x.trade.r, 2)}R` : "няма");
  lines.push(`| ${d} | ${sym} | ${side} ~${time} | ${f(t)} | ${f(o)} |`);
}
out.push("## Доколко правилото прави неговите сделки (описателно)", "",
  `Негови публикувани сделки „opening range reversal“: ${his.length}. Правилото дава сделка същия ден: ${sameDay}; в същата посока: ${sameSide}; и с вход в рамките на ±20 минути: ${near}.`, "",
  "| Дата | Символ | Той (приблизително) | Правилото (с PML/PMH) | Вариант само ORL/ORH |", "| --- | --- | --- | --- | --- |", ...lines, "");

const text = out.join("\n");
console.log(text);
writeFileSync("reports/h4-orr.md", text + "\n");
