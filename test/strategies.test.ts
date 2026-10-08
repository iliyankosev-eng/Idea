import { describe, expect, it } from "vitest";
import { History } from "../src/history.js";
import { buyAndHold, smaTrend, volTarget } from "../src/strategies.js";
import { makeSeries } from "./helpers.js";

describe("smaTrend", () => {
  const s = makeSeries([1, 2, 3, 4, 3, 2, 1]);
  const sma3 = smaTrend(3);
  it("stays in cash until it has n prices", () => {
    expect(sma3(new History(s, 1))).toBe(0);
  });
  it("is long when price > SMA (current bar included)", () => {
    expect(sma3(new History(s, 2))).toBe(1); // 3 > mean(1,2,3)=2
    expect(sma3(new History(s, 3))).toBe(1); // 4 > 3
  });
  it("is in cash when price <= SMA", () => {
    expect(sma3(new History(s, 4))).toBe(0); // 3 < mean(3,4,3)=3.33
    expect(sma3(new History(s, 6))).toBe(0); // 1 < 2
  });
  it("rejects nonsense lengths", () => {
    expect(() => smaTrend(1)).toThrow(RangeError);
    expect(() => smaTrend(2.5)).toThrow(RangeError);
  });
});

describe("volTarget", () => {
  // returns alternate +1% / -1%
  const prices = [100];
  for (let i = 1; i <= 40; i++) prices.push(prices[i - 1]! * (i % 2 ? 1.01 : 0.99));
  const s = makeSeries(prices, 0, 252);

  it("scales weight to target / realised volatility (checked against an independent calculation)", () => {
    const h = new History(s, 40);
    const r = h.lastReturns(20)!;
    const mean = r.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / 19);
    const realised = sd * Math.sqrt(252); // about 16%
    const w = volTarget(buyAndHold, { targetVol: 0.08, lookback: 20, maxWeight: 1 })(h);
    expect(w).toBeCloseTo(0.08 / realised, 12);
    expect(w).toBeGreaterThan(0.45);
    expect(w).toBeLessThan(0.55);
  });
  it("is capped at maxWeight", () => {
    const w = volTarget(buyAndHold, { targetVol: 2, lookback: 20, maxWeight: 1 })(new History(s, 40));
    expect(w).toBe(1);
  });
  it("is 0 when the base strategy is out, and 0 until enough history exists", () => {
    expect(volTarget(() => 0, { targetVol: 0.1, lookback: 5, maxWeight: 1 })(new History(s, 40))).toBe(0);
    expect(volTarget(buyAndHold, { targetVol: 0.1, lookback: 20, maxWeight: 1 })(new History(s, 10))).toBe(0);
  });
});
