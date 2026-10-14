import { describe, expect, it } from "vitest";
import type { Session } from "../src/intraday/sessions.js";
import { n1, n2 } from "../src/daytrade/new3.js";

// two hand-built sessions: day 1 closes at 100; day 2: 15:29 close 101 (signal +1%), 15:30 open 101.2, last close 102
const mk = (date: string, bars: [number, number][], prevDate?: string): Session => ({
  symbol: "SPY", date, minute: bars.map((b) => b[0]), o: bars.map((b) => b[1]), h: bars.map((b) => b[1] + 0.1), l: bars.map((b) => b[1] - 0.1), c: bars.map((b) => b[1]), ...(prevDate ? { prevDate } : {}),
});
const d1 = mk("2024-01-02", [[570, 99], [959, 100]]);
const d2: Session = { ...mk("2024-01-03", [[570, 100.5], [929, 101], [930, 101.2], [959, 102]], "2024-01-02"), o: [100.5, 101, 101.2, 101.9], c: [100.6, 101, 101.3, 102] };

describe("N1 / N2 (hand-calculated)", () => {
  it("N1: signal +1% -> long from 101.2 to 102, minus 2 x 0.0045 / 101.2", () => {
    const r = n1([d1, d2], { cost: 0.0045 });
    expect(r[0]!.trades).toBe(0);
    expect(r[1]!.sig).toBeCloseTo(0.01, 12);
    expect(r[1]!.r).toBeCloseTo(102 / 101.2 - 1 - 0.009 / 101.2, 12);
    expect(n1([d1, d2], { cost: 0, minAbs: 0.0101 })[1]!.trades).toBe(0);
    expect(n1([d1, d2], { cost: 0, minAbs: 0.0099 })[1]!.trades).toBe(1);
  });
  it("N1: a negative signal shorts; a missing 15:30 bar skips the day; an unlinked previous day skips", () => {
    const dn: Session = { ...d2, c: [100.6, 99, 101.3, 102] }; // 15:29 close 99 -> signal -1%
    expect(n1([d1, dn], { cost: 0 })[1]!.r).toBeCloseTo(-(102 / 101.2 - 1), 12);
    expect(n1([d1, { ...d2, minute: [570, 929, 931, 959] }], { cost: 0 })[1]!.trades).toBe(0);
    expect(n1([d1, { ...d2, prevDate: "2023-12-29" }], { cost: 0 })[1]!.trades).toBe(0);
  });
  it("N2: long from the previous close 100 to the 13:59 close", () => {
    const f: Session = { ...mk("2024-01-03", [[570, 100.5], [839, 101.5], [870, 100.8], [959, 99]], "2024-01-02") };
    const r = n2([d1, f], new Set(["2024-01-03"]), 0.0045);
    expect(r[1]!.r).toBeCloseTo(101.5 / 100 - 1 - 0.009 / 100, 12);
    expect(n2([d1, f], new Set(), 0)[1]!.trades).toBe(0);
  });
});
