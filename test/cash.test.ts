import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withFredCash } from "../src/data/cash.js";
import { DataError, type Series } from "../src/types.js";

const dir = mkdtempSync(join(tmpdir(), "cash-"));
const fred = (rows: string) => { const p = join(dir, `${Math.random()}.csv`); writeFileSync(p, `observation_date,DTB3\n${rows}`); return p; };
const series = (dates: string[]): Series => ({ name: "x", dates, price: dates.map(() => 1), ret: dates.map(() => 0), cash: dates.map(() => 0), periodsPerYear: 252 });

describe("withFredCash (hand-calculated)", () => {
  it("uses the rate known on the previous trading day and counts calendar days (weekend earns interest)", () => {
    const s = withFredCash(series(["2024-01-05", "2024-01-08", "2024-01-09"]), fred("2024-01-04,5.00\n2024-01-05,.\n2024-01-08,4.00\n2024-01-09,9.99\n"), "DTB3");
    expect(s.cash[0]).toBe(0);
    expect(s.cash[1]).toBeCloseTo(0.05 * 3 / 365, 15); // Fri -> Mon: rate of Thu (Fri missing), 3 days
    expect(s.cash[2]).toBeCloseTo(0.04 * 1 / 365, 15); // Mon -> Tue: Monday's rate, not Tuesday's (no look-ahead)
  });
  it("refuses a series that starts before the rate data", () => {
    expect(() => withFredCash(series(["2024-01-02", "2024-01-03"]), fred("2024-01-04,5\n"), "DTB3")).toThrow(DataError);
  });
  it("refuses a rate older than 10 days", () => {
    expect(() => withFredCash(series(["2024-02-01", "2024-02-02"]), fred("2024-01-04,5\n"), "DTB3")).toThrow(DataError);
  });
});
