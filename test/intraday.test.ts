import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/data/csv.js";
import { dailyFromMinutes, loadMinuteBars } from "../src/data/intraday.js";
import { DataError } from "../src/types.js";

const SEP30_2359 = Date.UTC(2026, 8, 30, 23, 59);
const OCT1 = Date.UTC(2026, 9, 1);

function fixture(files: Record<string, string[]>): string {
  const root = mkdtempSync(join(tmpdir(), "intraday-"));
  for (const [month, rows] of Object.entries(files)) {
    const dir = join(root, "intraday", "binance", "TEST", "1m");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${month}.csv.gz`), gzipSync(["t,o,h,l,c,v", ...rows].join("\n") + "\n"));
  }
  return root;
}

describe("loadMinuteBars (hand-made files)", () => {
  const good = fixture({
    "2026-09": [`${SEP30_2359},100,102,99,101,1.5`],
    "2026-10": [`${OCT1},101,101,95,96,2`, `${OCT1 + 60_000},96,97,96,97,0.5`],
  });

  it("joins months in order and counts missing minutes", () => {
    const b = loadMinuteBars(good, "TEST", "2026-09", "2026-10");
    expect(b.t).toEqual([SEP30_2359, OCT1, OCT1 + 60_000]);
    expect(b.c).toEqual([101, 96, 97]);
    expect(b.missingMinutes).toBe((30 + 31) * 1440 - 3);
  });

  it("builds UTC daily bars: first open, last close, max high, min low, summed volume", () => {
    const d = dailyFromMinutes(loadMinuteBars(good, "TEST", "2026-09", "2026-10"));
    expect(d.date).toEqual(["2026-09-30", "2026-10-01"]);
    expect([d.o[1], d.h[1], d.l[1], d.c[1], d.v[1]]).toEqual([101, 101, 95, 97, 2.5]);
  });

  it("refuses a month file that is missing (a hole must not look like a quiet market)", () => {
    expect(() => loadMinuteBars(good, "TEST", "2026-08", "2026-10")).toThrow(DataError);
  });

  it.each([
    ["time going backwards across months", { "2026-09": [`${SEP30_2359},1,1,1,1,1`], "2026-10": [`${SEP30_2359},1,1,1,1,1`] }],
    ["a high below the close", { "2026-10": [`${OCT1},100,100,99,101,1`] }],
    ["an off-minute time", { "2026-10": [`${OCT1 + 5},100,100,100,100,1`] }],
    ["a non-number", { "2026-10": [`${OCT1},abc,100,100,100,1`] }],
  ])("refuses %s", (_label, files) => {
    const months = Object.keys(files);
    expect(() => loadMinuteBars(fixture(files), "TEST", months[0]!, months[months.length - 1]!)).toThrow(DataError);
  });
});

// Real data from the data branch (npm run data:sync). Skipped when it is not downloaded.
const BRANCH = "data/branch";
const haveBranch = existsSync(join(BRANCH, "intraday/binance/manifest.json"));

describe.skipIf(!haveBranch)("real Binance data (data branch)", () => {
  it("row counts match the manifest written by the pipeline", () => {
    const man = JSON.parse(readFileSync(join(BRANCH, "intraday/binance/manifest.json"), "utf8")) as Record<string, { rows: number }>;
    for (const m of ["2020-03", "2024-02", "2025-01"]) {
      const b = loadMinuteBars(BRANCH, "BTCUSDT", m, m);
      expect(b.t.length).toBe(man[`BTCUSDT/1m/${m}`]!.rows);
    }
  });

  it("daily closes agree with CoinMetrics (an independent source) to a 0.2% median in 2024", () => {
    const d = dailyFromMinutes(loadMinuteBars(BRANCH, "BTCUSDT", "2024-01", "2024-12"));
    const cm = new Map(parseCsv(readFileSync(join(BRANCH, "daily/coinmetrics/btc.csv"), "utf8")).map((r) => [r["time"]!, Number(r["PriceUSD"])]));
    const diffs = d.date.map((dt, i) => Math.abs(d.c[i]! / cm.get(dt)! - 1)).sort((a, b) => a - b);
    expect(diffs.length).toBe(366);
    expect(diffs[Math.floor(diffs.length / 2)]!).toBeLessThan(0.002);
    expect(diffs[diffs.length - 1]!).toBeLessThan(0.05);
  });
});
