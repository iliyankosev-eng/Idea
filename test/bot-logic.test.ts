import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bilTarget, halted, nbLeverage, nbOrders, noiseBand, orbPlan, rsiDecision, stopTouched } from "../src/bot/logic.js";
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

describe("DT8 leftover after a partial fill", () => {
  it("sells what is left only when the last DT8 order was a sell", async () => {
    const { dt8Leftover } = await import("../src/bot/logic.js");
    expect(dt8Leftover("dt8-sell-2026-10-20", 39)).toBe(39);
    expect(dt8Leftover("dt8-buy-2026-10-14", 65)).toBe(0);
    expect(dt8Leftover("dt8-sell-2026-10-20", 0)).toBe(0);
    expect(dt8Leftover(undefined, 10)).toBe(0);
  });
});

describe("fillAction (DT8 follow-up)", () => {
  it("done, wait, resend, give up", async () => {
    const { fillAction } = await import("../src/bot/logic.js");
    expect(fillAction({ status: "filled", qty: 66, filled: 66 }, 200, 0)).toEqual({ act: "done" });
    expect(fillAction({ status: "partially_filled", qty: 66, filled: 26 }, 200, 0)).toEqual({ act: "wait" });
    expect(fillAction({ status: "new", qty: 66, filled: 0 }, 200, 0)).toEqual({ act: "wait" });
    expect(fillAction({ status: "expired", qty: 66, filled: 0 }, 200, 0)).toEqual({ act: "resend", qty: 66 });
    expect(fillAction({ status: "canceled", qty: 65, filled: 26 }, 200, 1)).toEqual({ act: "resend", qty: 39 });
    expect(fillAction({ status: "canceled", qty: 65, filled: 26 }, 200, 3)).toEqual({ act: "give-up", missing: 39 });
    expect(fillAction({ status: "partially_filled", qty: 65, filled: 26 }, 44, 0)).toEqual({ act: "give-up", missing: 39 });
    expect(fillAction({ status: "expired", qty: 66, filled: 0 }, 45, 0)).toEqual({ act: "resend", qty: 66 });
    expect(fillAction({ status: "canceled", qty: 10, filled: 10 }, 10, 5)).toEqual({ act: "done" });
  });
});

describe("bot v2 logic", () => {
  it("orbPlan: the leverage cap binds on a tight stop", () => {
    const f = [0, 1, 2, 3, 4].map((i) => ({ o: 100 + 0.01 * i, h: 100.2, l: 99.9, c: 100.05 + 0.01 * i }));
    expect(orbPlan(f, 100, 25_000, 4)!.qty).toBe(1000); // 1% risk would be 2500 shares; 4x cap = 1000
    expect(orbPlan(f, 100, 25_000, 2)!.qty).toBe(500);
  });
  it("noiseBand: bands from max/min(open, prev close) and the average past move; VWAP is the trailing stop", () => {
    const pm = Array(14).fill(0.01);
    const base = { open: 100, prevClose: 102, pastMoves: pm, vwap: 101 };
    expect(noiseBand({ ...base, price: 103.03 })).toEqual({ want: 1, ub: 103.02, lb: 99 });
    expect(noiseBand({ ...base, price: 103.02 })!.want).toBe(0); // must be strictly above
    expect(noiseBand({ ...base, price: 98.99 })!.want).toBe(-1);
    expect(noiseBand({ ...base, price: 103.5, vwap: 104 })!.want).toBe(0); // above the band but below VWAP
    expect(noiseBand({ ...base, price: 98.5, vwap: 98 })!.want).toBe(0);
    expect(noiseBand({ ...base, pastMoves: Array(9).fill(0.01), price: 110 })).toBeNull();
    expect(noiseBand({ ...base, pastMoves: [...Array(7).fill(0.01), ...Array(7).fill(0.03)], price: 104.03 })!.want).toBe(0); // sigma 2% -> ub 104.04
  });
  it("nbLeverage: 2% / 14-day vol, capped", () => {
    const alt = (step: number) => Array.from({ length: 15 }, (_, i) => 100 * (1 + (i % 2 ? step : 0)));
    expect(nbLeverage(alt(0.0001))).toBe(2);
    const c = alt(0.03), r = c.slice(1).map((x, i) => x / c[i]! - 1), m = r.reduce((a, b) => a + b, 0) / 14, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / 13);
    expect(nbLeverage(c)).toBeCloseTo(0.02 / sd, 12);
    expect(nbLeverage(c)).toBeLessThan(1);
    expect(nbLeverage(c.slice(1))).toBe(0);
    expect(nbLeverage(alt(0.0001), 4)).toBe(4);
  });
  it("nbOrders: nothing when the side is right, close then open on a flip", () => {
    expect(nbOrders(0, 0, 50)).toEqual([]);
    expect(nbOrders(40, 1, 50)).toEqual([]);
    expect(nbOrders(0, 1, 50)).toEqual([50]);
    expect(nbOrders(0, -1, 50)).toEqual([-50]);
    expect(nbOrders(40, 0, 50)).toEqual([-40]);
    expect(nbOrders(40, -1, 50)).toEqual([-40, -50]);
    expect(nbOrders(-40, 1, 50)).toEqual([40, 50]);
    expect(nbOrders(-40, 1, 0)).toEqual([40]);
  });
  it("bilTarget: half of equity when DT8 is out, zero when in, no small adjustments", () => {
    expect(bilTarget(false, 100_000, 91.5, 0)).toEqual({ target: 546, delta: 546 });
    expect(bilTarget(false, 100_000, 91.5, 540)).toEqual({ target: 546, delta: 0 }); // 6 shares = $549 < 2%
    expect(bilTarget(false, 100_000, 91.5, 500)).toEqual({ target: 546, delta: 46 }); // $4,209 > 2%
    expect(bilTarget(true, 100_000, 91.5, 546)).toEqual({ target: 0, delta: -546 });
    expect(bilTarget(true, 100_000, 91.5, 3)).toEqual({ target: 0, delta: -3 });
  });
});
