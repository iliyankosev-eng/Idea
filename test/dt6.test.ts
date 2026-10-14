import { describe, expect, it } from "vitest";
import { candidates, orbTrade, portfolio } from "../src/daytrade/dt6.js";
import type { Session } from "../src/intraday/sessions.js";

type Row = [number, number, number, number, number, number];
const mk = (date: string, rows: Row[]): Session => ({ symbol: "X", date, minute: rows.map((r) => r[0]), o: rows.map((r) => r[1]), h: rows.map((r) => r[2]), l: rows.map((r) => r[3]), c: rows.map((r) => r[4]), v: rows.map((r) => r[5]) });
const date = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
/** price level p: first five minutes volume 1000, range p +- 0.5% (TR 1%), daily volume 2 000 200 */
const priorDay = (i: number, p = 100) => mk(date(i), [[570, p, p * 1.005, p * 0.995, p, 200], [571, p, p, p, p, 200], [572, p, p, p, p, 200], [573, p, p, p, p, 200], [574, p, p, p, p, 200], [959, p, p, p, p, 2_000_000]]);
const today = (i: number, tail: Row[], p = 100) => mk(date(i), [[570, p, p * 1.003, p, p * 1.001, 400], [571, p * 1.001, p * 1.004, p * 1.001, p * 1.002, 400], [572, p * 1.002, p * 1.002, p * 1.001, p * 1.002, 400], [573, p * 1.002, p * 1.003, p * 1.002, p * 1.003, 400], [574, p * 1.003, p * 1.003, p * 1.002, p * 1.003, 400], ...tail]);
// first candle: open 100, close 100.3 (bullish), high 100.4 -> buy stop 100.4; ATR = 1% x 100 = 1.0 -> stop 0.1 below the fill
const tail: Row[] = [[575, 100.35, 100.38, 100.33, 100.36, 10], [576, 100.38, 100.6, 100.35, 100.55, 10], [959, 101, 101, 101, 101, 10]];

describe("DT6 Stocks in Play ORB (hand-calculated)", () => {
  const ss = [...Array.from({ length: 15 }, (_, i) => priorDay(i)), today(15, tail)];
  const news = [Date.parse("2026-01-16T12:00:00Z")]; // between 15.01 16:00 NY (21:00Z) and 16.01 09:30 NY (14:30Z)
  it("RelVol 2, ATR 1.0, news before the open", () => {
    const c = candidates("X", ss, news);
    expect(c).toHaveLength(1);
    expect(c[0]!.relVol).toBeCloseTo(2, 12);
    expect(c[0]!.atr).toBeCloseTo(1, 12);
    expect(c[0]!.hasNews).toBe(true);
    expect(candidates("X", ss, [Date.parse("2026-01-15T20:59:00Z")])[0]!.hasNews).toBe(false); // before 16:00 the previous day
  });
  it("buy stop at 100.4, stop 100.3, exit 101 at the close; size capped at 4x", () => {
    const f = orbTrade(candidates("X", ss, news)[0]!, 0);
    expect(f.traded).toBe(true);
    expect(f.r).toBeCloseTo((101 - 100.4) * (4 / 100.4), 12);
    expect(f.exposure).toBeCloseTo(4, 12);
    expect(orbTrade(candidates("X", ss, news)[0]!, 0.0045).r).toBeCloseTo((101 - 100.4) * (4 / 100.4) - 2 * 0.0045 * (4 / 100.4), 12);
  });
  it("stopped out in the entry minute; gap through the stop fills at the open", () => {
    const hit = [...ss.slice(0, 15), today(15, [[575, 100.35, 100.38, 100.33, 100.36, 10], [576, 100.38, 100.6, 100.25, 100.3, 10], [959, 101, 101, 101, 101, 10]])];
    expect(orbTrade(candidates("X", hit, [])[0]!, 0).r).toBeCloseTo(-0.1 * (4 / 100.4), 12);
    const gap = [...ss.slice(0, 15), today(15, [[576, 100.38, 100.6, 100.35, 100.55, 10], [600, 100, 100.1, 99.9, 100, 10], [959, 101, 101, 101, 101, 10]])];
    expect(orbTrade(candidates("X", gap, [])[0]!, 0).r).toBeCloseTo((100 - 100.4) * (4 / 100.4), 12);
  });
  it("the buy stop fills at the open when the price gaps above the level", () => {
    const up = [...ss.slice(0, 15), today(15, [[575, 100.35, 100.38, 100.33, 100.36, 10], [576, 100.5, 100.7, 100.45, 100.6, 10], [959, 101, 101, 101, 101, 10]])];
    expect(orbTrade(candidates("X", up, [])[0]!, 0).r).toBeCloseTo((101 - 100.5) * (4 / 100.5), 12);
  });
  it("filters: ATR below $0.50 or RelVol history too short -> no candidate", () => {
    const cheap = [...Array.from({ length: 15 }, (_, i) => priorDay(i, 20)), today(15, tail.map((r) => [r[0], r[1] / 5, r[2] / 5, r[3] / 5, r[4] / 5, r[5]] as Row), 20)];
    expect(candidates("X", cheap, [])).toHaveLength(0); // ATR = 1% x 20 = 0.2
    expect(candidates("X", ss.slice(5), [])).toHaveLength(0);
  });
  it("portfolio: two 4x positions on one day are scaled to 4x in total", () => {
    const c = candidates("X", ss, news)[0]!;
    const r1 = orbTrade(c, 0).r;
    const p = portfolio([c.date, "2026-01-17"], [c, { ...c, sym: "Y" }], () => true, 0);
    expect(p[0]!.r).toBeCloseTo(0.5 * 2 * r1, 12);
    expect(p[1]).toEqual({ day: "2026-01-17", r: 0, trades: 0 });
    expect(portfolio([c.date], [c], (x) => !x.hasNews, 0)[0]!.trades).toBe(0);
  });
});
