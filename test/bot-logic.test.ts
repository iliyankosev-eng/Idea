import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { halted, orbPlan, rsiDecision, stopTouched } from "../src/bot/logic.js";
import { loadMinuteBars } from "../src/data/intraday.js";
import { dt3, dt3Late } from "../src/daytrade/dt.js";
import { dt8 } from "../src/daytrade/dt78.js";
import { completeSessions, loadCalendar, toSessions } from "../src/intraday/sessions.js";

describe("bot logic (hand-calculated)", () => {
  const b = (o: number, h: number, l: number, c: number) => ({ o, h, l, c });
  it("ORB plan: bullish first 5 minutes -> buy, stop at the low, target 10R, size min(1% risk, 4x)", () => {
    const f = [b(100, 100.8, 99.6, 100.2), b(100.2, 100.5, 99.9, 100.1), b(100.1, 100.4, 100, 100.3), b(100.3, 100.6, 100.1, 100.4), b(100.4, 100.6, 100.2, 100.5)];
    expect(orbPlan(f, 100.6, 50_000)).toEqual({ side: "buy", qty: 500, stop: 99.6, target: 110.6 }); // 1% of 50k / risk 1.0 = 500 < 4x = 1988
    expect(orbPlan(f.map((x, i) => (i === 4 ? { ...x, c: 100 } : x)), 100.6, 50_000)).toBeNull(); // doji
  });
  it("RSI(2) decision and drawdown guard", () => {
    const up = Array.from({ length: 200 }, (_, i) => 100 + i * 0.1);
    expect(rsiDecision([...up, 118], false)).toBe("buy");
    expect(rsiDecision([...up, 118, 116], true)).toBe("hold");
    expect(rsiDecision([...up, 118, 116, 125], true)).toBe("sell");
    expect(rsiDecision(up.slice(0, 150), false)).toBe("none");
    expect([halted(79, 100), halted(81, 100)]).toEqual([true, false]);
  });
  it("stop already touched before the delayed entry", () => {
    const later = [b(100.5, 100.7, 100.3, 100.4), b(100.4, 100.5, 99.6, 100.0)];
    expect(stopTouched(later, "buy", 99.6)).toBe(true); // low 99.6 <= stop 99.6
    expect(stopTouched(later, "buy", 99.5)).toBe(false);
    expect(stopTouched(later, "sell", 100.7)).toBe(true);
    expect(stopTouched(later, "sell", 100.71)).toBe(false);
  });
});

const D = "data/branch";
describe.skipIf(!existsSync(`${D}/daily/alpaca/calendar.csv`))("bot = backtest on real history", () => {
  it("ORB: trade / no-trade identical to DT3 on every QQQ day of 2026-01..2026-09", () => {
    const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
    const ss = completeSessions(toSessions(loadMinuteBars(D, "QQQ", "2026-01", "2026-09", "alpaca"), cal), cal).kept;
    const bt = dt3(ss, 0);
    let same = 0, n = 0;
    ss.forEach((s, i) => {
      if (s.minute[0] !== 570 || s.minute[4] !== 574 || s.minute[5] !== 575) return;
      const f5 = [0, 1, 2, 3, 4].map((k) => ({ o: s.o[k]!, h: s.h[k]!, l: s.l[k]!, c: s.c[k]! }));
      const p = orbPlan(f5, s.o[5]!, 100_000);
      n++;
      if ((p === null && bt[i]!.trades === 0) || (p !== null && bt[i]!.trades === 1)) same++;
    });
    expect(n).toBeGreaterThan(150);
    expect(same).toBe(n);
  });
  it("RSI(2): the same entry and exit days as DT8 on SPY 2016-2026", () => {
    const rows = readFileSync(`${D}/daily/alpaca/SPY.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r[0]! <= "2026-09-30");
    const date = rows.map((r) => r[0]!), c = rows.map((r) => Number(r[4]));
    const bt = dt8({ date, c }, 0); // bt[k] is the return of day k + 1
    let pos = false, mism = 0, trades = 0;
    for (let i = 1; i + 1 < c.length; i++) {
      const d = rsiDecision(c.slice(0, i + 1), pos);
      if (d === "buy") { pos = true; trades++; }
      if (d === "sell") pos = false;
      if ((bt[i]!.r !== 0) !== pos) mism++; // held during day i + 1 in the backtest <=> in position after day i in the bot
    }
    expect(trades).toBeGreaterThan(50);
    expect(mism).toBe(0);
  });
  it("delayed ORB: dt3Late(e=5) is exactly dt3, and the bot rule matches dt3Late(e=20) on every QQQ day of 2025-2026", () => {
    const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
    const ss = completeSessions(toSessions(loadMinuteBars(D, "QQQ", "2025-01", "2026-09", "alpaca"), cal), cal).kept;
    expect(dt3Late(ss, 0.0045, 5)).toEqual(dt3(ss, 0.0045));
    const bt = dt3Late(ss, 0, 20);
    let same = 0, n = 0, trades = 0;
    ss.forEach((s, i) => {
      if (s.minute[0] !== 570 || s.minute[4] !== 574) return;
      const i0 = s.minute.indexOf(590);
      if (i0 < 5) return;
      const bar = (k: number) => ({ o: s.o[k]!, h: s.h[k]!, l: s.l[k]!, c: s.c[k]! });
      const p = orbPlan([0, 1, 2, 3, 4].map(bar), s.o[i0]!, 100_000);
      const go = p !== null && !stopTouched(Array.from({ length: i0 - 5 }, (_, k) => bar(5 + k)), p.side, p.stop);
      n++; if (go) trades++;
      if (go === (bt[i]!.trades === 1)) same++;
    });
    expect(n).toBeGreaterThan(350);
    expect(trades).toBeGreaterThan(150);
    expect(same).toBe(n);
  });
});
