import { describe, expect, it } from "vitest";
import { dt1, dt2, dt3, dt4, dt5, nyToUtc, perf, vwapBefore } from "../src/daytrade/dt.js";
import type { Session } from "../src/intraday/sessions.js";

type Row = [number, number, number, number, number, number]; // minute, o, h, l, c, v
const mk = (date: string, rows: Row[], prevDate?: string): Session => ({ symbol: "SPY", date, ...(prevDate ? { prevDate } : {}), minute: rows.map((r) => r[0]), o: rows.map((r) => r[1]), h: rows.map((r) => r[2]), l: rows.map((r) => r[3]), c: rows.map((r) => r[4]), v: rows.map((r) => r[5]) });
const flat = (m: number, p: number): Row => [m, p, p, p, p, 100];
const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

describe("DT1 Noise Area (hand-calculated)", () => {
  // 15 earlier sessions: open 100, every checked minute closes at 100.2 -> sigma = 0.002; last close 100.2
  const checkMinutes = Array.from({ length: 12 }, (_, k) => 599 + 30 * k); // 599, 629, ..., 929
  const prior = Array.from({ length: 15 }, (_, i) => mk(day(i), [[570, 100, 100, 100, 100, 100], ...checkMinutes.map((m) => flat(m, 100.2)), flat(959, 100.2)], i ? day(i - 1) : undefined));
  // today: UB = 100.2 * 1.002 = 100.4004, LB = 100 * 0.998 = 99.8
  const today = mk(day(15), [flat(570, 100), flat(599, 100.5), flat(600, 100.5), flat(629, 100.45), flat(630, 100.45), flat(659, 100.3), flat(660, 100.3), flat(959, 100.3)], day(14));
  const ss = [...prior, today];
  it("VWAP of the bars before 10:30 = (100 + 100.5 + 100.5 + 100.45) / 4", () => expect(vwapBefore(today, 630)).toBeCloseTo(100.3625, 10));
  it("long at 10:00 above UB, kept at 10:30 (above max(UB, VWAP)), stopped at 11:00", () => {
    const r = dt1(ss, { dynamic: false, execNextOpen: true, cost: 0 }).at(-1)!;
    expect(r.trades).toBe(1);
    expect(r.r).toBeCloseTo((100.3 - 100.5) * 0.01, 12);
    expect(dt1(ss, { dynamic: false, execNextOpen: true, cost: 0.0045 }).at(-1)!.r).toBeCloseTo(-0.002 - 2 * 0.0045 * 0.01, 12);
  });
  it("the VWAP part of the stop: above UB but below a high VWAP -> exit", () => {
    const t2 = mk(day(15), [flat(570, 100), [599, 101, 101, 101, 101, 10000], flat(600, 101), flat(629, 100.6), flat(630, 100.6), flat(959, 101.5)], day(14));
    const r = dt1([...prior, t2], { dynamic: false, execNextOpen: true, cost: 0 }).at(-1)!;
    expect(r.r).toBeCloseTo((100.6 - 101) * 0.01, 12); // stopped at 10:30 although 100.6 > UB 100.4004, and not re-entered (100.6 < VWAP)
  });
  it("UB uses max(open, previous close): 100.3 at 10:00 is below UB 100.4004 -> no trade", () => {
    const t3 = mk(day(15), [flat(570, 100), flat(599, 100.3), flat(600, 100.3), flat(959, 100.3)], day(14));
    expect(dt1([...prior, t3], { dynamic: false, execNextOpen: true, cost: 0 }).at(-1)!.trades).toBe(0);
  });
  it("no trade when today's open does not link to the previous session", () => {
    const broken = [...prior, { ...today, prevDate: "1999-01-01" }];
    expect(dt1(broken, { dynamic: false, execNextOpen: true, cost: 0 }).at(-1)!.trades).toBe(0);
  });
});

describe("DT2 VWAP trend (hand-calculated)", () => {
  const s = mk("2026-01-02", [[570, 100, 100, 100, 100, 100], [571, 100, 101, 100, 101, 100], [572, 101.2, 101.2, 99, 99, 100], [573, 99, 99, 98, 98, 100], [574, 97.5, 97.6, 97, 97, 100]]);
  it("long at the 09:32 open 101.2, flip short at 99 (09:33), flatten at 97.5 (last minute open)", () => {
    expect(dt2([s], 0)[0]).toMatchObject({ trades: 2 });
    expect(dt2([s], 0)[0]!.r).toBeCloseTo(((99 - 101.2) + (99 - 97.5)) * 0.01, 12);
    expect(dt2([s], 0.0045)[0]!.r).toBeCloseTo(-0.007 - 4 * 0.0045 * 0.01, 12);
  });
});

describe("DT3 5-minute ORB (hand-calculated)", () => {
  const first: Row[] = [[570, 100, 100.8, 99.6, 100.2, 1], [571, 100.2, 100.5, 99.9, 100.1, 1], [572, 100.1, 100.4, 100, 100.3, 1], [573, 100.3, 100.6, 100.1, 100.4, 1], [574, 100.4, 100.6, 100.2, 100.5, 1]];
  it("bullish first candle: long 100.6, stop 99.6 (risk 1, 1% of capital)", () => {
    const s = mk("2026-01-02", [...first, [575, 100.6, 100.9, 100.5, 100.8, 1], [600, 100.7, 100.7, 99.5, 99.7, 1], [959, 99.7, 99.8, 99.6, 99.7, 1]]);
    expect(dt3([s], 0)[0]!.r).toBeCloseTo(-0.01, 12);
    expect(dt3([s], 0.0045)[0]!.r).toBeCloseTo(-0.01 - 2 * 0.0045 * 0.01, 12);
  });
  it("tiny risk: size capped at 4x leverage", () => {
    const tight: Row[] = [[570, 100, 100.6, 100.5, 100.55, 1], [571, 100.55, 100.6, 100.55, 100.56, 1], [572, 100.56, 100.6, 100.55, 100.57, 1], [573, 100.57, 100.6, 100.55, 100.58, 1], [574, 100.58, 100.6, 100.55, 100.59, 1]];
    // first candle: open 100, close 100.59 (bullish), low 100.5 -> entry 100.6, risk 0.1 -> 1%/0.1 = 0.1 shares per $ > 4/100.6
    const s = mk("2026-01-02", [...tight, [575, 100.6, 100.7, 100.55, 100.65, 1], [959, 101, 101, 101, 101, 1]]);
    expect(dt3([s], 0)[0]!.r).toBeCloseTo((101 - 100.6) * (4 / 100.6), 12);
  });
  it("gap through the stop fills at the open; no stop -> exit at the close", () => {
    const gap = mk("2026-01-02", [...first, [575, 100.6, 100.9, 100.5, 100.8, 1], [600, 99, 99.2, 98.8, 99.1, 1], [959, 99, 99, 99, 99, 1]]);
    expect(dt3([gap], 0)[0]!.r).toBeCloseTo((99 - 100.6) * 0.01, 12);
    const up = mk("2026-01-02", [...first, [575, 100.6, 100.9, 100.5, 100.8, 1], [959, 102, 102.1, 101.9, 102, 1]]);
    expect(dt3([up], 0)[0]!.r).toBeCloseTo((102 - 100.6) * 0.01, 12);
  });
});

describe("DT4 first half-hour -> last half-hour (hand-calculated)", () => {
  it("normal day: long at 15:30, out at 16:00; early close: the last half-hour is 12:30-13:00", () => {
    const y = mk("2026-01-01", [flat(570, 99), flat(959, 100)]);
    const t = mk("2026-01-02", [flat(570, 101), flat(599, 100.5), [930, 101, 101.2, 100.9, 101.1, 1], flat(959, 101.5)], "2026-01-01"); // +0.5% vs yesterday's close, -0.5% vs today's open
    expect(dt4([y, t], 0)[1]!.r).toBeCloseTo(0.5 / 101, 12);
    const early = mk("2026-01-02", [flat(570, 100.2), flat(599, 99.5), [750, 99, 99, 99, 99, 1], flat(779, 98)], "2026-01-01");
    expect(dt4([y, early], 0.0045)[1]!.r).toBeCloseTo(-1 * (98 / 99 - 1) - 0.009 / 99, 12);
  });
});

describe("DT5 bitcoin last half-hour (hand-calculated)", () => {
  it("New York times with daylight saving", () => {
    expect(new Date(nyToUtc("2026-01-15", 16, 30)).toISOString()).toBe("2026-01-15T21:30:00.000Z");
    expect(new Date(nyToUtc("2026-07-15", 16, 30)).toISOString()).toBe("2026-07-15T20:30:00.000Z");
  });
  it("ONFH > 0 and SLH < 0 -> long 16:30 -> 17:00", () => {
    const pts: [string, number][] = [["2026-01-14T21:59:00Z", 100], ["2026-01-15T14:59:00Z", 102], ["2026-01-15T20:59:00Z", 103], ["2026-01-15T21:29:00Z", 102.5], ["2026-01-15T21:59:00Z", 103.5]];
    const b = { t: pts.map((p) => Date.parse(p[0])), c: pts.map((p) => p[1]) };
    expect(dt5(b, ["2026-01-15"], 0.0005)[0]!.r).toBeCloseTo(103.5 / 102.5 - 1 - 0.001, 12);
    const flip = { t: b.t, c: [100, 99, 98, 98.5, 98] }; // ONFH < 0, SLH > 0 -> short
    expect(dt5(flip, ["2026-01-15"], 0)[0]!.r).toBeCloseTo(-(98 / 98.5 - 1), 12);
    const mixed = { t: b.t, c: [100, 102, 103, 103.5, 104] }; // ONFH > 0 and SLH > 0 -> no trade
    expect(dt5(mixed, ["2026-01-15"], 0)[0]!.trades).toBe(0);
    const late = { t: [...b.t.slice(0, 4), Date.parse("2026-01-15T21:54:30Z")], c: b.c }; // last bar 4.5 minutes before 21:59
    expect(dt5(late, ["2026-01-15"], 0)[0]!.trades).toBe(1);
  });
});

describe("performance summary", () => {
  it("total, max drawdown", () => {
    const p = perf([{ day: "a", r: 0.1, trades: 1 }, { day: "b", r: -0.5, trades: 1 }, { day: "c", r: 0.2, trades: 1 }]);
    expect(p.total).toBeCloseTo(1.1 * 0.5 * 1.2 - 1, 12);
    expect(p.mdd).toBeCloseTo(-0.5, 12);
  });
});
