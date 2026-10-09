import { describe, expect, it } from "vitest";
import { runBacktest } from "../src/engine.js";
import type { History } from "../src/history.js";
import { extractTrades, tradeStats } from "../src/trades.js";
import { makeSeries } from "./helpers.js";

describe("extractTrades (hand-calculated)", () => {
  // prices: flat, +10%, +10%, flat, -20%, flat
  const s = makeSeries([100, 100, 110, 121, 121, 96.8, 96.8]);
  // hold during bars 2-3 (decide at 1,2), and during bar 5 (decide at 4)
  const strat = (h: History) => (h.t === 1 || h.t === 2 || h.t === 4 ? 1 : 0);

  it("finds two trades and compounds their bars, without costs", () => {
    const tr = extractTrades(runBacktest(s, strat, { cost: 0, lag: 0 }));
    expect(tr.map((t) => [t.entry, t.exit, t.bars])).toEqual([[s.dates[2], s.dates[4], 2], [s.dates[5], s.dates[6], 1]]);
    expect(tr[0]!.ret).toBeCloseTo(0.21, 12);
    expect(tr[1]!.ret).toBeCloseTo(-0.2, 12);
  });

  it("includes entry and exit costs", () => {
    const tr = extractTrades(runBacktest(s, strat, { cost: 0.01, lag: 0 }));
    // entry bar: 1.10 - 0.01, second bar 1.10, exit: * (1 - 0.01)
    expect(tr[0]!.ret).toBeCloseTo((1.1 - 0.01) * 1.1 * 0.99 - 1, 12);
  });

  it("statistics: win rate, average win/loss, expectancy, profit factor", () => {
    const st = tradeStats([
      { entry: "a", exit: "b", bars: 1, ret: 0.02 },
      { entry: "a", exit: "b", bars: 1, ret: 0.02 },
      { entry: "a", exit: "b", bars: 1, ret: 0.02 },
      { entry: "a", exit: "b", bars: 1, ret: -0.1 },
    ]);
    expect(st.winRate).toBe(75);
    expect(st.avgWin).toBeCloseTo(2, 12);
    expect(st.avgLoss).toBeCloseTo(-10, 12);
    expect(st.expectancy).toBeCloseTo(-1, 12); // 75% wins and still losing money
    expect(st.profitFactor).toBeCloseTo(0.6, 12);
  });
});
