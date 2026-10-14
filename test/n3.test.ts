import { describe, expect, it } from "vitest";
import { entryPrice, n3, strikeOf, type N3Day, type OptBar } from "../src/options/n3.js";

const bar = (t: string, c: number): OptBar => [t, c, c, c, c, 10, 3];
// S = 500 at 10:00 (14:00 UTC); legs: short 503 call / 497 put, long 505 call / 495 put, ATM 500
const legs = { sc: "SPY240305C00503000", sp: "SPY240305P00497000", lc: "SPY240305C00505000", lp: "SPY240305P00495000", ac: "SPY240305C00500000", ap: "SPY240305P00500000" };
const bars = { [legs.sc]: [bar("2024-03-05T13:58:00Z", 0.9), bar("2024-03-05T14:00:00Z", 1.0)], [legs.sp]: [bar("2024-03-05T14:02:00Z", 0.8)], [legs.lc]: [bar("2024-03-05T14:00:00Z", 0.4)],
  [legs.lp]: [bar("2024-03-05T13:59:00Z", 0.3), bar("2024-03-05T14:01:00Z", 0.35)], [legs.ac]: [bar("2024-03-05T14:00:00Z", 2.5)], [legs.ap]: [bar("2024-03-05T14:00:00Z", 2.4)] };
const day = (close: number): N3Day => ({ date: "2024-03-05", S: 500, close, t10: "2024-03-05T14:00", legs, bars });

describe("N3 iron condor (hand-calculated)", () => {
  it("entry prices: exact 10:00 bar, else nearest within 5 minutes (ties -> earlier); strikes from OCC symbols", () => {
    expect(entryPrice(bars[legs.sc], "2024-03-05T14:00")).toBe(1.0);
    expect(entryPrice(bars[legs.sp], "2024-03-05T14:00")).toBe(0.8);
    expect(entryPrice(bars[legs.lp], "2024-03-05T14:00")).toBe(0.3); // 13:59 and 14:01 both 1 minute away -> earlier
    expect(entryPrice([bar("2024-03-05T14:06:00Z", 9)], "2024-03-05T14:00")).toBeUndefined();
    expect([strikeOf(legs.sc), strikeOf(legs.lp)]).toEqual([503, 495]);
  });
  it("expires between the short strikes: keep the credit 1.0 + 0.8 - 0.4 - 0.3 = 1.1 minus 4 x 0.01; risk 2 - 1.1 = 0.9", () => {
    const r = n3([day(501)], 0.01)[0]!;
    expect(r.credit).toBeCloseTo(1.1, 12); expect(r.maxRisk).toBeCloseTo(0.9, 12);
    expect(r.icRet).toBeCloseTo((1.1 - 0.04) / 0.9, 12);
    expect(r.straddle).toBeCloseTo((4.9 - 1 - 3 * 0.01) / 500, 12);
  });
  it("big move up to 510: lose the full spread width 2 minus the credit, plus exit costs on 2 legs", () => {
    expect(n3([day(510)], 0.01)[0]!.icRet).toBeCloseTo((1.1 - 7 + 5 - 0.06) / 0.9, 12);
  });
  it("partial: close 504 -> short call 1 in the money", () => {
    expect(n3([day(504)], 0.01)[0]!.icRet).toBeCloseTo((1.1 - 1 - 0.05) / 0.9, 12);
  });
  it("a leg without a trade near 10:00 skips the condor", () => {
    const d = { ...day(501), bars: { ...bars, [legs.lc]: [] } };
    expect(n3([d], 0.01)[0]!.ic).toBe(false);
  });
});
