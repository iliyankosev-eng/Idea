import { describe, expect, it } from "vitest";
import { gold630, type GoldDay } from "../src/social/gold630.js";

const mk = (extra: [number, number, number, number, number][]): GoldDay => {
  const rows: [number, number, number, number, number][] = [];
  for (let m = 390; m < 405; m++) rows.push([m, 100.5, m === 395 ? 101 : 100.8, m === 400 ? 100 : 100.2, 100.5]); // range H 101, L 100
  rows.push(...extra);
  return { date: "2024-01-02", m: rows.map((r) => r[0]), o: rows.map((r) => r[1]), h: rows.map((r) => r[2]), l: rows.map((r) => r[3]), c: rows.map((r) => r[4]), v: rows.map(() => 1) };
};
describe("S3 gold 06:30 breakout (hand-calculated)", () => {
  it("close above 101 at 06:45 -> long at the 06:46 open 101.25, stop 100 (risk 1.25), exit at the 09:29 close 102", () => {
    const d = mk([[405, 100.9, 101.3, 100.9, 101.2], [406, 101.25, 101.5, 101.1, 101.4], [569, 101.9, 102.1, 101.8, 102], [570, 102, 102, 102, 102]]);
    expect(gold630([d], { fee: 0 })[0]!.r).toBeCloseTo(0.75 / 1.25, 12);
    expect(gold630([d], { fee: 0.0005 })[0]!.r).toBeCloseTo((0.75 - 0.0005 * (101.25 + 102)) / 1.25, 12);
  });
  it("stop hit -> -1R; no break before 08:00 -> no trade", () => {
    const d = mk([[405, 100.9, 101.3, 100.9, 101.2], [406, 101.25, 101.5, 101.1, 101.4], [450, 100.5, 100.6, 99.9, 100.2], [569, 101, 101, 101, 101]]);
    expect(gold630([d], { fee: 0 })[0]!.r).toBeCloseTo(-1, 12);
    const q = mk([[405, 100.5, 100.6, 100.4, 100.5], [485, 100.9, 101.3, 100.9, 101.2], [569, 101, 101, 101, 101]]);
    expect(gold630([q], { fee: 0 })[0]!.trades).toBe(0);
  });
});
