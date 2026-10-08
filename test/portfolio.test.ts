import { describe, expect, it } from "vitest";
import { runBacktest } from "../src/engine.js";
import { simulatePortfolio } from "../src/portfolio.js";
import { smaTrend } from "../src/strategies.js";
import type { Series } from "../src/types.js";
import { makeSeries, randomWalk } from "./helpers.js";

function dated(dates: string[], prices: number[], cash = 0): Series {
  const s = makeSeries(prices, cash);
  return { ...s, dates };
}

describe("simulatePortfolio equals runBacktest when it should", () => {
  it("0/1 weights, rebalance always, no tax, no final sale: identical bar returns after the first bar", () => {
    const s = makeSeries(randomWalk(600, 3), 0.0001);
    const bt = runBacktest(s, smaTrend(20), { cost: 0.002, lag: 1 });
    const start = s.dates[100]!;
    const pf = simulatePortfolio(s, bt.decisions, { start, lag: 1, cost: 0.002, band: 0, taxRate: 0, liquidateAtEnd: false });
    // bar 1 of the window may differ: the simulator starts flat, the engine may already be invested
    for (let j = 1; j < pf.returns.length; j++) {
      expect(pf.returns[j]).toBeCloseTo(bt.returns[100 + j]!, 12);
    }
  });
});

describe("tax (hand-calculated)", () => {
  it("10% tax on a 20% gain realised in the same year: end wealth 1.18", () => {
    const s = dated(["2021-01-01", "2021-01-02", "2021-01-03", "2021-01-04"], [100, 100, 120, 120]);
    const pf = simulatePortfolio(s, [1, 1, 0, 0], { lag: 0, cost: 0, band: 0, taxRate: 0.1 });
    expect(pf.metrics.totalReturn).toBeCloseTo(18, 10);
    expect(pf.taxesPaid).toBeCloseTo(0.02, 12);
  });

  it("a loss next year does NOT reduce tax already due on last year's gain (no carry-forward or back)", () => {
    const dates = ["2020-12-28", "2020-12-29", "2020-12-30", "2020-12-31", "2021-01-01", "2021-01-02", "2021-01-03"];
    const s = dated(dates, [100, 100, 150, 150, 150, 75, 75]);
    // hold, +50%, sell on 2020-12-31 (gain 0.5 in 2020), buy again in 2021, -50%, sell (loss in 2021)
    const pf = simulatePortfolio(s, [1, 1, 0, 1, 1, 0, 0], { lag: 0, cost: 0, band: 0, taxRate: 0.1 });
    expect(pf.taxesPaid).toBeCloseTo(0.05, 12); // 10% of the 2020 gain
    expect(pf.metrics.totalReturn).toBeCloseTo((1.45 * 0.5 - 1) * 100, 10); // 1.5 - 0.05 tax, then -50%
  });

  it("buy-and-hold pays tax only when it finally sells", () => {
    const dates = ["2020-12-30", "2020-12-31", "2021-12-31", "2022-12-31"];
    const s = dated(dates, [100, 100, 200, 300]);
    const pf = simulatePortfolio(s, [1, 1, 1, 1], { lag: 0, cost: 0, band: 0, taxRate: 0.1 });
    // bought at 1.0, sold at 3.0 at the end: gain 2.0, tax 0.2
    expect(pf.taxesPaid).toBeCloseTo(0.2, 12);
    expect(pf.metrics.totalReturn).toBeCloseTo(180, 10);
  });
});

describe("costs and rebalancing band", () => {
  it("charges cost on the amount actually traded, including the final sale", () => {
    const s = dated(["a1", "a2", "a3"], [100, 100, 100]);
    const pf = simulatePortfolio(s, [1, 1, 1], { lag: 0, cost: 0.01, band: 0, taxRate: 0 });
    // buy 1.0 (cost 0.01), then at the end sell 0.99 worth (cost 0.0099)
    expect(pf.costsPaid).toBeCloseTo(0.01 + 0.0099, 12);
    expect(pf.trades).toBe(2);
  });

  it("does not rebalance a drifted 50% position while it stays inside the band", () => {
    // price doubles: a 50/50 portfolio becomes 2/3 asset (drift of 0.167)
    const s = dated(["b1", "b2", "b3", "b4"], [100, 100, 200, 200]);
    const narrow = simulatePortfolio(s, [0.5, 0.5, 0.5, 0.5], { lag: 0, cost: 0, band: 0.1, taxRate: 0, liquidateAtEnd: false });
    const wide = simulatePortfolio(s, [0.5, 0.5, 0.5, 0.5], { lag: 0, cost: 0, band: 0.2, taxRate: 0, liquidateAtEnd: false });
    expect(narrow.trades).toBe(2); // initial buy + rebalance back to 50%
    expect(wide.trades).toBe(1); // initial buy only
    expect(wide.heldWeights[wide.heldWeights.length - 1]).toBeCloseTo(2 / 3, 12);
  });

  it("rejects invalid options and decisions", () => {
    const s = makeSeries([1, 2, 3]);
    expect(() => simulatePortfolio(s, [1, 1], { lag: 0, cost: 0, band: 0, taxRate: 0 })).toThrow(RangeError);
    expect(() => simulatePortfolio(s, [1, NaN, 1], { lag: 0, cost: 0, band: 0, taxRate: 0 })).toThrow(RangeError);
    expect(() => simulatePortfolio(s, [1, 1, 1], { lag: 0, cost: 0, band: 1, taxRate: 0 })).toThrow(RangeError);
  });
});
