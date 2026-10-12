import { describe, expect, it } from "vitest";
import { bootstrapByDay, phi, priceAt, verdict, type Pt } from "../src/pm/common.js";
import { clusterReturn, findClusters, findSpikes, holdReturn, type TradeRow } from "../src/pm/flow.js";
import { dailyForecastMax, decisionTime, eventDay, icaoOf, parseBucket, runWeather, type WEvent } from "../src/pm/weather.js";

describe("Polymarket helpers", () => {
  it("parses temperature buckets", () => {
    expect(parseBucket("28-29°F")).toMatchObject({ lo: 28, hi: 29, unit: "F" });
    expect(parseBucket("15°C")).toMatchObject({ lo: 15, hi: 15, unit: "C" });
    expect(parseBucket("27°F or below")).toMatchObject({ lo: -Infinity, hi: 27 });
    expect(parseBucket("38°F or higher")).toMatchObject({ lo: 38, hi: Infinity });
    expect(parseBucket("-3°C or below")).toMatchObject({ lo: -Infinity, hi: -3, unit: "C" });
    expect(parseBucket("-2--1°F")).toMatchObject({ lo: -2, hi: -1 });
    expect(parseBucket("29-28°F")).toBeNull();
    expect(parseBucket("Other")).toBeNull();
  });
  it("event day must agree with the title", () => {
    expect(eventDay({ title: "Highest temperature in NYC on January 15?", endDate: "2026-01-15T12:00:00Z" })).toBe("2026-01-15");
    expect(eventDay({ title: "Highest temperature in NYC on January 16?", endDate: "2026-01-15T12:00:00Z" })).toBeNull();
  });
  it("finds the station in both description formats", () => {
    expect(icaoOf("from Wunderground https://www.wunderground.com/history/daily/us/ny/new-york-city/KLGA.")).toBe("KLGA");
    expect(icaoOf("https://www.weather.gov/wrh/timeseries?site=klga and")).toBe("KLGA");
    expect(icaoOf("https://www.wunderground.com/history/daily/gb/london/EGLC.")).toBe("EGLC");
    expect(icaoOf("Hong Kong Observatory")).toBeNull();
  });
  it("decision time = 12:00 local on the previous day (winter, summer, Tokyo)", () => {
    expect(decisionTime("2026-01-15", "America/New_York")).toBe(Date.UTC(2026, 0, 14, 17) / 1000);
    expect(decisionTime("2026-07-15", "America/New_York")).toBe(Date.UTC(2026, 6, 14, 16) / 1000);
    expect(decisionTime("2026-07-15", "Asia/Tokyo")).toBe(Date.UTC(2026, 6, 14, 3) / 1000);
    expect(decisionTime("2026-03-01", "Europe/London")).toBe(Date.UTC(2026, 1, 28, 12) / 1000);
  });
  it("normal CDF and price lookup", () => {
    expect(phi(0)).toBeCloseTo(0.5, 7);
    expect(phi(1.96)).toBeCloseTo(0.9750021, 6);
    expect(phi(-1)).toBeCloseTo(0.1586553, 6);
    const h: Pt[] = [[100, 0.2], [200, 0.3], [400, 0.5]];
    expect([priceAt(h, 99, 1e9), priceAt(h, 200, 0), priceAt(h, 399, 1e9), priceAt(h, 1000, 500), priceAt(h, 1000, 700)]).toEqual([null, 0.3, 0.3, null, 0.5]);
  });
  it("daily forecast max: mean of model maxima, models with < 20 hours dropped", () => {
    const time = Array.from({ length: 24 }, (_, i) => `2026-01-15T${String(i).padStart(2, "0")}:00`);
    const a = time.map((_, i) => 60 + i * 0.5); // max 71.5
    const b = time.map((_, i) => (i === 14 ? 74 : 62)); // max 74
    const c = time.map((_, i) => (i < 10 ? 90 : null)); // only 10 hours -> dropped
    const m = dailyForecastMax({ time, temperature_2m_previous_day2_ecmwf_ifs025: a, temperature_2m_previous_day2_gfs_seamless: b, temperature_2m_previous_day2_icon_seamless: c });
    expect(m.get("2026-01-15")).toBeCloseTo((71.5 + 74) / 2, 12);
    expect(dailyForecastMax({ time, temperature_2m_previous_day2_ecmwf_ifs025: a, temperature_2m_previous_day2_icon_seamless: c }).size).toBe(0);
  });
  it("verdict and bootstrap", () => {
    expect(verdict(0.1, 0.96, 96)).toMatch(/^GO/);
    expect(verdict(0.1, 0.96, 50)).toBe("слабо");
    expect(verdict(-0.1, 0.5, 10)).toBe("STOP");
    expect(bootstrapByDay([{ day: "a", r: 1 }, { day: "b", r: 2 }])).toBe(1);
    expect(bootstrapByDay([{ day: "a", r: -1 }, { day: "b", r: -2 }])).toBe(0);
  });
});

describe("W weather rule (hand-calculated)", () => {
  const labels = ["67°F or below", "68-69°F", "70-71°F", "72-73°F", "74°F or higher"];
  const desc = "https://www.wunderground.com/history/daily/us/ny/new-york-city/KLGA";
  const ev = (i: number, winner: string): WEvent => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    return { id: `e${i}`, title: `Highest temperature in NYC on ${month} ${d.getUTCDate()}?`, endDate: `${d.toISOString().slice(0, 10)}T12:00:00Z`, desc,
      markets: labels.map((l) => ({ label: l, outcomes: ["Yes", "No"], final: l === winner ? ["1", "0"] : ["0", "1"] })) };
  };
  const max = new Map<string, number>();
  for (let i = 0; i < 20; i++) max.set(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 70);
  const forecasts = new Map([["KLGA|F", { tz: "America/New_York", max }]]);
  // 12 earlier events always won by 70-71 (actual 70.5, forecast 70 -> error +0.5, sd 0 -> sigma floor 1.5)
  const events = Array.from({ length: 12 }, (_, i) => ev(i, "70-71°F"));
  const T = decisionTime("2026-01-13", "America/New_York"); // event 12 is on 2026-01-13
  const px = (p: Record<string, number>) => Object.fromEntries(labels.map((l) => [l, [[T - 600, p[l] ?? 0.01]] as Pt[]]));

  it("trades the bucket with the largest edge >= 0.10 and computes the return", () => {
    const e12 = ev(12, "70-71°F");
    const prices = new Map([["e12", px({ "68-69°F": 0.2, "70-71°F": 0.3, "72-73°F": 0.4 })]]);
    const r = runWeather([...events, e12], { forecasts, prices }, { threshold: 0.1, cost: 0.01 }, 3);
    // q(70-71) = phi(1/1.5) - phi(-1/1.5) = 0.49502; edge 0.195 > q(68-69) - 0.2 = 0.0297
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]!.label).toBe("70-71°F");
    expect(r.trades[0]!.q).toBeCloseTo(0.495015, 5);
    expect(r.trades[0]!.r).toBeCloseTo(1 / 0.31 - 1, 12);
    expect(r.favorite.map((t) => t.label)).toEqual(["72-73°F"]); // highest price 0.40, lost
    expect(r.favorite[0]!.r).toBeCloseTo(-1, 12);
    expect(r.counts["warm-up (fewer than 10 earlier events)"]).toBe(11); // events 0..10 have < 10 events at D-2 or earlier
    expect(r.counts["excluded: no price file"]).toBe(1); // event 11 (10 earlier events, no prices)
  });
  it("no trade when the edge is below the threshold; a losing trade returns -1", () => {
    const e12 = ev(12, "68-69°F");
    const flat = runWeather([...events, e12], { forecasts, prices: new Map([["e12", px({ "70-71°F": 0.45 })]]) }, { threshold: 0.1, cost: 0.01 }, 1);
    expect(flat.trades).toHaveLength(0); // edge 0.045
    const lose = runWeather([...events, e12], { forecasts, prices: new Map([["e12", px({ "70-71°F": 0.3 })]]) }, { threshold: 0.1, cost: 0.01 }, 1);
    expect(lose.trades[0]!.r).toBe(-1);
  });
  it("uses only events resolved by D-2 (an outcome known on D-1 must not move the forecast)", () => {
    // the event on D-1 (index 11) is a huge miss; if it leaked, the center would move and the chosen bucket would change
    const leak = [...events.slice(0, 11), ev(11, "74°F or higher"), ev(12, "70-71°F")];
    const r = runWeather(leak, { forecasts, prices: new Map([["e12", px({ "70-71°F": 0.3 })]]) }, { threshold: 0.1, cost: 0.01 }, 1);
    expect(r.trades[0]!.q).toBeCloseTo(0.495015, 5);
  });
});

describe("W uses the last 30 earlier events only", () => {
  it("old misses (events 0-9) fall out of the 30-event window", () => {
    const labels = ["67°F or below", "68-69°F", "70-71°F", "72-73°F", "74°F or higher"];
    const desc = "https://www.weather.gov/wrh/timeseries?site=klga";
    const ev = (i: number, winner: string): WEvent => {
      const d = new Date(Date.UTC(2026, 0, 1 + i));
      const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
      return { id: `e${i}`, title: `Highest temperature in NYC on ${month} ${d.getUTCDate()}?`, endDate: `${d.toISOString().slice(0, 10)}T12:00:00Z`, desc,
        markets: labels.map((l) => ({ label: l, outcomes: ["Yes", "No"], final: l === winner ? ["1", "0"] : ["0", "1"] })) };
    };
    const max = new Map<string, number>();
    for (let i = 0; i < 50; i++) max.set(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), 70);
    const events = Array.from({ length: 42 }, (_, i) => ev(i, i < 10 ? "74°F or higher" : "70-71°F"));
    const last = ev(42, "70-71°F");
    const T = decisionTime(last.endDate.slice(0, 10), "America/New_York");
    const prices = new Map([["e42", Object.fromEntries(labels.map((l) => [l, [[T - 60, l === "70-71°F" ? 0.3 : 0.05]] as Pt[]]))]]);
    const r = runWeather([...events, last], { forecasts: new Map([["KLGA|F", { tz: "America/New_York", max }]]), prices }, { threshold: 0.1, cost: 0.01 }, 1);
    expect(r.trades.at(-1)!.q).toBeCloseTo(0.495015, 5);
  });
});

describe("P pulse (hand-calculated)", () => {
  const h: Pt[] = [];
  for (let t = 0; t <= 3600; t += 600) h.push([t, 0.4]);
  h.push([4200, 0.45], [4800, 0.62], [5400, 0.7], [27000, 0.6], [30000, 0.95]);
  const close = 10 * 86400;
  it("detects the 0.40 -> 0.62 move in 60 minutes once per day", () => {
    expect(findSpikes(h, close)).toEqual([{ t: 4800, dir: 1, from: 0.4, to: 0.62 }]);
    expect(findSpikes(h, 4800 + 86400 - 1)).toEqual([]); // inside the last 24 h
  });
  it("entry at t + 10 min, exit after the hold, costs on both sides", () => {
    expect(holdReturn(h, close, 1, 4800, 1, 6 * 3600, 0.01)).toBeCloseTo((0.59 - 0.71) / 0.71, 12);
    expect(holdReturn(h, close, 1, 4800, -1, 6 * 3600, 0.01)).toBeCloseTo((0.39 - 0.31) / 0.31, 12);
    expect(holdReturn(h, close, 0, 4800, -1, Infinity, 0.01)).toBeCloseTo((1 - 0.31) / 0.31, 12); // held to resolution, NO won
  });
});

describe("K cluster (hand-calculated)", () => {
  const buys = (n: number, o: 0 | 1, t0: number, step: number, prefix: string): TradeRow[] =>
    Array.from({ length: n }, (_, i) => [t0 + i * step, `${prefix}${i}`, "B", o, 1000, 0.4] as TradeRow);
  const close = 30 * 86400;
  it("15 wallets x $400 within an hour -> signal at the 15th buy", () => {
    const rows = [...buys(15, 0, 1000, 60, "w"), [1100, "x", "B", 1, 10, 0.6] as TradeRow].sort((a, b) => a[0] - b[0]);
    expect(findClusters(rows, close)).toEqual([{ t: 1000 + 14 * 60, outcome: 0, wallets: 15, notional: 6000, price: 0.4 }]);
  });
  it("no signal when the other side has more than a third as many buyers, or the buys are spread over > 60 min", () => {
    const busy = [...buys(15, 0, 1000, 60, "w"), ...buys(6, 1, 1010, 60, "y")].sort((a, b) => a[0] - b[0]);
    expect(findClusters(busy, close)).toEqual([]);
    expect(findClusters(buys(15, 0, 1000, 300, "w"), close)).toEqual([]); // 15 buys over 70 minutes: at most 12 in any hour
  });
  it("entry at the first trade of that outcome >= 5 min later", () => {
    const rows: TradeRow[] = [[100, "a", "B", 0, 10, 0.4], [350, "b", "B", 0, 10, 0.45], [400, "c", "S", 1, 10, 0.5], [420, "d", "S", 0, 10, 0.5]];
    expect(clusterReturn(rows, 100, 0, 1, 0.01)).toBeCloseTo(1 / 0.51 - 1, 12);
    expect(clusterReturn(rows, 100, 0, 0, 0.01)).toBe(-1);
  });
});
