import { describe, expect, it } from "vitest";
import { atr, fibTrades, longCandidates, mirror, rsi, simLong, type Bars, type Opts } from "../src/fib/confluence.js";

/** Bars from (open, close) pairs: high = max + 0.1, low = min - 0.1. */
function mk(oc: [number, number][]): Bars {
  return { day: oc.map((_, i) => `d${String(Math.floor(i / 7)).padStart(3, "0")}`), o: oc.map((x) => x[0]), c: oc.map((x) => x[1]),
    h: oc.map(([o, c]) => Math.max(o, c) + 0.1), l: oc.map(([o, c]) => Math.min(o, c) - 0.1) };
}
/** The worked example: older pivot high 103.3 (bar 22), swing low L = 99.1 (bar 27), swing high H = 110.1 (bar 38, confirmed at 43),
 * retrace to 103.1 (bar 47, below F618 = 103.302), green bar 48 closes above F786 = 101.454 -> entry at the open of bar 49 (104.1). */
function base(after: [number, number][]): [number, number][] {
  const p: [number, number][] = [];
  for (let i = 0; i < 20; i++) p.push(i % 2 ? [100.5, 100.9] : [100.9, 100.5]);
  p.push([100.9, 101.6], [101.6, 102.4], [102.4, 103.2], [103.1, 102.4], [102.4, 101.6], [101.6, 100.8], [100.8, 100.0], [100.0, 99.2], // 20-27
    [99.3, 100.0], [100, 101], [101, 102], [102, 103], [103, 104], [104, 105], [105, 106], [106, 107], [107, 108], [108, 109], [109, 110], // 28-38
    [109.9, 109.3], [109.3, 108.7], [108.7, 108.1], [108.1, 107.5], [107.5, 106.9], // 39-43
    [106.9, 106.0], [106.0, 105.0], [105.0, 104.0], [104.0, 103.2], [103.3, 104.0]); // 44-48
  return [...p, ...after];
}
const up: [number, number][] = [[104.1, 105], [105, 106], [106, 107], [107, 108], [108, 109], [109, 110.2], ...Array.from({ length: 10 }, (): [number, number] => [110.2, 110.2])];
const O: Opts = { confirm: "none", stopMode: "L", holdBars: 14, cost: () => 0 };

describe("fib confluence: indicators", () => {
  it("RSI: only gains -> 100, alternating +1/-1 -> about 50", () => {
    expect(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).at(-1)).toBe(100);
    const alt = Array.from({ length: 60 }, (_, i) => 100 + (i % 2));
    expect(rsi(alt).at(-1)!).toBeGreaterThan(45);
    expect(rsi(alt).at(-1)!).toBeLessThan(55);
  });
  it("ATR of constant 1.0 ranges is 1.0", () => {
    const b: Bars = { day: Array(20).fill("d"), o: Array(20).fill(10), c: Array(20).fill(10), h: Array(20).fill(10.5), l: Array(20).fill(9.5) };
    expect(atr(b).at(-1)).toBeCloseTo(1, 12);
    expect(Number.isNaN(atr(b)[12]!)).toBe(true);
  });
});

describe("fib confluence: rules on the worked example", () => {
  it("long: entry at bar 49 open, stop below L, exit at the target", () => {
    const b = mk(base(up)), A = atr(b);
    const t = fibTrades(b, O);
    expect(t.length).toBe(1);
    const x = t[0]!;
    expect(x.dir).toBe(1);
    expect(x.entryIdx).toBe(49);
    expect(x.entry).toBe(104.1);
    expect(x.stop).toBeCloseTo(99.1 - 0.1 * A[48]!, 12);
    expect(x.target).toBeCloseTo(110.1 - 0.1 * A[48]!, 12);
    expect(x.exit).toBeCloseTo(x.target, 12);
    expect(x.exitIdx).toBe(54);
    expect(x.r).toBeCloseTo((x.target - 104.1) / (104.1 - x.stop), 12);
  });
  it("loss: price falls through the stop -> exactly -1R before costs; costs are subtracted in R", () => {
    const down: [number, number][] = [[104.1, 102], [102, 100], [100, 98.5], ...Array.from({ length: 12 }, (): [number, number] => [98.5, 98.5])];
    const b = mk(base(down));
    const x = fibTrades(b, O)[0]!;
    expect(x.exitIdx).toBe(51);
    expect(x.r).toBeCloseTo(-1, 12);
    const y = fibTrades(b, { ...O, cost: () => 0.5 })[0]!;
    expect(y.r).toBeCloseTo(-1 - 0.5 / (104.1 - y.stop), 12);
  });
  it("time exit at the close of the 14th bar", () => {
    const flat: [number, number][] = Array.from({ length: 20 }, (): [number, number] => [104.1, 104.1]);
    const b = mk(base(flat));
    const x = fibTrades(b, O)[0]!;
    expect(x.exitIdx).toBe(49 + 13);
    expect(x.exit).toBe(104.1);
  });
  it("no trade when L breaks before the entry, or without confluence", () => {
    const p = base(up);
    p[47] = [104.0, 98.9]; // low 98.8 < L 99.1
    expect(fibTrades(mk(p), O).filter((x) => x.dir === 1).length).toBe(0);
    const q = mk(base(up));
    const h = [...q.h]; h[22] = 104.5; // the older pivot moves away from F618/F786
    expect(fibTrades({ ...q, h }, O).filter((x) => x.dir === 1).length).toBe(0);
  });
  it("RSI confirmation: the shallow pullback never reaches RSI <= 35 -> no long", () => {
    expect(longCandidates(mk(base(up)), { ...O, confirm: "rsi" }).length).toBe(0);
  });
  it("mirror image gives the same trade as a short", () => {
    const b = mk(base(up));
    const L = fibTrades(b, O)[0]!, S = fibTrades(mirror(b), O)[0]!;
    expect(S.dir).toBe(-1);
    expect(S.entryIdx).toBe(L.entryIdx);
    expect(S.r).toBeCloseTo(L.r, 12);
  });
  it("random direction: same entry and distances, opposite side", () => {
    const b = mk(base(up));
    const L = fibTrades(b, O)[0]!, F = fibTrades(b, { ...O, flip: () => true })[0]!;
    expect(F.dir).toBe(-1);
    expect(F.entry).toBe(L.entry);
    expect(F.stop).toBeCloseTo(L.entry + (L.entry - L.stop), 12);
    expect(F.target).toBeCloseTo(L.entry - (L.target - L.entry), 12);
    // price rises to 110.2: the short's stop (~109) is hit at bar 53 (high 109.1 >= stop?) -> -1R
    expect(F.r).toBeCloseTo(-1, 12);
  });
  it("confluence tolerance is 0.5 ATR: an older pivot 0.4 ATR away counts, 0.6 ATR away does not", () => {
    const q = mk(base(up)), A = atr(q), f618 = 110.1 - 0.618 * 11.0;
    const h4 = [...q.h]; h4[22] = f618 + 0.4 * A[43]!;
    expect(fibTrades({ ...q, h: h4 }, O).filter((x) => x.dir === 1).length).toBe(1);
    const h6 = [...q.h]; h6[22] = f618 + 0.6 * A[43]!;
    expect(fibTrades({ ...q, h: h6 }, O).filter((x) => x.dir === 1).length).toBe(0);
  });
  it("the entry bar must close above F786 (a green bar below it is skipped)", () => {
    const p = base([]);
    p[48] = [103.1, 101.0]; // red, low 100.9 (still above L 99.1)
    p.push([101.0, 101.3], [101.4, 102.5], ...up); // 49 green but closes below F786 = 101.454; 50 closes above it
    const x = fibTrades(mk(p), O).filter((t) => t.dir === 1)[0]!;
    expect(x.entryIdx).toBe(51);
  });
  it("no trade when the next open is already above the target", () => {
    const p = base([[111, 111], ...Array.from({ length: 14 }, (): [number, number] => [111, 111])]);
    expect(fibTrades(mk(p), O).filter((x) => x.dir === 1).length).toBe(0);
  });
  it("simLong: a gap below the stop exits at the open", () => {
    const b = mk([[10, 10], [10, 10], [8, 8], [8, 8]]);
    expect(simLong(b, 1, 9, 12, 10)).toEqual({ exit: 8, exitIdx: 2 });
  });
});
