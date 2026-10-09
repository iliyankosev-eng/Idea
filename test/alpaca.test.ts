import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without type declarations
import { monthBoundsUtc, normalizeAlpacaBars, nyParts } from "../scripts/lib/alpaca.mjs";

const bar = (t: string, o = 100, h = 101, l = 99, c = 100.5, v = 10) => ({ t, o, h, l, c, v });

describe("New York time (daylight saving)", () => {
  it("09:30 New York is 14:30 UTC in winter and 13:30 UTC in summer", () => {
    expect(nyParts(Date.parse("2024-03-08T14:30:00Z"))).toEqual({ date: "2024-03-08", minute: 570 }); // Fri, EST
    expect(nyParts(Date.parse("2024-03-11T13:30:00Z"))).toEqual({ date: "2024-03-11", minute: 570 }); // Mon, EDT (DST began Sun 10.03)
    expect(nyParts(Date.parse("2024-11-04T14:30:00Z"))).toEqual({ date: "2024-11-04", minute: 570 }); // Mon, EST again (ended Sun 03.11)
    expect(nyParts(Date.parse("2024-04-01T02:00:00Z"))).toEqual({ date: "2024-03-31", minute: 22 * 60 }); // late evening of the previous NY day
  });
  it("request bounds for a month", () => {
    expect(monthBoundsUtc("2024-03")).toEqual({ start: "2024-03-01T06:00:00.000Z", end: "2024-04-01T06:00:00.000Z" });
    expect(monthBoundsUtc("2024-12")).toEqual({ start: "2024-12-01T06:00:00.000Z", end: "2025-01-01T06:00:00.000Z" });
  });
});

describe("normalizeAlpacaBars", () => {
  it("keeps only 09:30-15:59 New York, in both winter and summer", () => {
    const r = normalizeAlpacaBars([
      bar("2024-03-08T14:29:00Z"), // 09:29 EST: pre-market, dropped
      bar("2024-03-08T14:30:00Z"), // 09:30 EST: kept
      bar("2024-03-08T20:59:00Z"), // 15:59 EST: kept
      bar("2024-03-08T21:00:00Z"), // 16:00 EST: after-market, dropped
      bar("2024-03-11T13:30:00Z"), // 09:30 EDT: kept
      bar("2024-03-11T20:00:00Z"), // 16:00 EDT: dropped
    ], "2024-03");
    expect(r.rows).toBe(3);
    expect(r.days).toBe(2);
    expect(r.droppedOutside).toBe(3);
    expect(r.csv).toBe(`t,o,h,l,c,v\n${Date.parse("2024-03-08T14:30:00Z")},100,101,99,100.5,10\n${Date.parse("2024-03-08T20:59:00Z")},100,101,99,100.5,10\n${Date.parse("2024-03-11T13:30:00Z")},100,101,99,100.5,10\n`);
  });
  it("drops bars dated in another New York month", () => {
    expect(normalizeAlpacaBars([bar("2024-04-01T02:00:00Z")], "2024-04").rows).toBe(0);
  });
  it.each([
    ["a duplicate time", [bar("2024-03-08T14:30:00Z"), bar("2024-03-08T14:30:00Z")]],
    ["time going backwards", [bar("2024-03-08T14:31:00Z"), bar("2024-03-08T14:30:00Z")]],
    ["a time off the minute grid", [bar("2024-03-08T14:30:30Z")]],
    ["high below close", [bar("2024-03-08T14:30:00Z", 100, 100, 99, 100.5)]],
    ["a zero price", [bar("2024-03-08T14:30:00Z", 0, 101, 0, 100)]],
  ])("refuses %s", (_label, bars) => {
    expect(() => normalizeAlpacaBars(bars, "2024-03")).toThrow();
  });
});
