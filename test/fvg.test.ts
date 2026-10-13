import { describe, expect, it } from "vitest";
import { aggregate, atr14, findSetups, MAIN, mirror, simulate, trades, type Bar, type Series1m } from "../src/ict/fvg.js";

const bar = (i: number, o: number, h: number, l: number, c: number, seg = 0): Bar => ({ k0: 60 * i, k1: 60 * i + 59, i0: i, i1: i, seg, o, h, l, c });
/** 15 flat bars (TR 2 -> ATR 2), a push (body 3), an FVG [101, 101.5], swing high 105 at bar 17, BoS close 105.5 at bar 20 */
function structure(c2close = 103, seg3 = 0): Bar[] {
  const b: Bar[] = Array.from({ length: 15 }, (_, i) => bar(i, 100, 101, 99, 100));
  b.push(bar(15, 100, 103.5, 99.8, c2close));
  b.push(bar(16, 103, 104, 101.5, 103.8, seg3));
  b.push(bar(17, 103.8, 105, 103, 104.5)); // swing high 105
  b.push(bar(18, 104.5, 104.5, 102.5, 103));
  b.push(bar(19, 103, 104, 102, 102.5));
  b.push(bar(20, 102.5, 105.8, 102.4, 105.5)); // BoS: close 105.5 > 105
  b.push(bar(21, 105.5, 105.6, 101.2, 102));
  b.push(bar(22, 102, 103, 101.8, 102.8));
  return b;
}
const e15 = (k0: number, o: number, h: number, l: number, c: number, i1: number): Bar => ({ k0, k1: k0 + 14, i0: i1, i1, seg: 0, o, h, l, c });
const E = (secondClose = 101.4) => [
  e15(1200, 102.5, 103, 101.2, 102.9, 900), // inside the BoS bar: touches and is bullish, but BEFORE the BoS closes -> ignored
  e15(1260, 105.5, 105.6, 103, 103.5, 1001),
  e15(1275, 103.5, 103.6, 101.3, secondClose, 1002), // touches, bearish
  e15(1290, 101.4, 102.2, 101.2, 102.0, 1003), // touches, bullish, closes above the gap bottom -> entry 102.0
];

describe("FVG + liquidity + BoS setup (hand-calculated)", () => {
  it("ATR(14) of flat bars is 2", () => expect(atr14(structure(), 14)).toBe(2));
  it("finds the setup and enters at the first bullish 15m close after the BoS", () => {
    expect(findSetups(structure(), E())).toEqual([{ fvgBar: 16, top: 101.5, bot: 101, pivot: 17, bos: 20, entryIdx: 1003, entry: 102, stop: 101 }]);
  });
  it("stop at the entry candle low (variant)", () => {
    expect(findSetups(structure(), E(), { ...MAIN, stopAtEntryLow: true })[0]!.stop).toBe(101.2);
  });
  it("no setup: weak push, a 15m close below the gap, or the three bars in different sessions", () => {
    expect(findSetups(structure(101.5), E())).toEqual([]); // body 1.5 < 1.0 x ATR 2
    expect(findSetups(structure(), E(100.9))).toEqual([]); // closed below 101 before the entry candle
    expect(findSetups(structure(103, 1), E())).toEqual([]);
  });
  it("a wick above the swing high is not a BoS; it needs a CLOSE above it", () => {
    const b = structure();
    b[20] = bar(20, 102.5, 105.3, 102.4, 104.8);
    expect(findSetups(b, E())).toEqual([]);
  });
});

describe("trade management on 1-minute bars (hand-calculated)", () => {
  const ser = (rows: [number, number, number, number][], keyStep = 1): Series1m => ({
    key: rows.map((_, i) => i * keyStep), day: rows.map(() => "2026-01-01"), seg: rows.map(() => 0), stock: false,
    o: rows.map((r) => r[0]), h: rows.map((r) => r[1]), l: rows.map((r) => r[2]), c: rows.map((r) => r[3]),
  });
  const E0: [number, number, number, number] = [100, 100, 100, 100];
  it("target 3R", () => expect(simulate(ser([E0, [100, 103.2, 99.5, 103]]), 0, 100, 99, 0)).toMatchObject({ exit: 103, netR: 3, reason: "tp" }));
  it("stop first when both are hit in one minute", () => expect(simulate(ser([E0, [100, 103.5, 98.9, 101]]), 0, 100, 99, 0)).toMatchObject({ exit: 99, netR: -1, reason: "stop" }));
  it("break even from the NEXT minute after +1.5R", () => {
    expect(simulate(ser([E0, [100, 101.6, 99.95, 101], [101, 101.2, 99.95, 100.5]]), 0, 100, 99, 0)).toMatchObject({ exitIdx: 2, exit: 100, netR: 0, reason: "be" });
    expect(simulate(ser([E0, [100, 101.4, 99.95, 101], [101, 101.2, 99.95, 100.5], [100.5, 100.6, 98.8, 99]]), 0, 100, 99, 0)).toMatchObject({ exitIdx: 3, exit: 99, reason: "stop" }); // never reached 1.5R
  });
  it("gap below the stop fills at the open; costs on both sides", () => {
    expect(simulate(ser([E0, [98.5, 99, 98, 98.8]]), 0, 100, 99, 0)).toMatchObject({ exit: 98.5, netR: -1.5 });
    expect(simulate(ser([E0, [100, 103.2, 99.5, 103]]), 0, 100, 99, 0.001).netR).toBeCloseTo(3 - 0.001 * 203, 12);
  });
  it("time exit after 5 days at the last close before the limit", () => {
    const rows: [number, number, number, number][] = [E0, [100, 100.5, 99.5, 100.2], [100.2, 100.4, 99.6, 100.3], [100.3, 100.4, 99.7, 100.1]];
    const s = { ...ser(rows), key: [0, 3000, 7200, 7201] };
    expect(simulate(s, 0, 100, 99, 0)).toMatchObject({ exitIdx: 2, exit: 100.3, reason: "time" });
  });
  it("one position at a time", () => {
    const s = ser([E0, [100, 100.5, 99.5, 100.2], [100.2, 103.5, 100, 103], [103, 103.1, 102, 102.5]]);
    const ts = trades(s, [{ fvgBar: 0, top: 0, bot: 0, pivot: 0, bos: 0, entryIdx: 0, entry: 100, stop: 99 }, { fvgBar: 0, top: 0, bot: 0, pivot: 0, bos: 0, entryIdx: 1, entry: 100.2, stop: 99.5 }], 0);
    expect(ts.map((t) => t.entryIdx)).toEqual([0]);
  });
});

describe("aggregation and mirror", () => {
  it("stocks: hourly bars anchored at 09:30 inside a session", () => {
    const keys = [570, 571, 629, 630, 631]; // 09:30, 09:31, 10:29, 10:30, 10:31
    const s: Series1m = { key: keys.map((k) => 1440 + k), day: keys.map(() => "d"), seg: keys.map(() => 1), stock: true, o: [1, 2, 3, 4, 5], h: [1, 2, 3, 4, 5], l: [1, 2, 3, 4, 5], c: [1, 2, 3, 4, 5] };
    expect(aggregate(s, 60).map((b) => [b.k0 - 1440, b.o, b.h, b.c])).toEqual([[570, 1, 3, 3], [630, 4, 5, 5]]);
  });
  it("mirror swaps highs and lows", () => {
    const s: Series1m = { key: [0], day: ["d"], seg: [0], stock: false, o: [10], h: [12], l: [9], c: [11] };
    expect(mirror(s)).toMatchObject({ o: [-10], h: [-9], l: [-12], c: [-11] });
  });
});
