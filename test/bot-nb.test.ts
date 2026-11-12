import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nbLeverage, nbOrders, noiseBand } from "../src/bot/logic.js";
import { barAtOrAfter, barBefore, dt1, vwapBefore } from "../src/daytrade/dt.js";
import { loadMinuteBars } from "../src/data/intraday.js";
import { completeSessions, loadCalendar, toSessions } from "../src/intraday/sessions.js";

const D = "data/branch";
describe.skipIf(!existsSync(`${D}/daily/alpaca/calendar.csv`))("noise band: the bot's functions = the backtest on real history", () => {
  it("day by day identical to dt1 (2x cap, exit 15:55) on QQQ 2025-01..2026-09", () => {
    const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
    const ss = completeSessions(toSessions(loadMinuteBars(D, "QQQ", "2025-01", "2026-09", "alpaca"), cal), cal).kept;
    const cost = 0.0045, bt = dt1(ss, { dynamic: true, execNextOpen: true, cost, maxLev: 2, exitMin: 955 });
    let compared = 0, traded = 0;
    for (let d = 15; d < ss.length; d++) {
      const s = ss[d]!, past = ss.slice(d - 15, d);
      if (s.minute[0] !== 570 || (s.prevDate && s.prevDate !== ss[d - 1]!.date) || past.some((p) => p.minute[0] !== 570)) continue;
      const closes = past.map((p) => p.c[p.c.length - 1]!);
      const q = nbLeverage(closes, 2) / s.o[0]!; // shares per unit of capital
      let pos = 0, pnl = 0; // pos in units of q
      const last = s.minute[s.minute.length - 1]!;
      for (let m = 600; m <= 930 && m < last; m += 30) {
        const pastMoves = past.slice(1).flatMap((p) => { const i = p.minute.indexOf(m - 1); return i >= 0 ? [Math.abs(p.c[i]! / p.o[0]! - 1)] : []; });
        const nb = noiseBand({ open: s.o[0]!, prevClose: closes[14]!, pastMoves, price: s.c[barBefore(s, m)]!, vwap: vwapBefore(s, m) });
        if (!nb) continue;
        const exec = s.o[barAtOrAfter(s, m)]!;
        for (const o of nbOrders(pos, nb.want, 1)) { pnl -= o * exec * q + cost * q; pos += o; } // cash flow of each order
      }
      if (pos !== 0) { const j = s.minute.indexOf(955), px = j >= 0 ? s.o[j]! : s.c[s.c.length - 1]!; pnl += pos * px * q - cost * q; pos = 0; }
      const ref = bt.find((x) => x.day === s.date)!;
      expect(pnl).toBeCloseTo(ref.r, 9);
      compared++; if (ref.trades) traded++;
    }
    expect(compared).toBeGreaterThan(380);
    expect(traded).toBeGreaterThan(150);
  });
});
