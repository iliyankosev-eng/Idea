import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCoinMetrics } from "../src/data/coinmetrics.js";
import { parseCsv } from "../src/data/csv.js";
import { loadShiller } from "../src/data/shiller.js";
import { DataError } from "../src/types.js";

const dir = mkdtempSync(join(tmpdir(), "lab-"));
const file = (name: string, text: string) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};

describe("parseCsv", () => {
  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('a,b\n"x,y","say ""hi"""\n')).toEqual([{ a: "x,y", b: 'say "hi"' }]);
  });
  it("rejects rows with the wrong number of fields", () => {
    expect(() => parseCsv("a,b\n1,2,3\n")).toThrow();
  });
});

describe("loadShiller", () => {
  const head = "Date,SP500,Dividend,Earnings,Consumer Price Index,Long Interest Rate,Real Price,Real Dividend,Real Earnings,PE10\n";
  it("computes total return with dividends and cash from the previous month's yield", () => {
    const s = loadShiller(file("ok.csv", head + "2000-01-01,100,12,0,0,6,0,0,0,0\n2000-02-01,110,24,0,0,3,0,0,0,0\n"));
    expect(s.ret[1]).toBeCloseTo(110 / 100 - 1 + 24 / 12 / 100, 12); // 10% + 2%
    expect(s.cash[1]).toBeCloseTo(6 / 100 / 12, 12); // previous month's 6% yield
  });
  it("refuses months without dividends instead of silently using price-only returns", () => {
    const p = file("nodiv.csv", head + "2000-01-01,100,12,0,0,6,0,0,0,0\n2000-02-01,110,0,0,0,3,0,0,0,0\n");
    expect(() => loadShiller(p)).toThrow(DataError);
  });
});

describe("loadCoinMetrics", () => {
  it("refuses a gap in daily data", () => {
    const p = file("gap.csv", "time,PriceUSD\n2020-01-01,100\n2020-01-02,101\n2020-01-04,99\n");
    expect(() => loadCoinMetrics(p, "X")).toThrow(DataError);
  });
  it("drops rows without a price and computes daily returns", () => {
    const s = loadCoinMetrics(file("ok.csv", "time,PriceUSD\n2020-01-01,100\n2020-01-02,110\n2020-01-03,\n"), "X");
    expect(s.dates).toEqual(["2020-01-01", "2020-01-02"]);
    expect(s.ret[1]).toBeCloseTo(0.1, 12);
  });
});
