import { describe, expect, it } from "vitest";
import type { Session } from "../src/intraday/sessions.js";
import { demandZones, dayLong, mirrorSessions, pickZone, prepare, silvioTrades, trendUp } from "../src/social/silvio.js";

type Bar = [number, number, number, number]; // o, h, l, c
/** A session from bars of `len` minutes each: the first minute carries (o, h, l, c), the rest sit at c. */
function sess(date: string, bars: Bar[], len: number): Session {
  const minute: number[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
  bars.forEach(([O, H, L, C], k) => {
    for (let j = 0; j < len; j++) {
      const m = 570 + k * len + j;
      if (m >= 960) break;
      minute.push(m);
      if (j === 0) { o.push(O); h.push(H); l.push(L); c.push(C); } else { o.push(C); h.push(C); l.push(C); c.push(C); }
    }
  });
  return { symbol: "T", date, minute, o, h, l, c };
}
const flatDay = (d: number, p: number) => sess(`2026-01-${String(d + 1).padStart(2, "0")}`, Array.from({ length: 7 }, (): Bar => [p, p, p, p]), 60);
/** Day 28: A (114->116), B (116, wicks 115-117, close 116.1), C (116.1->118.5), then 120. Zone = [115, 117]. */
const day28 = (touchLow = 120) => sess("2026-01-29", [[114, 116, 114, 116], [116, 117, 115, 116.1], [116.1, 118.5, 116.1, 118.5], [118.5, 120, 118.5, 120], [120, 120, touchLow, 120], [120, 120, 120, 120], [120, 120, 120, 120]], 60);
const fill = (p: number, n: number): Bar[] => Array.from({ length: n }, (): Bar => [p, p, p, p]);
/** Day 29 (5-minute bars): falls into the zone (tap at k3), pivot high 118.3 at k5, close 118.6 above it at k8 -> entry at k9 open 118.65. */
function day29(tail: Bar[]): Session {
  const head: Bar[] = [[119.5, 119.6, 118.8, 118.9], [118.9, 119.0, 118.0, 118.1], [118.1, 118.2, 117.5, 117.6], [117.6, 117.7, 116.8, 117.0],
    [117.0, 117.4, 116.6, 117.2], [117.2, 118.3, 117.1, 117.9], [117.9, 118.0, 117.3, 117.4], [117.4, 117.8, 117.2, 117.6], [117.6, 118.7, 117.5, 118.6]];
  const bars = [...head, ...tail];
  return sess("2026-01-30", [...bars, ...fill(bars.at(-1)![3], 78 - bars.length)], 5);
}
const up: Bar[] = [[118.65, 119.5, 118.6, 119.4], [119.4, 121, 119.3, 120.9], [120.9, 123.0, 120.8, 122.9]];
const days = (d28: Session, d29: Session) => [...Array.from({ length: 28 }, (_, d) => flatDay(d, 100 + 0.5 * d)), d28, d29];
const O = { rr: 2, cost: 0.0045, trend: true };

describe("silvio supply/demand model", () => {
  it("finds the zone [115, 117] and an up trend on day 29", () => {
    const P = prepare(days(day28(), day29(up))), z = demandZones(P);
    expect(z.length).toBe(1);
    expect([z[0]!.lo, z[0]!.hi]).toEqual([115, 117]);
    expect(trendUp(P, 29)).toBe(true);
    expect(pickZone(P, z, 29)).toEqual(z[0]);
  });
  it("long: tap, break of structure, entry at the next open, stop below the low since the tap, target 2R", () => {
    const t = silvioTrades(days(day28(), day29(up)), O);
    expect(t.length).toBe(1);
    const x = t[0]!;
    expect([x.dir, x.entryIdx, x.entry]).toEqual([1, 9, 118.65]);
    expect(x.stop).toBeCloseTo(116.59, 10);
    expect(x.target).toBeCloseTo(118.65 + 2 * 2.06, 10);
    expect(x.exitIdx).toBe(11);
    expect(x.r).toBeCloseTo((2 * 2.06 - 0.009) / 2.06, 10);
  });
  it("target 1R is hit one bar earlier", () => {
    const x = silvioTrades(days(day28(), day29(up)), { ...O, rr: 1 })[0]!;
    expect(x.exitIdx).toBe(10);
    expect(x.r).toBeCloseTo((2.06 - 0.009) / 2.06, 10);
  });
  it("stop: -1R minus costs", () => {
    const x = silvioTrades(days(day28(), day29([[118.65, 118.7, 116.0, 116.2]])), O)[0]!;
    expect(x.exit).toBeCloseTo(116.59, 10);
    expect(x.r).toBeCloseTo((116.59 - 118.65 - 0.009) / 2.06, 10);
  });
  it("no trade: closed through the zone, zone already touched, opened below the zone", () => {
    const P = prepare(days(day28(), day29(up))), z = pickZone(P, demandZones(P), 29)!;
    const through = day29(up); const c = [...through.c]; // k4 closes below 115 (its first minute and the rest)
    for (let j = 20; j < 25; j++) c[j] = 114.9;
    expect(dayLong(prepare(days(day28(), { ...through, c })), 29, z, 2, 0)).toBeNull();
    expect(silvioTrades(days(day28(116.9), day29(up)), O).length).toBe(0);
    const low = day29(up); const o = [...low.o]; o[0] = 114;
    expect(dayLong(prepare(days(day28(), { ...low, o })), 29, z, 2, 0)).toBeNull();
  });
  it("formation rules: B body too big, or C red -> no demand zone", () => {
    const bigBody = sess("2026-01-29", [[114, 116, 114, 116], [116, 117, 115, 116.8], [116.1, 118.5, 116.1, 118.5], ...fill(120, 4)], 60);
    expect(demandZones(prepare(days(bigBody, day29(up)))).length).toBe(0);
    const redC = sess("2026-01-29", [[114, 116, 114, 116], [116, 117, 115, 116.1], [116.1, 116.1, 113.6, 113.7], ...fill(113.7, 4)], 60);
    expect(demandZones(prepare(days(redC, day29(up)))).filter((z) => z.s === 28).length).toBe(0);
  });
  it("no entry at or after 15:00", () => {
    const head: Bar[] = [[119.5, 119.6, 118.8, 118.9], [118.9, 119.0, 118.0, 118.1], [118.1, 118.2, 117.5, 117.6], [117.6, 117.7, 116.8, 117.0],
      [117.0, 117.4, 116.6, 117.2], [117.2, 118.3, 117.1, 117.9], ...fill(117.5, 64), [117.6, 118.7, 117.5, 118.6]]; // BOS at k70 -> entry k71 (15:25)
    const late = sess("2026-01-30", [...head, ...fill(118.6, 78 - head.length)], 5);
    expect(silvioTrades(days(day28(), late), O).length).toBe(0);
  });
  it("trend needs the close above SMA20 and SMA20 rising over 5 sessions", () => {
    const mk = (smaOld: number) => ({ close: Array(30).fill(105), sma20: Object.assign(Array(30).fill(100), { 23: smaOld }) }) as unknown as Parameters<typeof trendUp>[0];
    expect(trendUp(mk(99), 29)).toBe(true);
    expect(trendUp(mk(101), 29)).toBe(false);
  });
  it("the stop counts the tap bar's own low", () => {
    const d = day29(up); const l = [...d.l]; l[15] = 116.5; // k3 first minute: low 116.5 (below k4's 116.6)
    const x = silvioTrades(days(day28(), { ...d, l }), O)[0]!;
    expect(x.stop).toBeCloseTo(116.49, 10);
  });
  it("mirror image is the same trade as a short", () => {
    const L = silvioTrades(days(day28(), day29(up)), O)[0]!;
    const S = silvioTrades(mirrorSessions(days(day28(), day29(up))), O)[0]!;
    expect(S.dir).toBe(-1);
    expect(S.entryIdx).toBe(L.entryIdx);
    expect(S.r).toBeCloseTo(L.r, 10);
  });
  it("random direction: the flipped short has its stop 2.06 above the entry and is stopped out", () => {
    const x = silvioTrades(days(day28(), day29(up)), { ...O, flip: () => true })[0]!;
    expect(x.dir).toBe(-1);
    expect(x.stop).toBeCloseTo(118.65 + 2.06, 10);
    expect(x.r).toBeCloseTo(-1 - 0.009 / 2.06, 10);
  });
});
