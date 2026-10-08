import { describe, expect, it } from "vitest";
import { metricsFromReturns, windowRange } from "../src/metrics.js";

const meta = { start: "a", end: "b" };

describe("metricsFromReturns (hand-computed examples)", () => {
  it("+10% then -10% over one year: equity 0.99, CAGR -1%, drawdown -10%, vol 20%", () => {
    const m = metricsFromReturns([0.1, -0.1], 2, meta);
    expect(m.years).toBe(1);
    expect(m.totalReturn).toBeCloseTo(-1, 10);
    expect(m.cagr).toBeCloseTo(-1, 10);
    expect(m.maxDrawdown).toBeCloseTo(-10, 10);
    // mean 0, sample sd = sqrt(0.02 / 1) = 0.141421..., annualised * sqrt(2) = 0.2
    expect(m.vol).toBeCloseTo(20, 10);
    expect(m.sharpe).toBeCloseTo(0, 10);
  });

  it("drawdown is measured from the running peak and recovery does not erase it", () => {
    // equity: 1.5 -> 0.75 -> 1.5
    const m = metricsFromReturns([0.5, -0.5, 1.0], 3, meta);
    expect(m.maxDrawdown).toBeCloseTo(-50, 10);
    expect(m.totalReturn).toBeCloseTo(50, 10);
  });

  it("CAGR compounds over multiple years", () => {
    // 2 years, +21% total -> 10% a year
    const m = metricsFromReturns([0.1, 0.1], 1, meta);
    expect(m.cagr).toBeCloseTo(10, 10);
  });

  it("zero volatility gives Sharpe 0 instead of Infinity", () => {
    const m = metricsFromReturns([0.01, 0.01, 0.01], 12, meta);
    expect(m.sharpe).toBe(0);
  });
});

describe("windowRange", () => {
  const dates = ["2020-01", "2020-02", "2020-03", "2020-04"];
  it("is inclusive and never includes bar 0 (it has no return)", () => {
    expect(windowRange(dates)).toEqual([1, 3]);
    expect(windowRange(dates, "2020-02", "2020-03")).toEqual([1, 2]);
    expect(windowRange(dates, "2020-01", "2020-02")).toEqual([1, 1]); // bar 0 skipped
  });
  it("throws when no bar is inside the window", () => {
    expect(() => windowRange(dates, "2020-01", "2020-01")).toThrow(RangeError);
    expect(() => windowRange(dates, "2030-01")).toThrow(RangeError);
  });
});
