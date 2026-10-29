import { describe, expect, it } from "vitest";
import { s1, type KBars } from "../src/social/vwapEma.js";

// constant-volume bars, so VWAP = running mean of (o+h+l+c)/4; h = l = o = c makes typical price = close
const day = (date: string, cl: number[], m0 = 570, k = 5): KBars => ({ date, m: cl.map((_, i) => m0 + i * k), o: cl, h: cl, l: cl, c: cl, v: cl.map(() => 1) });

describe("S1 VWAP / EMA9 (hand-calculated)", () => {
  it("EMA crosses above VWAP -> long at the next open; exit when a close falls below the EMA", () => {
    // closes 100, 99, 101, 103, 102, 100
    // EMA: 100, 99.8, 100.04, 100.632, 100.9056, 100.7245 ; VWAP: 100, 99.5, 100, 100.75, 101, 100.8333
    // diff: 0, 0.3, 0.04, -0.118, -0.0944, -0.1088 -> t=1: prevDiff 0 <= 0 and 0.3 > 0 -> long at the open of t=2 (101)
    // t=3: down-cross (0.04 >= 0, -0.118 < 0) -> flip short at the open of t=4 (102); last bar: exit at the close 100
    const r = s1([day("2024-01-02", [100, 99, 101, 103, 102, 100])], { cost: 0 })[0]!;
    expect(r.trades).toBe(2);
    expect(r.r).toBeCloseTo((102 / 101 - 1) + -(100 / 102 - 1), 12);
  });
  it("costs: 2 x cost / price per trade side pair", () => {
    const r0 = s1([day("2024-01-02", [100, 99, 101, 103, 102, 100])], { cost: 0 })[0]!.r;
    const r1 = s1([day("2024-01-02", [100, 99, 101, 103, 102, 100])], { cost: 0.01 })[0]!.r;
    expect(r0 - r1).toBeCloseTo(0.01 / 101 + 0.01 / 102 + 0.01 / 102 + 0.01 / 100, 12);
  });
  it("invert flips every position; entries outside 09:35-15:30 are not taken", () => {
    const d = day("2024-01-02", [100, 99, 101, 103, 102, 100]);
    // inverted: short at 101 (t=2 open); its stop (close 101 > EMA 100.04) exits at the t=3 open 103;
    // the t=3 down-cross now means long at the t=4 open 102, closed at the last close 100
    expect(s1([d], { cost: 0, invert: true })[0]!.r).toBeCloseTo(-(103 / 101 - 1) + (100 / 102 - 1), 12);
    expect(s1([d], { cost: 0, first: 600 })[0]!.trades).toBe(0);
  });
  it("flip on a cross, then the stop exits the short at the next open", () => {
    const cl = [100, 99, 101, 101.2, 101.3, 100.95, 101];
    // EMA: 100, 99.8, 100.04, 100.272, 100.4776, 100.57208 ; VWAP (running mean): 100, 99.5, 100, 100.3, 100.5, 100.575
    // diff: 0, .3 (up-cross -> long at t=2 open 101), .04, -.028 (down-cross -> flip short at t=4 open 101.3)
    const r = s1([day("2024-01-02", cl)], { cost: 0 })[0]!;
    // t=3 down-cross -> flip short at t=4 open 101.3; t=4 close 101.3 > EMA 100.4776 -> short stopped, exit at t=5 open 100.95;
    // t=5: diff = 100.57208 - 100.575 = -0.0029 (no cross, prev -0.0224); t=6 last bar, nothing open
    expect(r.trades).toBe(2);
    expect(r.r).toBeCloseTo((101.3 / 101 - 1) - (100.95 / 101.3 - 1), 12);
  });
  it("long stop: a close below the EMA while EMA stays above VWAP exits at the next open", () => {
    // heavy volume at 100 pins VWAP near 100.00; t1 close 101 -> EMA 100.2 > VWAP -> up-cross (prev diff 0) -> long at t2 open 100.1
    // t2 close 100.1 < EMA 100.18 (VWAP ~100.001, no cross) -> exit at t3 open 99.9
    // (a last bar at 99.5 shows the exit really happened at t3: holding on would end at 99.5)
    const p = [100, 101, 100.1, 99.9, 99.5];
    const d: KBars = { date: "2024-01-02", m: [570, 575, 580, 585, 590], o: p, h: p, l: p, c: p, v: [1000, 1, 1, 1, 1] };
    const r = s1([d], { cost: 0 })[0]!;
    expect(r.trades).toBe(1);
    expect(r.r).toBeCloseTo(99.9 / 100.1 - 1, 12);
  });
  it("VWAP uses (O+H+L+C)/4, not the close", () => {
    // t1: o 100, h 100.5, l 96, c 100.5 -> OHLC4 99.25 -> VWAP 99.625 < EMA 100.1 -> up-cross -> long at t2 open 101, exit at the close 102
    // (with the close as source VWAP would be 100.25 > EMA -> short)
    const d: KBars = { date: "2024-01-02", m: [570, 575, 580], o: [100, 100, 101], h: [100, 100.5, 102], l: [100, 96, 101], c: [100, 100.5, 102], v: [1, 1, 1] };
    expect(s1([d], { cost: 0 })[0]!.r).toBeCloseTo(102 / 101 - 1, 12);
  });
});
