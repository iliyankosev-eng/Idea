import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without type declarations
import { lastCompleteMonth, minutesInMonth, monthRange, normalizeKlines, toMs, trimDecimal } from "../scripts/lib/binance.mjs";

const JAN25 = Date.UTC(2025, 0, 1); // 1735689600000
const row = (tMs: number, o: string, h: string, l: string, c: string, v = "1.00000000", micro = false) =>
  `${micro ? tMs * 1000 : tMs},${o},${h},${l},${c},${v},${tMs + 59_999},0,1,0,0,0`;

describe("Binance helpers", () => {
  it("trims decimals exactly, without float rounding", () => {
    expect(trimDecimal("83321.94000000")).toBe("83321.94");
    expect(trimDecimal("100.00000000")).toBe("100");
    expect(trimDecimal("0.00100000")).toBe("0.001");
    expect(trimDecimal("5")).toBe("5");
    expect(() => trimDecimal("-1")).toThrow();
    expect(() => trimDecimal("1e5")).toThrow();
  });

  it("converts microseconds (spot files from 2025) and keeps milliseconds", () => {
    expect(toMs("1735689600000")).toBe(JAN25);
    expect(toMs("1735689600000000")).toBe(JAN25);
    expect(() => toMs("1735689600000000000")).toThrow(/nanoseconds/);
  });

  it("counts minutes per UTC month (leap year, no DST in UTC)", () => {
    expect(minutesInMonth("2024-02")).toBe(29 * 1440);
    expect(minutesInMonth("2025-02")).toBe(28 * 1440);
    expect(minutesInMonth("2026-10")).toBe(31 * 1440);
  });

  it("month ranges and the last finished month", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(lastCompleteMonth(new Date("2026-10-09T12:00:00Z"))).toBe("2026-09");
    expect(lastCompleteMonth(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12");
    expect(lastCompleteMonth(new Date("2026-03-01T00:00:00Z"))).toBe("2026-02");
  });
});

describe("normalizeKlines", () => {
  it("parses µs timestamps, skips a header, trims numbers, counts missing minutes", () => {
    const text = ["open_time,open,high,low,close,volume,close_time,q,n,tb,tq,ignore",
      row(JAN25, "100.10000000", "101.00000000", "99.50000000", "100.50000000", "2.50000000", true),
      row(JAN25 + 60_000, "100.50000000", "100.60000000", "100.00000000", "100.20000000", "1.00000000", true),
      row(JAN25 + 180_000, "100.20000000", "100.20000000", "100.20000000", "100.20000000", "0.00000000", true), // minute 3; minute 2 missing
    ].join("\r\n");
    const r = normalizeKlines(text, "2025-01");
    expect(r.rows).toBe(3);
    expect(r.missingMinutes).toBe(31 * 1440 - 3);
    expect(r.firstMs).toBe(JAN25);
    expect(r.lastMs).toBe(JAN25 + 180_000);
    expect(r.csv).toBe(`t,o,h,l,c,v\n${JAN25},100.1,101,99.5,100.5,2.5\n${JAN25 + 60_000},100.5,100.6,100,100.2,1\n${JAN25 + 180_000},100.2,100.2,100.2,100.2,0\n`);
  });

  const ok = row(JAN25, "100", "101", "99", "100");
  it.each([
    ["a duplicate minute", [ok, ok]],
    ["a minute from another month", [row(JAN25 - 60_000, "100", "101", "99", "100")]],
    ["a time off the minute grid", [row(JAN25 + 1_000, "100", "101", "99", "100")]],
    ["high below close", [row(JAN25, "100", "101", "99", "102")]],
    ["low above open", [row(JAN25, "98", "101", "99", "100")]],
    ["a zero price", [row(JAN25, "0", "101", "0", "100")]],
    ["an empty file", [] as string[]],
  ])("refuses %s", (_label, lines) => {
    expect(() => normalizeKlines(lines.join("\n"), "2025-01")).toThrow();
  });
});
