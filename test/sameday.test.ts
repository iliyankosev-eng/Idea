import { describe, expect, it } from "vitest";
import type { Pt } from "../src/pm/common.js";
import { bucketProb, buildFc1, nowcast, obsNear, runSameDay } from "../src/pm/sameday.js";
import { localToUtc, parseBucket, type WEvent } from "../src/pm/weather.js";

const TZ = "Europe/Paris";
const days = Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10));
const F = (c: number) => c * 1.8 + 32;
/** two models, 18°C every hour except 20°C at 15:00 -> daily max 20 */
const fc = buildFc1(TZ, [{
  time: days.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`)),
  temperature_2m_previous_day1_ecmwf_ifs025: days.flatMap(() => Array.from({ length: 24 }, (_, h) => (h === 15 ? 20 : 18))),
  temperature_2m_previous_day1_icon_seamless: days.flatMap(() => Array.from({ length: 24 }, (_, h) => (h === 15 ? 20 : 18))),
}]);
/** observations 19°C at 07, 08, 09 local every day (1° above the models) */
const obs: Pt[] = days.flatMap((d) => [7, 8, 9].map((h) => [localToUtc(d, 0, h, TZ), F(19)] as Pt));
const labels = ["17°C or below", "18°C", "19°C", "20°C", "21°C", "22°C", "23°C or higher"];
const ev = (i: number, winner: string): WEvent => ({
  id: `e${i}`, title: `Highest temperature in Paris on September ${i + 1}?`, endDate: `${days[i]}T12:00:00Z`, desc: "https://www.wunderground.com/history/daily/fr/paris/LFPB",
  markets: labels.map((l) => ({ label: l, outcomes: ["Yes", "No"], final: l === winner ? ["1", "0"] : ["0", "1"] })),
});

describe("same-day helpers (hand-calculated)", () => {
  it("local time to UTC", () => {
    expect(localToUtc("2026-09-10", 0, 10, TZ)).toBe(Date.UTC(2026, 8, 10, 8) / 1000);
    expect(localToUtc("2026-01-10", 0, 10, "America/Chicago")).toBe(Date.UTC(2026, 0, 10, 16) / 1000);
  });
  it("nearest observation within 30 minutes", () => {
    const o: Pt[] = [[1000, 50], [2800, 52], [5000, 54]];
    expect([obsNear(o, 2000), obsNear(o, 2900), obsNear(o, 9000)]).toEqual([52, 52, null]);
  });
  it("forecast max and today's offset", () => {
    expect(fc.dailyMax.get("2026-09-10")).toBe(20);
    const T = localToUtc("2026-09-10", 0, 10, TZ), d0 = localToUtc("2026-09-10", 0, 0, TZ);
    const n = nowcast(20, fc, obs, d0, T, "C")!;
    expect(n.offset).toBeCloseTo(1, 9);
    expect(n.maxSoFar).toBeCloseTo(19, 9);
    expect(n.c).toBeCloseTo(21, 9);
    expect(nowcast(20, fc, obs, d0, localToUtc("2026-09-10", 0, 8, TZ), "C")).toBeNull(); // only 1 matched hour before 08:00
  });
  it("observations after T are ignored; a warm night raises the center to the maximum so far", () => {
    const T = localToUtc("2026-09-10", 0, 10, TZ), d0 = localToUtc("2026-09-10", 0, 0, TZ);
    const later: Pt[] = [...obs, [localToUtc("2026-09-10", 0, 14, TZ), F(25)] as Pt].sort((a, b) => a[0] - b[0]);
    expect(nowcast(20, fc, later, d0, T, "C")!.maxSoFar).toBeCloseTo(19, 9);
    const night: Pt[] = [...obs, [localToUtc("2026-09-10", 0, 3, TZ), F(22)] as Pt].sort((a, b) => a[0] - b[0]);
    const n = nowcast(20, fc, night, d0, T, "C")!;
    expect([n.offset, n.maxSoFar, n.c].map((x) => Math.round(x * 1e9) / 1e9)).toEqual([1, 22, 22]);
  });
  it("bucket probability, truncated at the maximum so far", () => {
    expect(bucketProb(parseBucket("21°C")!, 21.5, 1, 17.5)).toBeCloseTo(0.341345, 5);
    expect(bucketProb(parseBucket("21°C")!, 21.5, 1, 22)).toBe(0);
    expect(bucketProb(parseBucket("22°C")!, 21.5, 1, 22)).toBeCloseTo(0.682689, 5);
    expect(bucketProb(parseBucket("23°C or higher")!, 21.5, 1, 17.5)).toBeCloseTo(1 - 0.841345, 5); // lower edge 22.5 = c + 1 sigma
  });
});

describe("N1 and N2 end to end", () => {
  const prior = Array.from({ length: 12 }, (_, i) => ev(i, "21°C"));
  const T12 = localToUtc(days[12]!, 0, 10, TZ);
  const prices = (p: Record<string, number>) => new Map([["e12", Object.fromEntries(labels.map((l) => [l, [[T12 - 600, p[l] ?? 0.01]] as Pt[]]))]]);
  const ctx = (p: Record<string, number>) => ({ fc: new Map([["LFPB|C", fc]]), obs: new Map([["LFPB", obs]]), prices: prices(p) });
  it("N1: forecast 20 + bias 1 -> 21°C bucket, bought only at <= 0.72", () => {
    const r = runSameDay([...prior, ev(12, "21°C")], ctx({ "21°C": 0.5 }), { rule: "N1", hour: 10, cost: 0.01, threshold: 0.1, bothSides: false }, 2);
    expect(r.trades.map((t) => [t.label, t.p])).toEqual([["21°C", 0.5]]);
    expect(r.trades[0]!.r).toBeCloseTo(1 / 0.51 - 1, 12);
    expect(runSameDay([...prior, ev(12, "21°C")], ctx({ "21°C": 0.8 }), { rule: "N1", hour: 10, cost: 0.01, threshold: 0.1, bothSides: false }, 1).trades).toHaveLength(0);
  });
  it("N2: center 21, sigma floor 0.5 -> q(21) = 0.6827, YES beats the best NO", () => {
    const p = { "21°C": 0.4, "22°C": 0.3, "20°C": 0.2 };
    for (const bothSides of [false, true]) {
      const r = runSameDay([...prior, ev(12, "21°C")], ctx(p), { rule: "N2", hour: 10, cost: 0.01, threshold: 0.1, bothSides }, 2);
      expect(r.trades.map((t) => [t.label, t.side])).toEqual([["21°C", "YES"]]);
      expect(r.trades[0]!.q).toBeCloseTo(0.682689, 5);
      expect(r.trades[0]!.r).toBeCloseTo(1 / 0.41 - 1, 12);
    }
  });
  it("N2 'both sides' can buy NO when a bucket is overpriced", () => {
    const r = runSameDay([...prior, ev(12, "21°C")], ctx({ "21°C": 0.7, "23°C or higher": 0.6 }), { rule: "N2", hour: 10, cost: 0.01, threshold: 0.1, bothSides: true }, 1);
    // q(23+) = 1 - phi(3) = 0.00135 -> NO edge 0.5987 > YES edge on 21 (0.6827 - 0.7 < 0)
    expect(r.trades.map((t) => [t.label, t.side])).toEqual([["23°C or higher", "NO"]]);
    expect(r.trades[0]!.r).toBeCloseTo(1 / 0.41 - 1, 12); // NO at 1 - 0.6 + 0.01
  });
  it("without 'both sides' only YES is bought", () => {
    const r = runSameDay([...prior, ev(12, "21°C")], ctx({ "21°C": 0.7, "23°C or higher": 0.6 }), { rule: "N2", hour: 10, cost: 0.01, threshold: 0.1, bothSides: false }, 1);
    // eligible (price 0.02-0.95): only 21 (0.70) and 23+ (0.60); YES edges 0.6827 - 0.7 < 0 and 0.00135 - 0.6 < 0 -> no trade
    expect(r.trades).toEqual([]);
  });
});
