/**
 * Day-trading lab. Rules are fixed in experiments/daytrading-preregistration.md (committed before the first run).
 * Needs the data branch (npm run data:sync). Run: npm run daytrading   Writes reports/daytrading.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMinuteBars, type Provider } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { randomTrades, realTrades, type Hypothesis } from "../intraday/hypotheses.js";
import { loadCalendar, toSessions, type Calendar } from "../intraday/sessions.js";
import type { IntradayTrade } from "../intraday/sim.js";

const DATA = "data/branch";
const SEEDS = 100, REPS = 2000, BLOCK = 5;

interface Group {
  name: string;
  provider: Provider;
  symbols: Record<string, number>; // symbol -> cost per side
  periodA: [string, string];
  periodB: [string, string];
  hypotheses: Hypothesis[];
  h3Symbols?: string[];
}

const ETF = 0.0002, STOCK = 0.0005;
const groups: Group[] = [
  {
    name: "Акции и ETF", provider: "alpaca",
    symbols: { SPY: ETF, QQQ: ETF, IWM: ETF, GLD: ETF, SLV: ETF, AAPL: STOCK, MSFT: STOCK, NVDA: STOCK, AMZN: STOCK, META: STOCK, GOOGL: STOCK, TSLA: STOCK, AMD: STOCK, INTC: STOCK, BA: STOCK, XOM: STOCK, PFE: STOCK },
    periodA: ["2016-01-01", "2021-12-31"], periodB: ["2022-01-01", "9999-12-31"],
    hypotheses: ["H1", "H2", "H3"], h3Symbols: ["SPY", "QQQ", "IWM"],
  },
  {
    name: "Крипто", provider: "binance",
    symbols: { BTCUSDT: 0.001, ETHUSDT: 0.001, PAXGUSDT: 0.0015 },
    periodA: ["2020-01-01", "2022-12-31"], periodB: ["2023-01-01", "9999-12-31"],
    hypotheses: ["H1", "H2"],
  },
];

/** Months available for a symbol: the longest run of consecutive months in the manifest ending at the last one. */
function availableMonths(provider: Provider, symbol: string): [string, string] | null {
  const path = join(DATA, "intraday", provider, "manifest.json");
  if (!existsSync(path)) return null;
  const ms = Object.keys(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
    .filter((k) => k.startsWith(`${symbol}/1m/`)).map((k) => k.slice(-7)).sort();
  if (ms.length === 0) return null;
  let first = ms.length - 1;
  const next = (m: string) => { const [y, mo] = m.split("-").map(Number) as [number, number]; return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
  while (first > 0 && next(ms[first - 1]!) === ms[first]) first--;
  return [ms[first]!, ms[ms.length - 1]!];
}

/** The official exchange calendar is required for stocks (holidays, early closes at 13:00). */
let calCache: Calendar | null = null;
function stockCalendar(): Calendar {
  const p = join(DATA, "daily", "alpaca", "calendar.csv");
  if (!existsSync(p)) throw new Error(`${p} missing: run the data job and npm run data:sync`);
  return (calCache ??= loadCalendar(p));
}

interface Stats { n: number; perYear: number; win: number; avgWin: number; avgLoss: number; pf: number; meanBp: number; meanR: number; cagr: number; boot: number; days: number }

function stats(trades: IntradayTrade[], days: string[]): Stats {
  const n = trades.length;
  const wins = trades.filter((t) => t.ret > 0), losses = trades.filter((t) => t.ret <= 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const byDay = new Map<string, number[]>();
  for (const t of trades) (byDay.get(t.date) ?? byDay.set(t.date, []).get(t.date)!).push(t.ret);
  const daily = days.map((d) => { const xs = byDay.get(d); return xs ? sum(xs) / xs.length : 0; });
  const years = days.length > 1 ? (Date.parse(days[days.length - 1]!) - Date.parse(days[0]!)) / (365.25 * 86_400_000) : NaN;
  const growth = daily.reduce((g, r) => g * (1 + r), 1);
  // block bootstrap of the daily series: share of resamples with a positive mean
  const rnd = mulberry32(42), m = daily.length;
  let pos = 0;
  for (let rep = 0; rep < REPS && m > 0; rep++) {
    let s = 0, k = 0;
    while (k < m) { const st = Math.floor(rnd() * m); for (let j = 0; j < BLOCK && k < m; j++, k++) s += daily[(st + j) % m]!; }
    if (s > 0) pos++;
  }
  const rs = trades.map((t) => t.r).filter((x) => Number.isFinite(x));
  return {
    n, perYear: n / years, win: n ? (100 * wins.length) / n : NaN,
    avgWin: wins.length ? (100 * sum(wins.map((t) => t.ret))) / wins.length : NaN,
    avgLoss: losses.length ? (100 * sum(losses.map((t) => t.ret))) / losses.length : NaN,
    pf: losses.length ? sum(wins.map((t) => t.ret)) / -sum(losses.map((t) => t.ret)) : Infinity,
    meanBp: n ? (1e4 * sum(trades.map((t) => t.ret))) / n : NaN,
    meanR: rs.length ? sum(rs) / rs.length : NaN,
    cagr: (growth ** (1 / years) - 1) * 100, boot: m ? pos / REPS : NaN, days: m,
  };
}

const out: string[] = ["# Лаборатория за дневна търговия — резултати", "",
  "Правила: experiments/daytrading-preregistration.md. Доходност на сделка след разходи; без ливъридж (100% от капитала на сделка, при няколко едновременни сделки капиталът се дели поравно). bp = 0.01%.", ""];
const verdicts: string[] = [];
const notes: string[] = [];

for (const g of groups) {
  // real[h][period][costMult], random[h] = per-seed trades (period B, cost x1); dates per period
  const real = new Map<string, IntradayTrade[]>();
  const rand = new Map<string, IntradayTrade[][]>();
  const dates = { A: new Set<string>(), B: new Set<string>() };
  const perSymbol: string[] = [];
  const used: string[] = [];
  for (const [sym, cost] of Object.entries(g.symbols)) {
    const range = availableMonths(g.provider, sym);
    if (!range) { notes.push(`${g.name}: ${sym} — няма данни (още се теглят)`); continue; }
    const ss = toSessions(loadMinuteBars(DATA, sym, range[0], range[1], g.provider), g.provider === "alpaca" ? stockCalendar() : undefined);
    used.push(`${sym} ${range[0]}–${range[1]}`);
    for (const s of ss) {
      if (s.date >= g.periodA[0] && s.date <= g.periodA[1]) dates.A.add(s.date);
      if (s.date >= g.periodB[0] && s.date <= g.periodB[1]) dates.B.add(s.date);
    }
    for (const h of g.hypotheses) {
      if (h === "H3" && !g.h3Symbols?.includes(sym)) continue;
      for (const [pName, [from, to]] of [["A", g.periodA], ["B", g.periodB]] as const) {
        for (const mult of [0, 1, 2]) {
          const key = `${h}|${pName}|${mult}`;
          const tr = realTrades(h, ss, from, to, cost * mult);
          real.set(key, [...(real.get(key) ?? []), ...tr]);
          if (pName === "B" && mult === 1) {
            const st = stats(tr, [...new Set(tr.map((t) => t.date))].sort());
            perSymbol.push(`| ${h} | ${sym} | ${st.n} | ${fmt(st.win, 0)} | ${fmt(st.meanBp, 1)} | ${fmt(st.meanR, 3)} |`);
            const seeds = rand.get(h) ?? Array.from({ length: SEEDS }, () => [] as IntradayTrade[]);
            for (let sd = 0; sd < SEEDS; sd++) seeds[sd]!.push(...randomTrades(h, ss, from, to, cost, tr, 1000 + sd));
            rand.set(h, seeds);
          }
        }
      }
    }
  }
  out.push(`## ${g.name}`, "", `Данни: ${used.join("; ") || "няма"}.`, "");
  for (const h of g.hypotheses) {
    const dA = [...dates.A].sort(), dB = [...dates.B].sort();
    const B1 = stats(real.get(`${h}|B|1`) ?? [], dB);
    const seedMeans = (rand.get(h) ?? []).map((ts) => (ts.length ? ts.reduce((a, t) => a + t.ret, 0) / ts.length : NaN));
    const beats = seedMeans.filter((x) => B1.meanBp / 1e4 > x).length;
    const randWin = (rand.get(h) ?? []).map((ts) => (ts.length ? (100 * ts.filter((t) => t.ret > 0).length) / ts.length : NaN));
    out.push(`### ${h}`, "",
      "| Период · разходи | Сделки · на година | Успеваемост % | Ср. печалба % · ср. загуба % | Profit factor | Средно на сделка bp · в R | %/год (без ливъридж) | Bootstrap > 0 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const [pName, days] of [["A", dA], ["B", dB]] as const) {
      for (const mult of [0, 1, 2]) {
        const s = stats(real.get(`${h}|${pName}|${mult}`) ?? [], days);
        out.push(`| ${pName} · ${mult}× | ${s.n} · ${fmt(s.perYear, 0)} | ${fmt(s.win, 1)} | ${fmt(s.avgWin, 2)} · ${fmt(s.avgLoss, 2)} | ${fmt(s.pf, 2)} | ${fmt(s.meanBp, 1)} · ${fmt(s.meanR, 3)} | ${fmt(s.cagr, 1)} | ${fmt(s.boot * 100, 0)}% |`);
      }
    }
    const randMean = seedMeans.reduce((a, b) => a + b, 0) / seedMeans.length;
    out.push("", `Случаен вход (период B, 1× разходи, ${SEEDS} серии): средно ${fmt(randMean * 1e4, 1)} bp на сделка, успеваемост ${fmt(Math.min(...randWin), 0)}–${fmt(Math.max(...randWin), 0)}%. Стратегията е по-добра от ${beats} от ${SEEDS} серии.`, "");
    const c1 = B1.meanBp > 0 && B1.boot >= 0.95, c2 = beats >= 95;
    verdicts.push(`| ${h} | ${g.name} | ${B1.n} | ${fmt(B1.win, 1)}% | ${fmt(B1.meanBp, 1)} bp | ${fmt(B1.boot * 100, 0)}% | ${beats}/${SEEDS} | ${c1 && c2 ? "GO (следене напред)" : c1 || c2 ? "слабо" : "STOP"} |`);
  }
  out.push("### По символи (период B, 1× разходи)", "", "| Хипотеза | Символ | Сделки | Успеваемост % | Средно bp | Средно R |", "| --- | --- | --- | --- | --- | --- |", ...perSymbol, "");
}

out.push("## Присъда (период B, след разходи)", "",
  "| Хипотеза | Група | Сделки | Успеваемост | Средно на сделка | Bootstrap > 0 | По-добра от случайни серии | Решение |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |", ...verdicts, "",
  "GO = печалба (bootstrap ≥ 95%) И по-добра от ≥ 95 от 100 случайни серии. Едно от двете = слабо. Нито едно = STOP.");
if (notes.length) out.push("", "## Бележки", "", ...notes.map((n) => `- ${n}`));
const text = out.join("\n");
console.log(text);
writeFileSync("reports/daytrading.md", text + "\n");
