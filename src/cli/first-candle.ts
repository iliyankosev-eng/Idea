/**
 * "First candle rule" backtest (experiments/first-candle-preregistration.md).
 * Data: data/branch (Alpaca SIP: SPY, QQQ, IWM, GLD) and data/fx/<SYMBOL>/<YEAR>.csv.gz (Dukascopy, branch fxdata).
 * Run: npx tsx src/cli/first-candle.ts   Writes reports/first-candle.md
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { costR, firstCandleTrade, tradeWithDirection, type DayBars, type SessionSpec } from "../ict/firstCandle.js";
import { bootstrapByDay } from "../pm/common.js";

const NY: SessionSpec = { orStart: 570, lastEntry: 720, exitMin: 959 };
const LDN: SessionSpec = { orStart: 480, lastEntry: 660, exitMin: 989 };
const FX = process.env.FX_DIR ?? "data/fx";
const A = "data/branch";

interface Row { inst: string; sess: string; day: string; gross: number; cost: number; net: number; rnd: number; dir: number }
const rows: Row[] = [];
const notes: string[] = [];

function run(inst: string, sess: string, days: DayBars[], spec: SessionSpec, perShare?: number) {
  const rnd = mulberry32(12345);
  let n = 0;
  for (const d of days) {
    if (d.date < "2016-01-01" || d.date > "2026-09-30") continue;
    const t = firstCandleTrade(d, spec);
    if (!t) continue;
    const c = costR(d, t, perShare);
    let rr = 0;
    for (let k = 0; k < 100; k++) rr += tradeWithDirection(d, spec, t, rnd() < 0.5 ? 1 : -1);
    rows.push({ inst, sess, day: d.date, gross: t.r, cost: c, net: t.r - c, rnd: rr / 100 - c, dir: t.dir });
    n++;
  }
  notes.push(`${inst} ${sess}: ${days.length} дни с данни, ${n} сделки`);
}

// ---------- Alpaca ETFs, New York ----------
if (existsSync(`${A}/daily/alpaca/calendar.csv`)) {
  const cal = loadCalendar(`${A}/daily/alpaca/calendar.csv`);
  for (const sym of ["SPY", "QQQ", "IWM", "GLD"]) {
    const ss = completeSessions(toSessions(loadMinuteBars(A, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
    run(sym, "NY", ss.map((s) => ({ date: s.date, m: s.minute, o: s.o, h: s.h, l: s.l, c: s.c })), NY, 0.0045);
  }
}

// ---------- Dukascopy CFDs ----------
const offCache = new Map<string, number>();
const fmts: Record<string, Intl.DateTimeFormat> = {};
/** minutes to add to UTC to get local time in tz, for the UTC hour key "YYYY-MM-DDTHH" */
function offset(tz: string, hourKey: string): number {
  const k = tz + hourKey;
  let v = offCache.get(k);
  if (v === undefined) {
    fmts[tz] ??= new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const d = new Date(`${hourKey}:00:00Z`);
    const p = Object.fromEntries(fmts[tz]!.formatToParts(d).map((x) => [x.type, x.value]));
    v = (Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - d.getTime()) / 60000;
    offCache.set(k, v);
  }
  return v;
}
function loadFx(sym: string, tz: string, spec: SessionSpec): DayBars[] {
  const dir = `${FX}/${sym}`;
  if (!existsSync(dir)) return [];
  const by = new Map<string, { m: number[]; o: number[]; h: number[]; l: number[]; c: number[]; spread: (number | undefined)[] }>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".csv.gz")).sort()) {
    const lines = gunzipSync(readFileSync(`${dir}/${f}`)).toString().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i]!;
      if (!ln) continue;
      const [t, o, h, l, c, ask] = ln.split(",");
      const ms = Date.parse(`${t}:00Z`) + offset(tz, t!.slice(0, 13)) * 60000;
      const loc = new Date(ms).toISOString();
      const m = +loc.slice(11, 13) * 60 + +loc.slice(14, 16);
      if (m < spec.orStart || m > spec.exitMin) continue;
      const date = loc.slice(0, 10);
      let d = by.get(date);
      if (!d) { d = { m: [], o: [], h: [], l: [], c: [], spread: [] }; by.set(date, d); }
      d.m.push(m); d.o.push(+o!); d.h.push(+h!); d.l.push(+l!); d.c.push(+c!); d.spread.push(ask ? +ask - +c! : undefined);
    }
  }
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, d]) => ({ date, ...d }));
}
const FXSYMS: [string, string, boolean, boolean][] = [ // symbol, label, NY, London
  ["XAUUSD", "XAUUSD", true, true], ["EURUSD", "EURUSD", true, true], ["GBPUSD", "GBPUSD", true, true], ["USDJPY", "USDJPY", true, true],
  ["USA500IDXUSD", "US500", true, false], ["USATECHIDXUSD", "US100", true, false], ["DEUIDXEUR", "DAX", false, true], ["GBRIDXGBP", "FTSE", false, true],
];
for (const [sym, label, ny, ldn] of FXSYMS) {
  if (!existsSync(`${FX}/${sym}`)) { notes.push(`${label}: няма данни (${FX}/${sym})`); continue; }
  const years = readdirSync(`${FX}/${sym}`).filter((x) => x.endsWith(".csv.gz")).map((x) => x.slice(0, 4)).sort();
  notes.push(`${label}: години с данни ${years[0]}–${years.at(-1)} (${years.length})`);
  if (ny) run(label, "NY", loadFx(sym, "America/New_York", NY), NY);
  if (ldn) run(label, "Лондон", loadFx(sym, "Europe/London", LDN), LDN);
}

// ---------- statistics ----------
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
function daily(rs: Row[], f: (r: Row) => number) {
  const by = new Map<string, number[]>();
  for (const r of rs) (by.get(r.day) ?? by.set(r.day, []).get(r.day)!).push(f(r));
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, v]) => ({ day, r: mean(v) }));
}
function sharpe(d: { r: number }[]) { const m = mean(d.map((x) => x.r)); const sd = Math.sqrt(mean(d.map((x) => (x.r - m) ** 2))); return (m / sd) * Math.sqrt(252); }
function stats(rs: Row[]) {
  const late = rs.filter((r) => r.day >= "2021-01-01");
  const boot = bootstrapByDay(rs.map((r) => ({ day: r.day, r: r.net })));
  const dl = daily(late, (r) => r.net);
  const c2 = mean(rs.map((r) => r.net)) > 0 && boot >= 0.95, c3 = mean(late.map((r) => r.net)) > 0 && sharpe(dl) >= 0.5;
  return { n: rs.length, win: rs.filter((r) => r.gross > 0).length / rs.length, gross: mean(rs.map((r) => r.gross)), cost: mean(rs.map((r) => r.cost)),
    net: mean(rs.map((r) => r.net)), rnd: mean(rs.map((r) => r.rnd)), boot, lateNet: mean(late.map((r) => r.net)), lateSharpe: sharpe(dl),
    targets: rs.filter((r) => r.gross >= 2.999).length / rs.length, verdict: c2 && c3 ? "GO (кандидат за бота, на хартия)" : c2 ? "слабо" : "STOP" };
}
const line = (name: string, rs: Row[]) => {
  if (!rs.length) return `| ${name} | 0 | | | | | | | | |`;
  const s = stats(rs);
  return `| ${name} | ${s.n} | ${fmt(100 * s.win, 0)}% · ${fmt(100 * s.targets, 0)}% | ${fmt(s.gross, 3)} | ${fmt(s.cost, 3)} | **${fmt(s.net, 3)}** | ${fmt(s.rnd, 3)} | ${fmt(100 * s.boot, 1)}% | ${fmt(s.lateNet, 3)} · ${fmt(s.lateSharpe, 2)} | ${s.verdict} |`;
};
const head = ["| Група | Сделки | Печеливши · до целта 3R | Бруто R | Разход R | Нето R | Случайна посока, нето R | Bootstrap > 0 | 2021–2026: нето R · Sharpe | Решение |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
const keys = [...new Set(rows.map((r) => `${r.inst}|${r.sess}`))];
const xau = rows.filter((r) => r.inst === "XAUUSD");
const out = ["# „First candle rule“: резултати", "", "Правила: `experiments/first-candle-preregistration.md`. R = печалба / риск; нето = след спред и плъзгане (Dukascopy) или $0.0045 на акция и страна (Alpaca).", "",
  "## Присъда", "", ...head, line("**P1: всичко заедно**", rows), line("**P2: XAUUSD (NY + Лондон)**", xau), "",
  "## По инструмент и сесия", "", ...head, ...keys.map((k) => line(k.replace("|", " "), rows.filter((r) => `${r.inst}|${r.sess}` === k))), "",
  "## По години (P1, средно нето R на сделка)", "", [...new Set(rows.map((r) => r.day.slice(0, 4)))].sort().map((y) => `${y}: ${fmt(mean(rows.filter((r) => r.day.startsWith(y)).map((r) => r.net)), 3)}`).join(" · "), "",
  "## Данни", "", ...notes.map((x) => `- ${x}`), ""];
const text = out.join("\n");
console.log(text);
writeFileSync("reports/first-candle.md", text + "\n");
