import { describe, expect, it } from "vitest";
import type { MinuteBars } from "../src/data/intraday.js";
import { h1Plan, h2Plan, h3Plan, medianRange20, randomTrades, realTrades } from "../src/intraday/hypotheses.js";
import { completeSessions, toSessions, type Session } from "../src/intraday/sessions.js";
import { simulateTrade } from "../src/intraday/sim.js";

/** Session from rows [minute, o, h, l, c]. */
const sess = (date: string, rows: [number, number, number, number, number][], symbol = "X"): Session => ({
  symbol, date, minute: rows.map((r) => r[0]), o: rows.map((r) => r[1]), h: rows.map((r) => r[2]), l: rows.map((r) => r[3]), c: rows.map((r) => r[4]),
});
const M = (h: number, m: number) => h * 60 + m;

describe("simulateTrade (hand-calculated)", () => {
  const base = sess("2024-01-02", [[M(9, 50), 100, 100.5, 99.8, 100.2], [M(9, 51), 100.2, 101.5, 98.9, 100], [M(9, 52), 100, 100.1, 99.9, 100.05]]);

  it("stop counts first when stop and target are touched in the same bar", () => {
    const t = simulateTrade(base, { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: 99, target: 101 }, 0)!;
    expect([t.entry, t.exit, t.reason]).toEqual([100, 99, "stop"]);
    expect(t.r).toBeCloseTo(-1, 12);
  });

  it("target fills exactly at the target; cost is charged on both sides", () => {
    const t = simulateTrade(base, { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: 98, target: 100.5 }, 0.001)!;
    expect([t.exit, t.reason]).toEqual([100.5, "target"]); // reached in the entry bar itself
    expect(t.ret).toBeCloseTo(0.005 - 0.002, 12);
    expect(t.r).toBeCloseTo(0.25, 12); // +0.5 on a risk of 2
  });

  it("a gap through the stop fills at the (worse) open", () => {
    const s = sess("2024-01-02", [[M(9, 50), 100, 100, 99.9, 99.95], [M(9, 51), 98, 98.5, 97.5, 98]]);
    const t = simulateTrade(s, { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: 99, target: 105 }, 0)!;
    expect([t.exit, t.reason]).toEqual([98, "stop"]);
  });

  it("time exit at the close of the last bar before the exit minute; missing entry bar uses the next one", () => {
    const s = sess("2024-01-02", [[M(9, 52), 100, 100.2, 99.9, 100.1], [M(10, 29), 100.1, 100.3, 100, 100.25], [M(10, 30), 100.25, 110, 90, 100]]);
    const t = simulateTrade(s, { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: 95, target: 105 }, 0)!;
    expect([t.entry, t.exit, t.reason]).toEqual([100, 100.25, "time"]);
  });

  it("short trades mirror the rules", () => {
    const t = simulateTrade(base, { dir: -1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: 101, target: 99.5 }, 0)!;
    expect([t.exit, t.reason]).toEqual([101, "stop"]); // bar 2: high 101.5 >= stop before low 98.9 <= target
    expect(t.ret).toBeCloseTo(-0.01, 12);
  });

  it("the entry bar itself is checked: a stop touched only in the entry bar exits there", () => {
    const s = sess("2024-01-02", [[M(9, 50), 100, 100.1, 98.5, 99.5], [M(9, 51), 99.5, 103, 99.4, 102.5]]);
    const t = simulateTrade(s, { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: 99, target: 102 }, 0)!;
    expect([t.exit, t.reason]).toEqual([99, "stop"]); // skipping the entry bar would wrongly give the target 102
  });

  it("percentage distances (random baselines) and a non-positive risk", () => {
    const t = simulateTrade(base, { dir: -1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: null, target: null, stopPct: 0.02, targetPct: 0.011 }, 0)!;
    expect([t.exit, t.reason]).toEqual([98.9, "target"]); // short target 100 * (1 - 0.011) = 98.9
    expect(simulateTrade(base, { dir: 1, entryMinute: M(9, 50), exitMinute: M(10, 29), stop: 100, target: 101 }, 0)).toBeNull();
  });
});

describe("toSessions (New York time, daylight saving, weekends)", () => {
  const bars = (iso: string[]): MinuteBars => ({ symbol: "X", t: iso.map(Date.parse), o: iso.map(() => 1), h: iso.map(() => 1), l: iso.map(() => 1), c: iso.map(() => 1), v: iso.map(() => 1), missingMinutes: NaN });
  it("09:30 New York in winter and in summer, drops pre-market and weekends", () => {
    const ss = toSessions(bars(["2024-03-08T14:29:00Z", "2024-03-08T14:30:00Z", "2024-03-08T20:59:00Z", "2024-03-09T15:00:00Z", "2024-03-11T13:29:00Z", "2024-03-11T13:30:00Z", "2024-03-11T20:00:00Z"]));
    expect(ss.map((s) => [s.date, s.minute])).toEqual([["2024-03-08", [570, 959]], ["2024-03-11", [570]]]);
  });
});

describe("toSessions with the exchange calendar", () => {
  const bars = (iso: string[]): MinuteBars => ({ symbol: "X", t: iso.map(Date.parse), o: iso.map(() => 1), h: iso.map(() => 1), l: iso.map(() => 1), c: iso.map(() => 1), v: iso.map(() => 1), missingMinutes: NaN });
  it("cuts an early close at 13:00 and drops a holiday with stray prints", () => {
    const cal = new Map<string, readonly [number, number]>([["2024-11-29", [570, 780]], ["2024-12-02", [570, 960]]]);
    const ss = toSessions(bars([
      "2024-11-28T15:00:00Z", // Thanksgiving 10:00 EST: no session in the calendar -> dropped
      "2024-11-29T14:30:00Z", "2024-11-29T17:59:00Z", // 09:30 and 12:59 on the early-close day -> kept
      "2024-11-29T18:00:00Z", "2024-11-29T20:30:00Z", // 13:00 and 15:30 after the early close -> dropped
      "2024-12-02T20:59:00Z", // 15:59 on a normal day -> kept
    ]), cal);
    expect(ss.map((s) => [s.date, s.minute])).toEqual([["2024-11-29", [570, 779]], ["2024-12-02", [959]]]);
  });
});

describe("incomplete days (data-provider outages)", () => {
  it("drops a session with under half of the official minutes and H3 refuses a missing previous day", () => {
    const cal = new Map<string, readonly [number, number]>([["2018-05-01", [570, 960]], ["2018-05-02", [570, 960]], ["2018-05-03", [570, 960]]]);
    const full = (d: string, p: number) => sess(d, Array.from({ length: 390 }, (_, i) => [570 + i, p, p, p, p] as [number, number, number, number, number]));
    const one = sess("2018-05-02", [[570, 50, 50, 50, 50]]);
    const { kept, dropped } = completeSessions([full("2018-05-01", 100), one, full("2018-05-03", 101)], cal);
    expect(dropped).toEqual(["2018-05-02"]);
    kept[1]!.prevDate = "2018-05-02"; // as toSessions sets it from the calendar
    expect(h3Plan(kept, 1)).toBeNull(); // would otherwise compare with 2018-05-01's close
    kept[1]!.prevDate = "2018-05-01";
    expect(h3Plan(kept, 1)!.dir).toBe(1);
  });
  it("toSessions sets the official previous session date", () => {
    const cal = new Map<string, readonly [number, number]>([["2024-12-02", [570, 960]], ["2024-12-03", [570, 960]]]);
    const b: MinuteBars = { symbol: "X", t: [Date.parse("2024-12-03T14:30:00Z")], o: [1], h: [1], l: [1], c: [1], v: [1], missingMinutes: NaN };
    expect(toSessions(b, cal)[0]!.prevDate).toBe("2024-12-02");
  });
});

describe("hypotheses on synthetic sessions", () => {
  // 20 previous sessions with a 1% range each: open 100, high 101, low 100
  const history = Array.from({ length: 20 }, (_, i) => sess(`2024-01-${String(i + 1).padStart(2, "0")}`, [[M(9, 30), 100, 101, 100, 100.5]]));

  it("median 20-day range", () => {
    const ss = Array.from({ length: 21 }, (_, i) => sess(`d${i}`, [[M(9, 30), 100, 100 + i + 1, 100, 100]]));
    expect(medianRange20(ss, 20)).toBeCloseTo((0.10 + 0.11) / 2, 12);
    expect(medianRange20(ss, 19)).toBeNaN();
  });

  const today = (dipLow: number, close949: number) => sess("2024-02-01", [
    [M(9, 30), 100, 100, dipLow, 99.9], [M(9, 49), 99.9, close949, 99.85, close949], [M(9, 50), 99.9, 100, 99.8, 99.95], [M(10, 29), 99.95, 100, 99.9, 100],
  ]);

  it("H1 signals on a 0.30% dip (>= 0.25 x 1%) with half of it recovered", () => {
    const p = h1Plan([...history, today(99.7, 99.9)], 20)!;
    expect(p.stop).toBeCloseTo(99.7, 12);
    expect(p.target).toBeCloseTo(99.9 + 2 * 0.2, 12);
  });
  it("H1: no signal when the dip is too small or not recovered", () => {
    expect(h1Plan([...history, today(99.8, 99.95)], 20)).toBeNull(); // 0.20% < 0.25%
    expect(h1Plan([...history, today(99.7, 99.84)], 20)).toBeNull(); // 99.84 < 99.7 + 0.15
  });

  it("H2 goes with the first 5-minute candle, stop at its other end, target 10R; none on a doji", () => {
    const up = sess("2024-02-01", [[M(9, 30), 100, 100.4, 99.9, 100.2], [M(9, 34), 100.2, 100.5, 100.1, 100.3], [M(9, 35), 100.3, 100.4, 100.2, 100.3]]);
    const p = h2Plan([up], 0)!;
    expect([p.dir, p.stop]).toEqual([1, 99.9]);
    expect(p.target).toBeCloseTo(100.3 + 10 * 0.4, 12);
    const doji = sess("2024-02-01", [[M(9, 30), 100, 100.4, 99.9, 100.2], [M(9, 34), 100.2, 100.5, 99.8, 100], [M(9, 35), 100, 100, 100, 100]]);
    expect(h2Plan([doji], 0)).toBeNull();
  });

  it("H3 follows the first half hour (from the previous close); skips short days and split-like gaps", () => {
    const prev = sess("2024-02-01", [[M(15, 59), 100, 100, 100, 100]]);
    const day = (open: number, at959: number, has1530 = true) =>
      sess("2024-02-02", [[M(9, 30), open, open, open, open], [M(9, 59), at959, at959, at959, at959], ...(has1530 ? [[M(15, 30), 101, 101, 101, 101] as [number, number, number, number, number]] : [])]);
    expect(h3Plan([prev, day(100, 100.5)], 1)!.dir).toBe(1);
    expect(h3Plan([prev, day(100, 99.5)], 1)!.dir).toBe(-1);
    expect(h3Plan([prev, day(100, 100.5, false)], 1)).toBeNull();
    expect(h3Plan([prev, day(130, 130)], 1)).toBeNull();
    // gap up to 101 then down to 100.5 by 09:59: +0.5% from the previous close (long), although -0.5% from today's open
    expect(h3Plan([prev, day(101, 100.5)], 1)!.dir).toBe(1);
  });

  it("random baselines are reproducible and use the same days (H2)", () => {
    const days = Array.from({ length: 30 }, (_, i) => sess(`2024-03-${String(i + 1).padStart(2, "0")}`, [[M(9, 30), 100, 100.4, 99.9, 100.2], [M(9, 34), 100.2, 100.5, 100.1, 100.3], [M(9, 35), 100.3, 100.4, 100.2, 100.3], [M(15, 59), 100.3, 100.4, 100.2, 100.35]]));
    const real = realTrades("H2", days, "2024-03-01", "2024-03-31", 0);
    const a = randomTrades("H2", days, "2024-03-01", "2024-03-31", 0, real, 7), b = randomTrades("H2", days, "2024-03-01", "2024-03-31", 0, real, 7);
    expect(real.length).toBe(30);
    expect(a.map((t) => t.dir)).toEqual(b.map((t) => t.dir));
    expect(new Set(a.map((t) => t.dir)).size).toBe(2);
  });
});
