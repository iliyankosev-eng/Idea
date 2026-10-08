/**
 * Cross-check against real data:
 * 1) The TypeScript engine must reproduce numbers from an independent Python implementation
 *    (scripts/golden_python.py -> test/fixtures/golden.json).
 * 2) Calibration against a PUBLISHED result (Faber, S&P 500 buy-and-hold 1901-2012).
 * Skipped automatically when the data files are not downloaded (npm run data).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCoinMetrics } from "../src/data/coinmetrics.js";
import { loadShiller } from "../src/data/shiller.js";
import { runBacktest } from "../src/engine.js";
import { metrics, type Metrics } from "../src/metrics.js";
import { buyAndHold, smaTrend } from "../src/strategies.js";
import type { Series } from "../src/types.js";

const files = { sp: "data/sp500.csv", btc: "data/btc.csv", eth: "data/eth.csv" };
const haveData = Object.values(files).every((f) => existsSync(f));

type G = { cagr: number; vol: number; maxDrawdown: number; sharpe: number; periods: number };
const golden = JSON.parse(readFileSync("test/fixtures/golden.json", "utf8")) as Record<string, { bh: G; tf: G }>;

function expectMatch(actual: Metrics, expected: G) {
  expect(actual.periods).toBe(expected.periods);
  // Small tolerance: the only known difference is whether a switch exactly on the window's first bar is charged.
  expect(Math.abs(actual.cagr - expected.cagr)).toBeLessThan(0.02);
  expect(Math.abs(actual.vol - expected.vol)).toBeLessThan(0.02);
  expect(Math.abs(actual.maxDrawdown - expected.maxDrawdown)).toBeLessThan(0.05);
  expect(Math.abs(actual.sharpe - expected.sharpe)).toBeLessThan(0.005);
}

function check(key: string, s: Series, n: number, cost: number, start: string, end?: string) {
  const g = golden[key];
  if (!g) throw new Error(`golden case ${key} missing`);
  expectMatch(metrics(runBacktest(s, buyAndHold, { cost: 0, lag: 0 }), start, end), g.bh);
  expectMatch(metrics(runBacktest(s, smaTrend(n), { cost, lag: 1 }), start, end), g.tf);
}

describe.skipIf(!haveData)("matches the independent Python implementation", () => {
  it("S&P 500, 10-month SMA, cash = 10y yield, 1881-2023", () =>
    check("sp500_sma10_long10y", loadShiller(files.sp), 10, 0.001, "1881-01", "2023-06"));
  it("S&P 500, 10-month SMA, cash = 0%", () =>
    check("sp500_sma10_zero", loadShiller(files.sp, { cash: "zero" }), 10, 0.001, "1881-01", "2023-06"));
  it("S&P 500, 12-month SMA", () =>
    check("sp500_sma12_long10y", loadShiller(files.sp), 12, 0.001, "1881-01", "2023-06"));
  it("S&P 500, 10-month SMA, 2010-2023 only", () =>
    check("sp500_sma10_long10y_2010", loadShiller(files.sp), 10, 0.001, "2010-01", "2023-06"));
  it("BTC 100-day SMA, 2015-2020", () =>
    check("btc_sma100_2015_2020", loadCoinMetrics(files.btc, "BTC"), 100, 0.002, "2015-01-01", "2020-12-31"));
  it("BTC 100-day SMA, 2021-end", () =>
    check("btc_sma100_2021_end", loadCoinMetrics(files.btc, "BTC"), 100, 0.002, "2021-01-01"));
  it("BTC 50-day SMA, 2021-end", () =>
    check("btc_sma50_2021_end", loadCoinMetrics(files.btc, "BTC"), 50, 0.002, "2021-01-01"));
  it("ETH 200-day SMA, 2021-end", () =>
    check("eth_sma200_2021_end", loadCoinMetrics(files.eth, "ETH"), 200, 0.002, "2021-01-01"));
});

describe.skipIf(!haveData)("calibration against a published result", () => {
  it("S&P 500 buy-and-hold 1901-2012 is close to Faber's 9.3% a year and -83.5% max drawdown", () => {
    // Faber uses month-end total returns; Shiller uses monthly averages, so allow some difference.
    const m = metrics(runBacktest(loadShiller(files.sp), buyAndHold, { cost: 0, lag: 0 }), "1901-01", "2012-12");
    expect(Math.abs(m.cagr - 9.3)).toBeLessThan(0.5);
    expect(Math.abs(m.maxDrawdown - -83.5)).toBeLessThan(3);
  });
});
