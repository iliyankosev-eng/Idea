import { describe, expect, it } from "vitest";
import { ASIA_MAIN, asiaTrade, asiaWithDirection, type AsiaDay } from "../src/ict/asiaOrb.js";

type B = [number, number, number, number, number]; // o h l c v
// range 18:00-18:14: H 101, L 99 (R 2, middle 100), volume 10 per bar
const range: B[] = Array.from({ length: 15 }, (_, i) => (i === 3 ? [100, 101, 99.5, 100.2, 10] : i === 9 ? [100, 100.4, 99, 99.8, 10] : [100, 100.5, 99.5, 100, 10]));
const after = (patch: Record<number, B> = {}, n = 160): B[] => {
  const out: B[] = [...range];
  for (let i = 15; i < n; i++) out.push(patch[i] ?? [102, 102.2, 101.9, 102, 10]);
  out[15] = patch[15] ?? [100.2, 100.6, 100.1, 100.5, 10];
  out[16] = patch[16] ?? [100.5, 101.4, 100.4, 101.3, 20]; // break: close 101.3 > 101, volume 20 >= 1.5 x 10
  out[17] = patch[17] ?? [101.3, 102.1, 101.8, 102, 12]; // above the retest zone (101.5)
  out[18] = patch[18] ?? [102, 102.05, 101.4, 101.6, 9]; // retest: low 101.4 <= 101.5, close 101.6 > 101
  out[19] = patch[19] ?? [101.7, 101.9, 101.6, 101.8, 8]; // entry at the open 101.7, risk 1.7
  return out;
};
const day = (bars: B[]): AsiaDay => ({ date: "2024-01-02", m: bars.map((_, i) => i), o: bars.map((b) => b[0]), h: bars.map((b) => b[1]), l: bars.map((b) => b[2]), c: bars.map((b) => b[3]), v: bars.map((b) => b[4]) });
const close = (x: number, y: number) => expect(x).toBeCloseTo(y, 9);

describe("Asia ORB (hand-calculated)", () => {
  it("long: break with volume, retest, entry 101.7, stop 100, time exit after 120 minutes at 102 -> 0.3 / 1.7 R", () => {
    const t = asiaTrade(day(after()))!;
    expect([t.dir, t.breakIdx, t.retestIdx, t.entryIdx, t.exitIdx]).toEqual([1, 16, 18, 19, 138]); // last bar with m < 19 + 120
    close(t.entry, 101.7); close(t.stop, 100); close(t.r, 0.3 / 1.7);
  });
  it("stop at the middle, and a gap through the stop exits at the open", () => {
    close(asiaTrade(day(after({ 25: [101.9, 102, 99.9, 100.5, 10] })))!.r, -1);
    close(asiaTrade(day(after({ 25: [99.5, 99.8, 99.4, 99.6, 10] })))!.r, (99.5 - 101.7) / 1.7);
  });
  it("no volume, close back inside the range, or entry after the deadline -> no trade", () => {
    expect(asiaTrade(day(after({ 16: [100.5, 101.4, 100.4, 101.3, 14] })))).toBeNull(); // 14 < 15
    expect(asiaTrade(day(after({ 16: [100.5, 101.4, 100.4, 101.3, 15] })))!.breakIdx).toBe(16); // exactly 1.5 x average counts
    expect(asiaTrade(day(after({ 18: [102, 102.05, 100.8, 100.9, 9] })))).toBeNull();
    expect(asiaTrade(day(after()), { ...ASIA_MAIN, lastEntry: 19 })).toBeNull();
    expect(asiaTrade(day(after()), { ...ASIA_MAIN, volMult: 0 })!.entryIdx).toBe(19);
  });
  it("short = mirror image; random-direction helper", () => {
    const mir = after().map(([o, h, l, c, v]) => [200 - o, 200 - l, 200 - h, 200 - c, v] as B);
    const t = asiaTrade(day(mir))!;
    expect(t.dir).toBe(-1); close(t.entry, 98.3); close(t.stop, 100); close(t.r, 0.3 / 1.7);
    const d = day(after()), tl = asiaTrade(d)!;
    close(asiaWithDirection(d, tl, 1), tl.r);
    close(asiaWithDirection(d, tl, -1), -0.3 / 1.7); // short from 101.7, stop 103.4 never hit, time exit at 102
  });
});
