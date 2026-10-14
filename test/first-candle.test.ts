import { describe, expect, it } from "vitest";
import { costR, firstCandleTrade, tradeWithDirection, type DayBars } from "../src/ict/firstCandle.js";

// hand-built New York day: range 09:30-09:34 (H 101.0, L 99.8); bullish FVG a=575 b=576 c=577 (gap 101.0-101.3);
// retest at 579 (low 101.2), engulfing at 580, entry at the 581 open 101.8, stop 101.2 (risk 0.6), target 103.6
const base: [number, number, number, number][] = [
  [100, 100.5, 99.8, 100.2], [100.2, 100.6, 100.0, 100.4], [100.4, 100.7, 100.1, 100.3], [100.3, 100.8, 100.2, 100.6], [100.6, 101.0, 100.4, 100.9],
  [100.9, 101.0, 100.7, 100.95], [100.95, 101.8, 100.9, 101.7], [101.7, 102.2, 101.3, 102.0], [102.0, 102.1, 101.6, 101.7],
  [101.7, 101.8, 101.2, 101.3], [101.3, 101.9, 101.25, 101.8], [101.8, 102.0, 101.7, 101.9],
];
const day = (bars: [number, number, number, number][], spread?: (number | undefined)[]): DayBars => ({
  date: "2024-01-02", m: bars.map((_, i) => 570 + i), o: bars.map((b) => b[0]), h: bars.map((b) => b[1]), l: bars.map((b) => b[2]), c: bars.map((b) => b[3]), ...(spread ? { spread } : {}),
});
const NY = { orStart: 570, lastEntry: 720, exitMin: 959 };
const close = (x: number, y: number) => expect(x).toBeCloseTo(y, 9);

describe("first candle rule (hand-calculated)", () => {
  it("long: FVG through the high, retest, engulfing -> entry 101.8, stop 101.2, target 103.6, hits the target = +3R", () => {
    const t = firstCandleTrade(day([...base, [101.9, 103.7, 101.85, 103.5]]), NY)!;
    expect([t.dir, t.fvgIdx, t.retestIdx, t.engulfIdx, t.entryIdx, t.exitIdx]).toEqual([1, 7, 9, 10, 11, 12]);
    close(t.entry, 101.8); close(t.stop, 101.2); close(t.target, 103.6); close(t.r, 3);
  });
  it("stop hit = -1R; stop and target in the same bar count as the stop", () => {
    close(firstCandleTrade(day([...base, [101.9, 102.0, 101.1, 101.3]]), NY)!.r, -1);
    close(firstCandleTrade(day([...base, [101.9, 103.7, 101.1, 101.3]]), NY)!.r, -1);
  });
  it("time exit at the last bar's close: (101.95 - 101.8) / 0.6 = 0.25R", () => {
    close(firstCandleTrade(day([...base, [101.9, 102.0, 101.7, 101.95]]), NY)!.r, 0.25);
  });
  it("gap fully filled before the engulfing cancels the setup; entry after the deadline is not taken", () => {
    const filled = base.slice(0, 10).concat([[101.3, 101.35, 100.8, 100.9], [100.9, 101.5, 100.85, 101.4], [101.4, 101.6, 101.3, 101.5]]); // 581 would engulf, but the gap was filled at 580
    expect(firstCandleTrade(day(filled), NY)).toBeNull();
    expect(firstCandleTrade(day([...base, [101.9, 103.7, 101.85, 103.5]]), { ...NY, lastEntry: 581 })).toBeNull();
  });
  it("short = the mirror image: entry 98.2, stop 98.8, target 96.4, +3R", () => {
    const mir = ([...base, [101.9, 103.7, 101.85, 103.5]] as [number, number, number, number][]).map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c] as [number, number, number, number]);
    const t = firstCandleTrade(day(mir), NY)!;
    expect(t.dir).toBe(-1);
    close(t.entry, 98.2); close(t.stop, 98.8); close(t.target, 96.4); close(t.r, 3);
  });
  it("costs and the random-direction helper", () => {
    const sp = base.map(() => undefined as number | undefined); sp[10] = 0.05;
    const d = day([...base, [101.9, 103.7, 101.85, 103.5]], [...sp, undefined]);
    const t = firstCandleTrade(d, NY)!;
    close(costR(d, t), (0.05 + 2e-5 * 101.8) / 0.6);
    close(costR(d, t, 0.0045), 0.009 / 0.6);
    close(tradeWithDirection(d, NY, t, 1), 3);
    close(tradeWithDirection(d, NY, t, -1), -1); // short 101.8, stop 102.4: the 582 high 103.7 hits it
  });
  it("engulfing boundary: close exactly at the previous open counts", () => {
    const b2 = base.map((x) => [...x] as [number, number, number, number]);
    b2[10] = [101.3, 101.9, 101.25, 101.7]; // close 101.7 = open of 579
    const t = firstCandleTrade(day([...b2, [101.9, 103.7, 101.85, 103.5]]), NY)!;
    expect(t.engulfIdx).toBe(10);
  });
  it("a missing range minute skips the day", () => {
    const d = day([...base, [101.9, 103.7, 101.85, 103.5]]);
    expect(firstCandleTrade({ ...d, m: d.m.map((x, i) => (i === 2 ? 600 : x)) }, NY)).toBeNull();
  });
});
