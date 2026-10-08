/**
 * Phase 1 calibration report: compares the engine with Faber's published S&P 500 numbers (1901-2012)
 * and prints the reference cases. Run: npm run report   (needs npm run data first)
 */
import { writeFileSync } from "node:fs";
import { loadShiller } from "../data/shiller.js";
import { runBacktest } from "../engine.js";
import { metrics, type Metrics } from "../metrics.js";
import { buyAndHold, smaTrend } from "../strategies.js";

const f = (x: number, d = 1) => x.toFixed(d);
const row = (label: string, m: Metrics) =>
  `| ${label} | ${f(m.cagr, 2)} | ${f(m.vol)} | ${f(m.maxDrawdown)} | ${f(m.sharpe, 2)} | ${f(m.turnoverPerYear, 2)} |`;

const sp = loadShiller("data/sp500.csv");
const win = ["1901-01", "2012-12"] as const;
const bh = metrics(runBacktest(sp, buyAndHold, { cost: 0, lag: 0 }), ...win);
const tf0 = metrics(runBacktest(sp, smaTrend(10), { cost: 0, lag: 0 }), ...win);
const tf1 = metrics(runBacktest(sp, smaTrend(10), { cost: 0, lag: 1 }), ...win);

const lines = [
  "# Phase 1 calibration: S&P 500, 1901-2012, no costs",
  "",
  "Published (Faber, month-end total returns): buy-and-hold 9.3%/yr, vol 17.9%, max DD -83.5%; 10-month SMA 10.2%/yr, vol 12.0%, max DD -50.3%.",
  "",
  "| Strategy (this engine, Shiller monthly averages) | CAGR % | Vol % | Max DD % | Sharpe | Turnover/yr |",
  "| --- | --- | --- | --- | --- | --- |",
  row("Buy-and-hold", bh),
  row("SMA 10, lag 0 (biased: month-average look-ahead)", tf0),
  row("SMA 10, lag 1 (honest for this data)", tf1),
  "",
  "Notes: monthly averages smooth prices, so volatility is lower than Faber's month-end data;",
  "lag 0 on averaged data peeks half a month ahead, which is why lag 1 is the honest setting here.",
];
const text = lines.join("\n");
console.log(text);
writeFileSync("reports/phase1-calibration.md", text + "\n");
