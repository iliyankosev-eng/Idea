/**
 * Phase 2 runner. Rules are fixed in experiments/phase2-preregistration.md (committed before the first run).
 * Run: npm run phase2   (needs npm run data first). Writes reports/phase2-results.md
 */
import { writeFileSync } from "node:fs";
import { loadCoinMetrics } from "../data/coinmetrics.js";
import { loadShiller } from "../data/shiller.js";
import { runBacktest } from "../engine.js";
import type { Strategy } from "../history.js";
import { windowRange, type Metrics } from "../metrics.js";
import { simulatePortfolio, type PortfolioResult } from "../portfolio.js";
import { buyAndHold, smaTrend, volTarget } from "../strategies.js";
import type { Series } from "../types.js";

interface AssetConfig {
  name: string;
  series: Series;
  is: [string, string];
  oos: [string, string];
  smaLength: number;
  volLookback: number;
  cost: number;
  taxRate: number;
  bootstrapBlock: number;
}

const BAND = 0.1;
const LAG = 1;
const REPS = 2000;

/** Annualised sample volatility of the asset's own returns inside [start, end]. */
function realisedVol(s: Series, start: string, end: string): number {
  const [i0, i1] = windowRange(s.dates, start, end);
  const r = s.ret.slice(i0, i1 + 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return sd * Math.sqrt(s.periodsPerYear);
}

function sharpe(r: readonly number[], ppy: number): number {
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return sd > 0 ? (m / sd) * Math.sqrt(ppy) : 0;
}

/** Deterministic PRNG so the bootstrap is reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Circular block bootstrap of paired returns: share of resamples where Sharpe(a) > Sharpe(b). */
function bootstrapSharpeWin(a: readonly number[], b: readonly number[], block: number, ppy: number, seed = 42): number {
  const n = a.length, rnd = mulberry32(seed);
  let wins = 0;
  for (let rep = 0; rep < REPS; rep++) {
    const ra: number[] = [], rb: number[] = [];
    while (ra.length < n) {
      const s = Math.floor(rnd() * n);
      for (let j = 0; j < block && ra.length < n; j++) {
        ra.push(a[(s + j) % n]!);
        rb.push(b[(s + j) % n]!);
      }
    }
    if (sharpe(ra, ppy) > sharpe(rb, ppy)) wins++;
  }
  return wins / REPS;
}

function simulate(c: AssetConfig, strat: Strategy, [start, end]: [string, string]): PortfolioResult {
  const decisions = runBacktest(c.series, strat, { cost: 0, lag: LAG }).decisions;
  return simulatePortfolio(c.series, decisions, { start, end, lag: LAG, cost: c.cost, band: BAND, taxRate: c.taxRate });
}

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const row = (label: string, m: Metrics, extra: string) =>
  `| ${label} | ${fmt(m.cagr, 2)} | ${fmt(m.vol)} | ${fmt(m.maxDrawdown)} | ${fmt(m.sharpe, 2)} | ${extra} |`;

const assets: AssetConfig[] = [
  { name: "S&P 500", series: loadShiller("data/sp500.csv"), is: ["1881-01", "1979-12"], oos: ["1980-01", "2023-06"],
    smaLength: 10, volLookback: 12, cost: 0.001, taxRate: 0, bootstrapBlock: 6 },
  { name: "BTC", series: loadCoinMetrics("data/btc.csv", "BTC"), is: ["2014-01-01", "2020-12-31"], oos: ["2021-01-01", "9999-12-31"],
    smaLength: 100, volLookback: 30, cost: 0.002, taxRate: 0.09, bootstrapBlock: 20 },
  { name: "ETH", series: loadCoinMetrics("data/eth.csv", "ETH"), is: ["2016-06-01", "2020-12-31"], oos: ["2021-01-01", "9999-12-31"],
    smaLength: 100, volLookback: 30, cost: 0.002, taxRate: 0.09, bootstrapBlock: 20 },
];

const out: string[] = ["# Фаза 2 — резултати", "", "Правила: experiments/phase2-preregistration.md. Всички числа са след разходи и данък, с продажба в края.", ""];
const verdicts: string[] = [];

for (const c of assets) {
  const target = realisedVol(c.series, ...c.is);
  const vt = (base: Strategy, lookMul = 1, targetMul = 1) =>
    volTarget(base, { targetVol: target * targetMul, lookback: Math.round(c.volLookback * lookMul), maxWeight: 1 });
  const trend = smaTrend(c.smaLength);
  const variants: [string, Strategy][] = [
    ["1. Основа (купи и дръж)", buyAndHold],
    [`2. Trend (SMA ${c.smaLength})`, trend],
    ["3. Vol-sizing на основата", vt(buyAndHold)],
    ["4. Vol-sizing на trend", vt(trend)],
  ];
  out.push(`## ${c.name}`, "", `Целева волатилност (от in-sample ${c.is[0]}–${c.is[1]}): ${fmt(target * 100)}%`, "");

  for (const [label, win] of [["In-sample (настройка)", c.is], ["Out-of-sample (проверка)", c.oos]] as const) {
    const results = variants.map(([n, s]) => [n, simulate(c, s, win)] as const);
    const base = results[0]![1];
    out.push(`### ${label}: ${base.dates[0]} – ${base.dates[base.dates.length - 1]}`, "",
      "| Вариант | CAGR % | Vol % | Max DD % | Sharpe | Сделки/год · Разходи · Данъци · Bootstrap |", "| --- | --- | --- | --- | --- | --- |");
    for (const [n, r] of results) {
      const m = r.metrics;
      const isBase = r === base;
      const boot = isBase ? "" : ` · bootstrap ${fmt(bootstrapSharpeWin(r.returns, base.returns, c.bootstrapBlock, c.series.periodsPerYear) * 100, 0)}%`;
      out.push(row(n, m, `${fmt(r.trades / m.years, 1)} · ${fmt(r.costsPaid * 100, 1)}% · ${fmt(r.taxesPaid * 100, 1)}%${boot}`));
      if (!isBase && label.startsWith("Out")) {
        const b = base.metrics;
        const risk = m.sharpe > b.sharpe && Math.abs(m.maxDrawdown) <= (2 / 3) * Math.abs(b.maxDrawdown);
        const ret = m.cagr >= b.cagr;
        const bootP = bootstrapSharpeWin(r.returns, base.returns, c.bootstrapBlock, c.series.periodsPerYear);
        verdicts.push(`| ${c.name} | ${n} | ${risk ? "ДА" : "НЕ"} | ${ret ? "ДА" : "НЕ"} | ${fmt(bootP * 100, 0)}% | ${risk ? (bootP >= 0.9 ? "GO" : "GO (слабо)") : "STOP"} |`);
      }
    }
    out.push("");
  }

  // robustness (reported only)
  out.push("### Устойчивост на out-of-sample (само за информация)", "", "| Вариант | lookback × | цел × | CAGR % | Max DD % | Sharpe |", "| --- | --- | --- | --- | --- | --- |");
  for (const [n, base] of [["3. Vol-sizing на основата", buyAndHold], ["4. Vol-sizing на trend", trend]] as const) {
    for (const [lm, tm] of [[0.5, 1], [2, 1], [1, 0.75], [1, 1.25]] as const) {
      const m = simulate(c, vt(base, lm, tm), c.oos).metrics;
      out.push(`| ${n} | ${lm} | ${tm} | ${fmt(m.cagr, 2)} | ${fmt(m.maxDrawdown)} | ${fmt(m.sharpe, 2)} |`);
    }
  }
  out.push("");
}

out.push("## Присъда по предварителните критерии (out-of-sample)", "",
  "| Актив | Вариант | Риск-критерий | Доходност ≥ основата | Bootstrap | Решение |", "| --- | --- | --- | --- | --- | --- |", ...verdicts, "",
  "Напомняне: trend (вариант 2) е бил виждан преди регистрацията — слабо доказателство. Единственият чист тест е следенето напред (Фаза 3).");

const text = out.join("\n");
console.log(text);
writeFileSync("reports/phase2-results.md", text + "\n");
