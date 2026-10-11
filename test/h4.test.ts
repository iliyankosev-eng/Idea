import { describe, expect, it } from "vitest";
import { h4Signal } from "../src/intraday/h4.js";
import type { Session } from "../src/intraday/sessions.js";
import { simulateTrade } from "../src/intraday/sim.js";

const M = (h: number, m: number) => h * 60 + m;
/** 15 opening-range bars 09:30-09:44: range 100..102, then the given later bars [minute, o, h, l, c]. */
function day(later: [number, number, number, number, number][]): Session {
  const rows: [number, number, number, number, number][] = Array.from({ length: 15 }, (_, i) => [M(9, 30) + i, 101, i === 3 ? 102 : 101.5, i === 7 ? 100 : 100.5, 101]);
  const all = [...rows, ...later];
  return { symbol: "SPY", date: "2026-08-10", minute: all.map((r) => r[0]), o: all.map((r) => r[1]), h: all.map((r) => r[2]), l: all.map((r) => r[3]), c: all.map((r) => r[4]) };
}
const pm = { pmh: 103, pml: 99.8 };

describe("H4 opening range reversal (hand-calculated)", () => {
  // ORH 102, ORL 100, PML 99.8 -> long sweep level 99.8
  const longDay = day([
    [M(9, 50), 100.2, 100.3, 99.7, 99.75], // sweep below 99.8
    [M(9, 51), 99.75, 99.9, 99.6, 99.8], //   lower low 99.6
    [M(9, 52), 99.8, 100.2, 99.7, 100.1], //  close back above ORL 100 -> reclaim
    [M(9, 53), 100.15, 100.4, 100.0, 100.3], // entry at THIS open 100.15 (not the 100.1 reclaim close)
    [M(10, 30), 100.3, 102.2, 100.2, 102.0], // target ORH 102 hit
  ]);

  it("long: sweep of ORL and PML, reclaim, entry next open, stop below the sweep low, target ORH", () => {
    const s = h4Signal(longDay, pm, true)!;
    expect(s.side).toBe("long");
    expect([s.sweepMinute, s.entryMinute, s.entry]).toEqual([M(9, 50), M(9, 53), 100.15]);
    expect(s.plan.stop).toBeCloseTo(99.59, 12);
    expect(s.plan.target).toBe(102);
    expect(s.risk).toBeCloseTo(0.56, 12);
    const t = simulateTrade(longDay, s.plan, 0)!;
    expect([t.exit, t.reason]).toEqual([102, "target"]);
    expect(t.r).toBeCloseTo(1.85 / 0.56, 12);
  });

  it("no trade when the pre-market low was not taken out (main rule), but the ORL-only variant trades", () => {
    const pmLower = { pmh: 103, pml: 99.5 }; // sweep low 99.6 stays above PML
    expect(h4Signal(longDay, pmLower, true)).toBeNull();
    expect(h4Signal(longDay, pmLower, false)!.side).toBe("long");
    expect(h4Signal(longDay, undefined, true)).toBeNull(); // no pre-market data -> skip the day
  });

  it("no trade when the target is closer than 2 x risk", () => {
    const near = day([[M(9, 50), 100.2, 100.3, 99.0, 99.2], [M(9, 51), 99.2, 100.5, 99.1, 100.4], [M(9, 52), 100.4, 100.5, 100.3, 100.4]]);
    // stop 98.99, entry 100.4, risk 1.41, target 102 is 1.6 away < 2.82
    expect(h4Signal(near, pm, true)).toBeNull();
  });

  it("short: sweep above ORH and PMH, close back below ORH", () => {
    // PMH 102.5 -> short level max(102, 102.5) = 102.5; sweep high 102.75; entry 101.9; risk 0.86; target ORL 100 is 1.9 >= 1.72
    const sd = day([[M(10, 0), 102.2, 102.7, 102.1, 102.6], [M(10, 1), 102.6, 102.75, 101.8, 101.9], [M(10, 2), 101.9, 102.0, 101.5, 101.6]]);
    const s = h4Signal(sd, { pmh: 102.5, pml: 99.8 }, true)!;
    expect(s.side).toBe("short");
    expect(s.plan.stop).toBeCloseTo(102.76, 12);
    expect(s.entry).toBe(101.9);
    expect(s.plan.target).toBe(100);
    expect(s.plan.dir).toBe(-1);
  });

  it("no trade: sweep after 11:29, reclaim later than 60 minutes, both sides in one bar", () => {
    expect(h4Signal(day([[M(11, 30), 100.2, 100.3, 99.5, 99.6], [M(11, 31), 99.6, 100.5, 99.6, 100.4], [M(11, 32), 100.4, 100.5, 100.3, 100.4]]), pm, true)).toBeNull();
    // reclaim 61 minutes after the sweep (would otherwise be a valid 2R+ trade: stop 99.69, entry 100.05, target 102)
    expect(h4Signal(day([[M(9, 50), 100.2, 100.3, 99.7, 99.75], [M(10, 51), 99.75, 100.1, 99.75, 100.05], [M(10, 52), 100.05, 100.1, 100.0, 100.05]]), pm, true)).toBeNull();
    expect(h4Signal(day([[M(9, 50), 101, 103.5, 99.5, 101], [M(9, 51), 101, 101.2, 100.8, 101.1]]), pm, true)).toBeNull();
  });
});
