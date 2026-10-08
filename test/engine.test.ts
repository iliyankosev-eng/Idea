import { describe, expect, it } from "vitest";
import { runBacktest, StrategyError } from "../src/engine.js";
import type { History } from "../src/history.js";
import { DataError, validateSeries } from "../src/types.js";
import { makeSeries } from "./helpers.js";

const prices = [100, 110, 99, 120, 132, 120, 150, 150];
const goLongFromBar3 = (h: History) => (h.t >= 3 ? 1 : 0);

describe("timing: when does a decision start to earn?", () => {
  it("lag 0: decided at bar 3, held during bar 4", () => {
    const r = runBacktest(makeSeries(prices), goLongFromBar3, { cost: 0, lag: 0 });
    expect(r.weights.slice(0, 6)).toEqual([0, 0, 0, 0, 1, 1]);
  });
  it("lag 1: decided at bar 3, held from bar 5", () => {
    const r = runBacktest(makeSeries(prices), goLongFromBar3, { cost: 0, lag: 1 });
    expect(r.weights.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 1]);
  });
  it("starts fully in cash", () => {
    const r = runBacktest(makeSeries(prices), () => 1, { cost: 0, lag: 0 });
    expect(r.weights[0]).toBe(0);
    expect(r.weights[1]).toBe(1);
  });
});

describe("return of one bar = w*asset + (1-w)*cash - cost*|change in w|", () => {
  it("matches a hand calculation, including entry and exit costs", () => {
    const s = makeSeries([100, 100, 110, 121, 121], 0.01);
    const strat = (h: History) => (h.t === 1 || h.t === 2 ? 0.5 : 0);
    const r = runBacktest(s, strat, { cost: 0.002, lag: 0 });
    // bar 2: w=0.5 (from decision at bar 1): 0.5*10% + 0.5*1% - 0.002*0.5
    expect(r.returns[2]).toBeCloseTo(0.05 + 0.005 - 0.001, 12);
    // bar 3: w=0.5, no change: 0.5*10% + 0.5*1%
    expect(r.returns[3]).toBeCloseTo(0.055, 12);
    // bar 4: w=0 (exit): cash 1% - 0.002*0.5
    expect(r.returns[4]).toBeCloseTo(0.01 - 0.001, 12);
    expect(r.costs.reduce((a, b) => a + b, 0)).toBeCloseTo(0.002, 12); // 0.5 in + 0.5 out
  });
});

describe("guards", () => {
  it("rejects invalid weights from a strategy", () => {
    const s = makeSeries(prices);
    expect(() => runBacktest(s, () => NaN, { cost: 0, lag: 0 })).toThrow(StrategyError);
    expect(() => runBacktest(s, () => -0.1, { cost: 0, lag: 0 })).toThrow(StrategyError);
    expect(() => runBacktest(s, () => 1.5, { cost: 0, lag: 0 })).toThrow(StrategyError);
    expect(() => runBacktest(s, () => 1.5, { cost: 0, lag: 0, maxWeight: 2 })).not.toThrow();
  });
  it("rejects bad options", () => {
    const s = makeSeries(prices);
    expect(() => runBacktest(s, () => 1, { cost: -0.1, lag: 0 })).toThrow(RangeError);
    expect(() => runBacktest(s, () => 1, { cost: 0, lag: 0.5 })).toThrow(RangeError);
  });
  it("rejects malformed series", () => {
    const s = makeSeries(prices);
    expect(() => validateSeries({ ...s, dates: [...s.dates].reverse() })).toThrow(DataError);
    expect(() => validateSeries({ ...s, ret: [0.1, ...s.ret.slice(1)] })).toThrow(DataError);
    expect(() => validateSeries({ ...s, cash: s.cash.slice(1) })).toThrow(DataError);
    expect(() => validateSeries({ ...s, price: [0, ...s.price.slice(1)] })).toThrow(DataError);
  });
});
