import { describe, expect, it } from "vitest";
import { buildMarket, perfOf, runS1, runS2, s1Prepare, s2Prepare, sma, weeks, type S2Prep } from "../src/investclub/core.js";

/** weekdays from 2015-01-05 (a Monday) */
function weekdays(n: number): string[] {
  const out: string[] = [];
  for (let t = Date.UTC(2015, 0, 5); out.length < n; t += 86400e3) { const d = new Date(t); if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10)); }
  return out;
}
type Bar = [number, number, number, number, number]; // o h l c v
const raw = (sym: string, days: string[], bars: Bar[]) => ({ sym, d: days.slice(0, bars.length), o: bars.map((b) => b[0]), h: bars.map((b) => b[1]), l: bars.map((b) => b[2]), c: bars.map((b) => b[3]), v: bars.map((b) => b[4]) });

describe("investclub: calendar and indicators", () => {
  it("weeks are Monday-based; last = last trading day of the week", () => {
    const d = weekdays(12); // Mon 5 Jan .. Tue 20 Jan
    const W = weeks(d);
    expect(Array.from(W.id)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2]);
    expect(W.last).toEqual([4, 9, 11]);
    const holiday = weeks(d.filter((_, i) => i !== 4)); // Friday missing
    expect(holiday.last[0]).toBe(3);
  });
  it("sma", () => { expect(Array.from(sma([1, 2, 3, 4], 2))).toEqual([NaN, 1.5, 2.5, 3.5]); });
});

describe("S1 Weinstein", () => {
  // 400 days: slow rise (10 -> ~11.3), breakout week at days 400-404 (+6%, 3x volume), flat 5 weeks, then a 25% drop
  const N = 470, days = weekdays(N), spy = days.map((_, i) => 100 * (1 + 0.0002 * i));
  const bars: Bar[] = [];
  for (let i = 0; i < N; i++) {
    let c = 10 * (1 + 0.00033 * Math.min(i, 399)), v = 1e7;
    if (i >= 400) c = 10 * (1 + 0.00033 * 399) * 1.06;
    if (i >= 400 && i < 405) v = 3e7;
    if (i >= 430) c *= 0.75;
    bars.push([c, c * 1.01, c * 0.99, c, v]);
  }
  const m = buildMarket(days, spy, [raw("UP", days, bars)]);
  const P = s1Prepare(m);
  const W = weeks(days), bw = W.id[404]!;
  it("one signal: the breakout week", () => {
    const all = P.sigs.flatMap((a, w) => a.map(() => w));
    expect(all).toEqual([bw]);
  });
  it("trade: buy at the next open with 5% of equity, sell at the open after the first weekly close below MA30", () => {
    const r = runS1(m, P, 0.001, 260);
    expect(r.trades.length).toBe(1);
    const t = r.trades[0]!;
    expect(t.entryDay).toBe(W.last[bw]! + 1);
    const dropWeekEnd = W.last[W.id[430]!]!;
    expect(t.exitDay).toBe(dropWeekEnd + 1);
    expect(t.ret).toBeCloseTo((t.exit * (1 - 0.001)) / (t.entry * (1 + 0.001)) - 1, 12);
    // equity: 95% cash + position
    const d = t.entryDay;
    expect(r.equity[d]).toBeCloseTo(0.95 + (0.05 / (t.entry * 1.001)) * bars[d]![3], 12);
    expect(r.equity[t.exitDay]).toBeCloseTo(0.95 + (0.05 / (t.entry * 1.001)) * t.exit * 0.999, 12);
  });
  it("only a FRESH breakout counts (a second up week with high volume is not a new signal)", () => {
    const b3 = bars.map((b, i): Bar => (i >= 405 && i < 410 ? [b[3] * 1.06, b[3] * 1.07, b[3] * 1.05, b[3] * 1.06, 3e7] : b));
    expect(s1Prepare(buildMarket(days, spy, [raw("UP", days, b3)])).sigs.flatMap((a, w) => a.map(() => w))).toEqual([bw]);
  });
  it("no signal without the volume surge or when the market is below its MA30", () => {
    const b2 = bars.map((b, i): Bar => [b[0], b[1], b[2], b[3], i >= 400 && i < 405 ? 1.5e7 : b[4]]);
    expect(s1Prepare(buildMarket(days, spy, [raw("UP", days, b2)])).sigs.flat().length).toBe(0);
    const spyDown = days.map((_, i) => 100 * (1 - 0.0005 * i));
    expect(s1Prepare(buildMarket(days, spyDown, [raw("UP", days, bars)])).sigs.flat().length).toBe(0);
  });
  it("random control picks from the pool and still uses the same exits", () => {
    const r = runS1(m, P, 0.001, 260, (w) => [0]);
    expect(r.trades.length).toBe(1);
  });
});

describe("S2 Kullamägi", () => {
  const N = 220, days = weekdays(N), spy = days.map(() => 100);
  // flat 10, jump to 13.5 at day 120, drift to 14.1 by day 172 with highs capped at 14.5 from day 160
  const bars: Bar[] = [];
  for (let i = 0; i < N; i++) {
    const c = i < 120 ? 10 : Math.min(14.1, 13.5 + (0.6 * (i - 120)) / 52);
    bars.push([c, i >= 160 ? 14.5 : c * 1.03, c * 0.99, c, 1e7]);
  }
  it("s2Prepare: a signal with level 14.5 on day 172; none with a low ADR", () => {
    const m = buildMarket(days, spy, [raw("MO", days, bars)]);
    const P = s2Prepare(m);
    expect(P.sig[172]!.length).toBe(1);
    expect(P.sig[172]![0]!.level).toBeCloseTo(14.5, 12);
    expect(P.pool[172]!.map((x) => x.s)).toEqual([0]);
    const flat = bars.map((b): Bar => [b[0], b[3] * 1.02, b[3] * 0.99, b[3], b[4]]); // ADR ~3%
    const F = s2Prepare(buildMarket(days, spy, [raw("MO", days, flat)]));
    expect(F.sig.flat().length).toBe(0);
    expect(F.pool.flat().length).toBe(0);
  });
  it("runS2: breakout entry, half sold on day 3, rest out on the first close below SMA10", () => {
    const b = bars.slice(0, 173);
    b.push([14.2, 15, 14.1, 14.9, 1e7], [14.9, 15.6, 14.8, 15.5, 1e7], [15.5, 16.1, 15.4, 16, 1e7], [16, 16.6, 15.9, 16.5, 1e7], [16.5, 16.6, 14.55, 14.6, 1e7], [14.6, 14.7, 14.55, 14.6, 1e7]);
    for (let i = b.length; i < N; i++) b.push([15, 15.1, 14.9, 15, 1e7]);
    const m = buildMarket(days, spy, [raw("MO", days, b)]);
    const P: S2Prep = { sig: days.map((_, d) => (d === 172 ? [{ s: 0, level: 14.5, adr: 0.04, r63: 0.4 }] : [])), pool: days.map(() => []), sma10: [sma(b.map((x) => x[3]), 10)] };
    const r = runS2(m, P, 0, 150);
    expect(r.trades.length).toBe(1);
    const t = r.trades[0]!;
    expect(t.entryDay).toBe(173);
    expect(t.entry).toBe(14.5);
    // day 176 (age 3): close 16.5 > 14.5 -> half at 16.5, stop -> 14.5; day 177 low 14.55 (stop holds), close 14.6 < SMA10 -> rest at 14.6
    const s10 = sma(b.map((x) => x[3]), 10);
    expect(14.6).toBeLessThan(s10[177]!);
    expect(t.exitDay).toBe(177);
    expect(t.ret).toBeCloseTo((0.5 * 16.5 + 0.5 * 14.6) / 14.5 - 1, 12);
    // size: risk 0.5% / 4% stop = 12.5% of equity
    const shares = 0.125 / 14.5;
    expect(r.equity[173]).toBeCloseTo(1 - 0.125 + shares * 14.9, 12);
  });
  it("runS2: entry-day low through the stop -> stopped at the stop the same day; gap below the stop -> out at the open", () => {
    const b = bars.slice(0, 173);
    b.push([14.2, 15, 13.8, 14.9, 1e7]);
    for (let i = b.length; i < N; i++) b.push([15, 15.1, 14.9, 15, 1e7]);
    const m = buildMarket(days, spy, [raw("MO", days, b)]);
    const P: S2Prep = { sig: days.map((_, d) => (d === 172 ? [{ s: 0, level: 14.5, adr: 0.04, r63: 0.4 }] : [])), pool: days.map(() => []), sma10: [sma(b.map((x) => x[3]), 10)] };
    const t = runS2(m, P, 0, 150).trades[0]!;
    expect(t.exitDay).toBe(173);
    expect(t.ret).toBeCloseTo(-0.04, 12);
    const g = bars.slice(0, 173);
    g.push([14.2, 15, 14.1, 14.9, 1e7], [13.0, 13.2, 12.9, 13.1, 1e7]);
    for (let i = g.length; i < N; i++) g.push([13, 13.1, 12.9, 13, 1e7]);
    const t2 = runS2(buildMarket(days, spy, [raw("MO", days, g)]), { ...P, sma10: [sma(g.map((x) => x[3]), 10)] }, 0, 150).trades[0]!;
    expect(t2.exit).toBe(13.0);
  });
  const P0 = (b: Bar[]): S2Prep => ({ sig: days.map((_, d) => (d === 172 ? [{ s: 0, level: 14.5, adr: 0.04, r63: 0.4 }] : [])), pool: days.map(() => []), sma10: [sma(b.map((x) => x[3]), 10)] });
  const fillTo = (b: Bar[], x: Bar) => { while (b.length < N) b.push(x); return b; };
  it("runS2: a gap above the level -> entry at the open", () => {
    const b = fillTo([...bars.slice(0, 173), [14.8, 15, 14.7, 14.9, 1e7]], [15, 15.1, 14.9, 15, 1e7]);
    const r = runS2(buildMarket(days, spy, [raw("MO", days, b)]), P0(b), 0, 150);
    expect(r.equity[173]).toBeCloseTo(0.875 + (0.125 / 14.8) * 14.9, 12);
  });
  it("runS2: after the half sale the stop is at the entry", () => {
    const b = fillTo([...bars.slice(0, 173), [14.2, 15, 14.1, 14.9, 1e7], [14.9, 15.6, 14.8, 15.5, 1e7], [15.5, 16.1, 15.4, 16, 1e7], [16, 16.6, 15.9, 16.5, 1e7], [16.5, 17, 14.4, 16.8, 1e7]], [17, 17.1, 16.9, 17, 1e7]);
    const t = runS2(buildMarket(days, spy, [raw("MO", days, b)]), P0(b), 0, 150).trades[0]!;
    expect(t.exitDay).toBe(177);
    expect(t.ret).toBeCloseTo((0.5 * 16.5 + 0.5 * 14.5) / 14.5 - 1, 12);
  });
  it("runS2: the SMA10 exit starts only on day 3", () => {
    const b = fillTo([...bars.slice(0, 173), [14.2, 15, 14.1, 14.9, 1e7], [14.9, 14.95, 14.05, 14.1, 1e7], [14.1, 15.6, 14.1, 15.5, 1e7], [15.5, 16.6, 15.4, 16.5, 1e7]], [16.5, 16.6, 16.4, 16.5, 1e7]);
    const s10 = sma(b.map((x) => x[3]), 10);
    expect(14.1).toBeLessThan(s10[174]!);
    expect(runS2(buildMarket(days, spy, [raw("MO", days, b)]), P0(b), 0, 150).trades.filter((t) => t.exitDay === 174).length).toBe(0);
  });
  it("runS2: no entry if the high does not exceed the level", () => {
    const b = bars.slice(0, 173);
    for (let i = b.length; i < N; i++) b.push([14.2, 14.5, 14.1, 14.3, 1e7]);
    const m = buildMarket(days, spy, [raw("MO", days, b)]);
    const P: S2Prep = { sig: days.map((_, d) => (d === 172 ? [{ s: 0, level: 14.5, adr: 0.04, r63: 0.4 }] : [])), pool: days.map(() => []), sma10: [sma(b.map((x) => x[3]), 10)] };
    expect(runS2(m, P, 0, 150).trades.length).toBe(0);
  });
});

describe("measures", () => {
  it("perfOf: CAGR, max drawdown", () => {
    const eq = Array.from({ length: 253 }, (_, i) => (i <= 100 ? 1 + i / 100 : 2 - (i - 100) / 200));
    const p = perfOf(eq, 0, 252);
    expect(p.maxDD).toBeCloseTo(eq[252]! / 2 - 1, 12);
    expect(p.cagr).toBeCloseTo(eq[252]! - 1, 12);
  });
});
