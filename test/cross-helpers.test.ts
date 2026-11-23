import { describe, expect, it } from "vitest";
import type { Session } from "../src/intraday/sessions.js";
import { segments, splitDays } from "../src/intraday/splits.js";
import { rangeTrade } from "../src/social/rangebot.js";
import { COST_PER_SHARE as C } from "../src/daytrade/dt.js";
import { bootstrapByDay, bootstrapTotal } from "../src/pm/common.js";

const sess = (date: string, bars: [number, number, number, number][]): Session => ({ symbol: "T", date, minute: bars.map((_, i) => 570 + i), o: bars.map((b) => b[0]), h: bars.map((b) => b[1]), l: bars.map((b) => b[2]), c: bars.map((b) => b[3]) });
describe("split days and segments", () => {
  const ss = ["a", "b", "c", "d"].map((d, i) => sess(d, [[1, 1, 1, i >= 2 ? 25 : 100]]));
  it("finds the 4:1 split and cuts the history there", () => {
    const daily = { date: ["a", "b", "c", "d"], c: [25, 25, 25, 25] };
    const sp = splitDays(ss, daily);
    expect([...sp]).toEqual(["c"]);
    expect(segments(ss, new Set(["c"])).map((x) => x.map((s) => s.date))).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("a normal 10% day is not a split", () => {
    const a = [sess("a", [[1, 1, 1, 100]]), sess("b", [[1, 1, 1, 110]])];
    expect(splitDays(a, { date: ["a", "b"], c: [50, 55] }).size).toBe(0);
  });
});
describe("range bot (moved to src)", () => {
  const base: [number, number, number, number][] = Array.from({ length: 30 }, (_, i) => [100.5, i === 3 ? 101 : 100.6, i === 7 ? 100 : 100.4, 100.5]);
  const fill = (p: number, n: number) => Array.from({ length: n }, (): [number, number, number, number] => [p, p, p, p]);
  it("win, loss and time exit", () => {
    expect(rangeTrade(sess("w", [...base, [100.9, 101.02, 100.9, 101], [101, 101, 100.74, 100.8], ...fill(100.8, 380)]), 0.25, 0.75)!.r).toBeCloseTo((0.25 - 2 * C) / 0.75, 12);
    expect(rangeTrade(sess("l", [...base, [100.9, 101.02, 100.9, 101], [101, 101.8, 101, 101.7], ...fill(101.7, 380)]), 0.25, 0.75)!.r).toBeCloseTo((-0.75 - 2 * C) / 0.75, 12);
    expect(rangeTrade(sess("t", [...base, [100.9, 101.02, 100.9, 101], ...fill(100.9, 390)]), 0.25, 0.75)!.r).toBeCloseTo((0.1 - 2 * C) / 0.75, 12);
  });
});

it("bootstrapTotal follows the sign of the per-trade mean, bootstrapByDay the mean of day means", () => {
  // a +1R day alone, then a day with four -0.5R trades -> mean of day means +0.25, per-trade mean -0.2
  const tr: { day: string; r: number }[] = [];
  const d = (k: number) => `d${String(k).padStart(4, "0")}`;
  for (let i = 0; i < 200; i++) {
    tr.push({ day: d(2 * i), r: 1 });
    for (let j = 0; j < 4; j++) tr.push({ day: d(2 * i + 1), r: -0.5 });
  }
  expect(bootstrapByDay(tr)).toBeGreaterThan(0.95);
  expect(bootstrapTotal(tr)).toBeLessThan(0.05);
});
