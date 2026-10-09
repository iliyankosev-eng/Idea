import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDailyCsv } from "../src/data/daily.js";
import { DataError } from "../src/types.js";

const dir = mkdtempSync(join(tmpdir(), "daily-"));
const file = (n: string, t: string) => { const p = join(dir, n); writeFileSync(p, t); return p; };

describe("loadDailyCsv", () => {
  it("skips holidays (empty values) and spans weekends", () => {
    const s = loadDailyCsv(file("a.csv", "Date,Price\n2020-01-03,100\n2020-01-06,\n2020-01-07,110\n"), "x");
    expect(s.dates).toEqual(["2020-01-03", "2020-01-07"]);
    expect(s.ret[1]).toBeCloseTo(0.1, 12);
  });
  it("refuses a gap longer than 7 days", () => {
    expect(() => loadDailyCsv(file("b.csv", "Date,Price\n2020-01-01,100\n2020-01-15,100\n"), "x")).toThrow(DataError);
  });
  it("refuses non-positive prices (WTI 2020-04-20 case)", () => {
    expect(() => loadDailyCsv(file("c.csv", "Date,Price\n2020-04-17,18.31\n2020-04-20,-36.98\n"), "x")).toThrow(DataError);
  });
  it("FX: filters the country and inverts the quote", () => {
    const p = file("d.csv", "Date,Country,Exchange rate\n2020-01-02,Euro,0.8\n2020-01-02,Japan,100\n2020-01-03,Euro,0.5\n");
    const s = loadDailyCsv(p, "EUR", { priceCol: "Exchange rate", filter: { key: "Country", value: "Euro" }, invert: true });
    expect(s.price).toEqual([1.25, 2]);
  });
});
