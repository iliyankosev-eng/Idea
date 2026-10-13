import { describe, expect, it } from "vitest";
import type { Pt } from "../src/pm/common.js";
import { botForecast, median, runDayMax, runFor, runReplica, type Run, type RunIndex } from "../src/pm/replica.js";
import type { WEvent } from "../src/pm/weather.js";

const H = 3_600_000;
/** a run starting at `init` with hourly UTC times for 72 h; temperature = base + peak at 13:00 UTC */
const mkRun = (init: number, base: number, peak: number): Run => {
  const time: string[] = [], temp: number[] = [];
  for (let k = 0; k < 72; k++) { const t = new Date(init + k * H); time.push(t.toISOString().slice(0, 16)); temp.push(t.getUTCHours() === 13 ? peak : base); }
  return { time, temp };
};

describe("N3 replica helpers (hand-calculated)", () => {
  it("run selection: latest 00/06/12/18 UTC start at least the delay before T", () => {
    const T = Date.UTC(2026, 8, 18, 6); // 08:00 Munich
    expect(new Date(runFor(T, 3)).toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(new Date(runFor(T, 8)).toISOString()).toBe("2026-09-17T18:00:00.000Z");
    expect(new Date(runFor(Date.UTC(2026, 8, 18, 12), 6)).toISOString()).toBe("2026-09-18T06:00:00.000Z");
  });
  it("median of 2 and 3 models", () => { expect(median([21, 23])).toBe(22); expect(median([22.3, 20.9, 22.1])).toBe(22.1); });
  it("day maximum uses the LOCAL day only", () => {
    const r = mkRun(Date.UTC(2026, 8, 17, 18), 15, 25); // peaks at 13:00 UTC on 18.09 and 19.09
    expect(runDayMax(r, "2026-09-18", "Europe/Berlin")).toBe(25);
    expect(runDayMax({ time: r.time.slice(0, 10), temp: r.temp.slice(0, 10) }, "2026-09-18", "Europe/Berlin")).toBeNull(); // < 20 hours
  });
  it("local day in Tokyo includes 15:00-23:00 UTC of the previous UTC date", () => {
    const init = Date.UTC(2026, 8, 17, 0);
    const r: Run = { time: Array.from({ length: 72 }, (_, k) => new Date(init + k * H).toISOString().slice(0, 16)), temp: Array.from({ length: 72 }, (_, k) => (k === 16 ? 30 : 15)) }; // 30 at 17.09 16:00 UTC = 18.09 01:00 Tokyo
    expect(runDayMax(r, "2026-09-18", "Asia/Tokyo")).toBe(30);
    expect(runDayMax(r, "2026-09-17", "Asia/Tokyo")).toBeNull(); // the run starts at 09:00 Tokyo: only 15 hours of 17.09
  });
  it("needs at least 2 models", () => {
    const one: RunIndex = new Map([["EDDM|icon_eu", new Map([[Date.UTC(2026, 8, 18, 0), mkRun(Date.UTC(2026, 8, 18, 0), 15, 21)]])]]);
    expect(botForecast(one, "EDDM", "2026-09-18", 8)).toBeNull();
  });
  it("bot forecast = median of the runs available at 08:00 (never a later run)", () => {
    const idx: RunIndex = new Map([
      ["EDDM|icon_d2", new Map([[Date.UTC(2026, 8, 18, 0), mkRun(Date.UTC(2026, 8, 18, 0), 15, 20.9)], [Date.UTC(2026, 8, 18, 6), mkRun(Date.UTC(2026, 8, 18, 6), 15, 30)]])],
      ["EDDM|icon_eu", new Map([[Date.UTC(2026, 8, 18, 0), mkRun(Date.UTC(2026, 8, 18, 0), 15, 21.0)]])],
      ["EDDM|ecmwf_ifs025", new Map([[Date.UTC(2026, 8, 17, 18), mkRun(Date.UTC(2026, 8, 17, 18), 15, 21.4)]])],
    ]);
    expect(botForecast(idx, "EDDM", "2026-09-18", 8)).toEqual({ value: 21.0, models: 3 }); // the 06Z icon_d2 run (30) is not yet available
  });
});

describe("N3 rule end to end", () => {
  const init = (h: number) => Date.UTC(2026, 8, 18, h);
  const idx: RunIndex = new Map([
    ["EDDM|icon_d2", new Map([[init(0), mkRun(init(0), 15, 20.6)]])],
    ["EDDM|icon_eu", new Map([[init(0), mkRun(init(0), 15, 21.2)]])],
    ["EDDM|ecmwf_ifs025", new Map([[Date.UTC(2026, 8, 17, 18), mkRun(Date.UTC(2026, 8, 17, 18), 15, 20.4)]])],
  ]); // median 20.6 -> rounded 21
  const labels = ["19°C or below", "20°C", "21°C", "22°C", "23°C or higher"];
  const ev = (winner: string): WEvent => ({ id: "m", title: "Highest temperature in Munich on September 18?", endDate: "2026-09-18T12:00:00Z", desc: "https://www.wunderground.com/history/daily/de/munich/EDDM",
    markets: labels.map((l) => ({ label: l, outcomes: ["Yes", "No"], final: l === winner ? ["1", "0"] : ["0", "1"] })) });
  const T = Date.UTC(2026, 8, 18, 6) / 1000;
  const px = (p21: number) => new Map([["m", Object.fromEntries(labels.map((l) => [l, [[T - 300, l === "21°C" ? p21 : 0.1]] as Pt[]]))]]);
  it("buys the 21°C bucket at <= 0.72 and holds", () => {
    const r = runReplica([ev("21°C")], idx, px(0.6), 8, 0.01, 0.72, 2);
    expect(r.trades.map((t) => [t.label, t.p, t.win])).toEqual([["21°C", 0.6, true]]);
    expect(r.trades[0]!.r).toBeCloseTo(1 / 0.61 - 1, 12);
    expect(runReplica([ev("22°C")], idx, px(0.6), 8, 0.01, 0.72, 1).trades[0]!.r).toBe(-1);
    expect(runReplica([ev("21°C")], idx, px(0.75), 8, 0.01, 0.72, 1).trades).toHaveLength(0);
  });
});
