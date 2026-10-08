/**
 * Multi-market exploration (rules: experiments/explore-multi-preregistration.md, committed before the run).
 * Run: npm run explore   Writes reports/explore-multi.md
 */
import { writeFileSync } from "node:fs";
import { loadCoinMetrics } from "../data/coinmetrics.js";
import { loadBondFromYields, loadFx, loadMonthlyCsv } from "../data/macro.js";
import { loadShiller } from "../data/shiller.js";
import { runBacktest, type BacktestResult } from "../engine.js";
import { metrics, metricsFromReturns, type Metrics } from "../metrics.js";
import { buyAndHold, smaTrend } from "../strategies.js";
import type { Series } from "../types.js";

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const out: string[] = ["# Проучване: trend върху много пазари", "", "Правила: experiments/explore-multi-preregistration.md. Без данъци; кеш 0%.", ""];

interface Run { name: string; s: Series; bh: BacktestResult; tf: BacktestResult; }

function runAsset(s: Series, sma: number, cost: number): Run {
  return {
    name: s.name, s,
    bh: runBacktest(s, buyAndHold, { cost, lag: 1 }),
    tf: runBacktest(s, smaTrend(sma), { cost, lag: 1 }),
  };
}

function perAssetTable(title: string, runs: Run[], warmup: number) {
  out.push(`## ${title}`, "", "| Пазар | Период | CAGR % купи/trend | Max DD % купи/trend | Sharpe купи/trend | Trend намалява срива? |", "| --- | --- | --- | --- | --- | --- |");
  let better = 0;
  for (const r of runs) {
    const start = r.s.dates[warmup]!;
    const b = metrics(r.bh, start), t = metrics(r.tf, start);
    const ok = Math.abs(t.maxDrawdown) < Math.abs(b.maxDrawdown);
    if (ok) better++;
    out.push(`| ${r.name} | ${b.start} – ${b.end} | ${fmt(b.cagr)} / ${fmt(t.cagr)} | ${fmt(b.maxDrawdown)} / ${fmt(t.maxDrawdown)} | ${fmt(b.sharpe, 2)} / ${fmt(t.sharpe, 2)} | ${ok ? "да" : "НЕ"} |`);
  }
  out.push("", `Trend намалява срива при ${better} от ${runs.length} пазара.`, "");
}

/** Equal-weight portfolio of sleeves, rebalanced every bar, over dates common to all sleeves in [start, end]. */
function portfolio(runs: Run[], pick: (r: Run) => BacktestResult, start: string, end: string): { m: Metrics; rets: number[][] } {
  const maps = runs.map((r) => {
    const res = pick(r), m = new Map<string, number>();
    r.s.dates.forEach((d, i) => { if (i > 0) m.set(d, res.returns[i]!); });
    return m;
  });
  const dates = [...maps[0]!.keys()].filter((d) => d >= start && d <= end && maps.every((m) => m.has(d))).sort();
  const sleeves = maps.map((m) => dates.map((d) => m.get(d)!));
  const port = dates.map((_, j) => sleeves.reduce((a, s) => a + s[j]!, 0) / sleeves.length);
  return { m: metricsFromReturns(port, runs[0]!.s.periodsPerYear, { start: dates[0]!, end: dates[dates.length - 1]! }), rets: sleeves };
}

function avgPairwiseCorr(series: number[][]): number {
  const corr = (a: number[], b: number[]) => {
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) { s += (a[i]! - ma) * (b[i]! - mb); sa += (a[i]! - ma) ** 2; sb += (b[i]! - mb) ** 2; }
    return s / Math.sqrt(sa * sb);
  };
  let sum = 0, n = 0;
  for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) { sum += corr(series[i]!, series[j]!); n++; }
  return sum / n;
}

function portfolioSection(title: string, runs: Run[], windows: [string, string][]) {
  out.push(`## ${title}`, "", "| Период | Портфейл | CAGR % | Vol % | Max DD % | Sharpe | Ср. корелация между пазарите |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const [a, b] of windows) {
    const bh = portfolio(runs, (r) => r.bh, a, b), tf = portfolio(runs, (r) => r.tf, a, b);
    out.push(`| ${bh.m.start} – ${bh.m.end} | Купи и дръж, равни тегла | ${fmt(bh.m.cagr, 2)} | ${fmt(bh.m.vol)} | ${fmt(bh.m.maxDrawdown)} | ${fmt(bh.m.sharpe, 2)} | ${fmt(avgPairwiseCorr(bh.rets), 2)} |`);
    out.push(`| ${tf.m.start} – ${tf.m.end} | Trend на всеки, равни тегла | ${fmt(tf.m.cagr, 2)} | ${fmt(tf.m.vol)} | ${fmt(tf.m.maxDrawdown)} | ${fmt(tf.m.sharpe, 2)} | ${fmt(avgPairwiseCorr(tf.rets), 2)} |`);
  }
  out.push("");
}

// ---- macro markets (monthly) ----
const macro: Series[] = [
  loadShiller("data/sp500.csv", { cash: "zero" }),
  loadBondFromYields("data/us10y.csv"),
  loadMonthlyCsv("data/gold.csv", "Gold (spot)", "Price", "1960-01"),
  loadMonthlyCsv("data/wti.csv", "Oil WTI (spot)"),
  ...["United Kingdom", "Japan", "Switzerland", "Canada", "Australia"].map((c) => loadFx("data/fx.csv", c)),
];
const macroRuns = macro.map((s) => runAsset(s, 10, 0.001));
perAssetTable("Макро пазари поотделно (10-месечна средна)", macroRuns, 12);
const sp = macroRuns[0]!, rest = macroRuns.slice(1);
portfolioSection("Макро портфейл: 9 пазара с равни тегла", macroRuns, [["1987-01", "2023-06"], ["1987-01", "2009-12"], ["2010-01", "2023-06"]]);
portfolioSection("Само S&P 500 (за сравнение, същите периоди)", [sp], [["1987-01", "2023-06"], ["1987-01", "2009-12"], ["2010-01", "2023-06"]]);
portfolioSection("8 пазара без S&P 500", rest, [["1987-01", "2023-06"]]);

// ---- crypto (daily) ----
const coins = ["btc", "eth", "ltc", "xrp", "doge", "ada", "bnb", "sol"];
const cryptoRuns: Run[] = [];
for (const c of coins) {
  try { cryptoRuns.push(runAsset(loadCoinMetrics(`data/${c}.csv`, c.toUpperCase()), 100, 0.002)); }
  catch (e) { out.push(`- ${c.toUpperCase()}: пропуснат — ${(e as Error).message}`); }
}
perAssetTable("Крипто поотделно (100-дневна средна)", cryptoRuns, 200);
const latestStart = cryptoRuns.map((r) => r.s.dates[200]!).sort().pop()!;
portfolioSection(`Крипто портфейл: ${cryptoRuns.length} монети с равни тегла (от ${latestStart})`, cryptoRuns, [[latestStart, "9999-12-31"]]);
portfolioSection("Само BTC (същия период)", cryptoRuns.filter((r) => r.name === "BTC"), [[latestStart, "9999-12-31"]]);

const text = out.join("\n");
console.log(text);
writeFileSync("reports/explore-multi.md", text + "\n");
