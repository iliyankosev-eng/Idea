import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bondPrice, loadBondFromYields, loadFx, monthlyFromPrices, nextMonth } from "../src/data/macro.js";
import { DataError } from "../src/types.js";

const dir = mkdtempSync(join(tmpdir(), "macro-"));
const file = (n: string, t: string) => { const p = join(dir, n); writeFileSync(p, t); return p; };

describe("monthly helpers", () => {
  it("nextMonth rolls over the year", () => {
    expect(nextMonth("2020-12")).toBe("2021-01");
    expect(nextMonth("2020-01")).toBe("2020-02");
  });
  it("refuses a missing month", () => {
    expect(() => monthlyFromPrices("x", [{ month: "2020-01", price: 1 }, { month: "2020-03", price: 1 }])).toThrow(DataError);
  });
});

describe("bond pricing (hand-calculated)", () => {
  it("a bond priced at its own coupon rate is worth par", () => {
    expect(bondPrice(0.06, 0.06, 10)).toBeCloseTo(1, 12);
  });
  it("2-year 6% semi-annual bond at 5%: sum of discounted cash flows", () => {
    const manual = 0.03 / 1.025 + 0.03 / 1.025 ** 2 + 0.03 / 1.025 ** 3 + 1.03 / 1.025 ** 4;
    expect(bondPrice(0.06, 0.05, 2)).toBeCloseTo(manual, 12);
  });
  it("monthly return = repriced bond - 1 + one month of coupon", () => {
    const p = file("y.csv", "Date,Rate\n2000-01-01,6.00\n2000-02-01,5.00\n");
    const s = loadBondFromYields(p, "b");
    expect(s.ret[1]).toBeCloseTo(bondPrice(0.06, 0.05, 10 - 1 / 12) - 1 + 0.06 / 12, 12);
    expect(s.ret[1]).toBeGreaterThan(0.075); // yields fell 1 pt -> roughly +7.8% price gain
    expect(s.ret[1]).toBeLessThan(0.09);
  });
});

describe("FX direction", () => {
  it("USD value of the foreign currency is 1/rate (foreign units per USD)", () => {
    const p = file("fx.csv", "Date,Country,Exchange rate\n1971-01-01,United Kingdom,0.5\n1971-02-01,United Kingdom,0.4\n");
    const s = loadFx(p, "United Kingdom");
    expect(s.price[0]).toBeCloseTo(2, 12);
    expect(s.ret[1]).toBeCloseTo(2.5 / 2 - 1, 12); // pound got stronger: 0.4 GBP per USD
  });
});

// Calibration of the approximate bond series against Damodaran's published 10-year T-bond returns.
const haveBonds = existsSync("data/us10y.csv");
describe.skipIf(!haveBonds)("bond approximation vs Damodaran (NYU) annual T-bond returns", () => {
  const published: Record<string, number> = { "1982": 32.81, "1994": -8.04, "1999": -8.25, "2008": 20.1, "2009": -11.12, "2013": -9.1, "2022": -17.83, "2023": 3.88 };
  it("matches the sign every year and stays within 6 percentage points", () => {
    const s = loadBondFromYields("data/us10y.csv");
    for (const [year, pub] of Object.entries(published)) {
      let g = 1;
      s.dates.forEach((d, i) => { if (d.startsWith(year)) g *= 1 + s.ret[i]!; });
      const ours = (g - 1) * 100;
      expect(Math.sign(ours)).toBe(Math.sign(pub));
      expect(Math.abs(ours - pub)).toBeLessThan(6);
    }
  });
  it("1974-2023 average is close to Damodaran's 6.12% a year", () => {
    const s = loadBondFromYields("data/us10y.csv");
    let g = 1, n = 0;
    s.dates.forEach((d, i) => { if (d >= "1974-01" && d <= "2023-12") { g *= 1 + s.ret[i]!; n++; } });
    expect(Math.abs((g ** (12 / n) - 1) * 100 - 6.12)).toBeLessThan(0.75);
  });
});
