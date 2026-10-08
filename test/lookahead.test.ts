import { describe, expect, it } from "vitest";
import { runBacktest } from "../src/engine.js";
import { History, LookAheadError, type Strategy } from "../src/history.js";
import { smaTrend, volTarget } from "../src/strategies.js";
import type { Series } from "../src/types.js";
import { makeSeries, randomWalk, rng } from "./helpers.js";

describe("a strategy cannot see the future", () => {
  it("reading the next bar throws", () => {
    const cheater: Strategy = (h) => (h.t + 1 < 10 && h.price(h.t + 1) > h.price(h.t) ? 1 : 0);
    expect(() => runBacktest(makeSeries(randomWalk(10, 1)), cheater, { cost: 0, lag: 0 })).toThrow(LookAheadError);
  });

  it("History refuses negative, fractional and future indices", () => {
    const h = new History(makeSeries([1, 2, 3, 4]), 2);
    expect(h.price(2)).toBe(3);
    expect(() => h.price(3)).toThrow(LookAheadError);
    expect(() => h.price(-1)).toThrow(LookAheadError);
    expect(() => h.ret(1.5)).toThrow(LookAheadError);
    expect(h.lastPrices(3)).toEqual([1, 2, 3]);
    expect(h.lastPrices(4)).toBeNull();
    expect(h.lastReturns(2)).toEqual([1, 0.5]);
    expect(h.lastReturns(3)).toBeNull(); // bar 0 has no return
  });

  // Property test: replacing everything AFTER bar T with garbage must not change any decision up to T.
  const strategies: [string, Strategy][] = [
    ["SMA 20", smaTrend(20)],
    ["vol-targeted SMA 20", volTarget(smaTrend(20), { targetVol: 0.3, lookback: 15, maxWeight: 1 })],
  ];
  for (const [name, strat] of strategies) {
    it(`${name}: decisions up to T ignore data after T (20 random cases)`, () => {
      const r = rng(7);
      for (let c = 0; c < 20; c++) {
        const base = makeSeries(randomWalk(300, 100 + c));
        const T = 50 + Math.floor(r() * 200);
        const garbage = base.price.map((p, i) => (i <= T ? p : p * (0.2 + r() * 5)));
        const changed: Series = makeSeries(garbage);
        const a = runBacktest(base, strat, { cost: 0, lag: 0 }).decisions.slice(0, T + 1);
        const b = runBacktest(changed, strat, { cost: 0, lag: 0 }).decisions.slice(0, T + 1);
        expect(b).toEqual(a);
      }
    });
  }
});
