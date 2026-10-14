import { describe, expect, it } from "vitest";
import { dt7, dt8, rsi } from "../src/daytrade/dt78.js";
import type { Session } from "../src/intraday/sessions.js";

const mk = (date: string, open: number, close: number, prevDate?: string): Session => ({ symbol: "SPY", date, ...(prevDate ? { prevDate } : {}), minute: [570, 959], o: [open, close], h: [open, close], l: [open, close], c: [open, close] });

describe("DT7 overnight (hand-calculated)", () => {
  const ss = [mk("2026-01-02", 99, 100), mk("2026-01-05", 101, 100.5, "2026-01-02"), mk("2026-01-06", 100, 102, "2026-01-02")];
  it("close 100 -> open 101 = +1% minus costs; a broken link gives no trade", () => {
    const r = dt7(ss, 0.0045);
    expect(r[0]!.r).toBeCloseTo(0.01 - 0.009 / 100, 12);
    expect(r[1]).toEqual({ day: "2026-01-06", r: 0, trades: 0 }); // prevDate says 01-02 but the previous session is 01-05
    expect(dt7(ss, 0, true)[0]!.r).toBeCloseTo(100.5 / 101 - 1, 12); // intraday leg
  });
});

describe("DT8 RSI(2) (hand-calculated)", () => {
  it("Wilder RSI(2)", () => {
    // changes: +1, -1 -> up 0.5, dn 0.5 -> 50; next -2: up 0.25, dn 1.25 -> 100 - 100/1.2 = 16.667
    expect(rsi([10, 11, 10, 8]).slice(2)).toEqual([50, expect.closeTo(100 - 100 / 1.2, 9)]);
  });
  it("buys a dip above SMA(200) and sells when the close is above SMA(5)", () => {
    const c = [...Array.from({ length: 200 }, (_, i) => 100 + i * 0.1), 118, 116, 117, 125]; // rising trend, two down days, then up
    const date = c.map((_, i) => `d${String(i).padStart(3, "0")}`);
    const r = dt8({ date, c }, 0);
    const iBuy = r.findIndex((x, k) => k > 0 && x.r === 0 && r[k + 1]!.r !== 0);
    expect(date[iBuy + 1]).toBe("d200"); // RSI(2) ~5 after the first down close (118), and 118 > SMA(200) ~110 -> buy at that close
    expect(r[200]!.r).toBeCloseTo(116 / 118 - 1, 12); // d201: held, 116 < SMA(5)
    expect(r[201]!.r).toBeCloseTo(117 / 116 - 1, 12); // d202: held; close 117 < SMA(5)
    expect(r[202]!.r).toBeCloseTo(125 / 117 - 1, 12); // d203: 125 > SMA(5) -> sell at this close
    expect(r[202]!.trades).toBe(1);
  });
  it("exit uses SMA(5): 118.85 is above SMA(5) 118.51 (but below SMA(10) 118.905)", () => {
    const c = [...Array.from({ length: 200 }, (_, i) => 100 + i * 0.1), 118, 116, 118.85, 118.9];
    const r = dt8({ date: c.map((_, i) => `d${i}`), c }, 0);
    expect(r[201]!.trades).toBe(1); // d202
    expect(r[202]!.r).toBe(0); // flat on d203
  });
  it("no buy below SMA(200)", () => {
    const c = [...Array.from({ length: 200 }, (_, i) => 200 - i * 0.1), 175, 170, 180];
    expect(dt8({ date: c.map((_, i) => `d${i}`), c }, 0).every((x) => x.r === 0)).toBe(true);
  });
});
