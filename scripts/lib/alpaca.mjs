// Pure functions for Alpaca stock bars. No network here, so they can be unit-tested.
// Alpaca returns bars with t = ISO time (UTC) of the bar's start, including pre- and after-market.
// We keep only the regular session, 09:30-15:59 New York time (bar start), with daylight saving handled by Intl.

const MIN_MS = 60_000;
const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** New York wall-clock parts of a UTC time in ms: { date: "YYYY-MM-DD", minute: minutes since midnight }. */
export function nyParts(ms) {
  const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

export const OPEN_MIN = 9 * 60 + 30; // 09:30
export const CLOSE_MIN = 16 * 60; // 16:00 (the last regular bar starts at 15:59)

/**
 * Keep regular-session bars of one month (New York dates) and check them.
 * Throws on: unsorted or duplicate times, times off the minute grid, non-positive prices,
 * high/low not containing open/close, negative volume.
 * Returns { csv: "t,o,h,l,c,v\n...", rows, days, droppedOutside }.
 */
export function normalizeAlpacaBars(bars, month) {
  const out = ["t,o,h,l,c,v"];
  let prev = -Infinity, rows = 0, droppedOutside = 0;
  const days = new Set();
  for (const b of bars) {
    const t = Date.parse(b.t);
    if (!Number.isFinite(t)) throw new Error(`${month}: bad time "${b.t}"`);
    if (t % MIN_MS !== 0) throw new Error(`${month}: time ${b.t} is not on a whole minute`);
    if (t <= prev) throw new Error(`${month}: time not increasing at ${b.t}`);
    prev = t;
    const { date, minute } = nyParts(t);
    // Outside the regular session, or (overnight sessions) dated in another New York month: not kept.
    if (date.slice(0, 7) !== month || minute < OPEN_MIN || minute >= CLOSE_MIN) { droppedOutside++; continue; }
    const { o, h, l, c, v } = b;
    if (!(o > 0 && h > 0 && l > 0 && c > 0)) throw new Error(`${month}: non-positive price at ${b.t}`);
    if (l > Math.min(o, c) || h < Math.max(o, c)) throw new Error(`${month}: high/low do not contain open/close at ${b.t}`);
    if (!(v >= 0)) throw new Error(`${month}: negative volume at ${b.t}`);
    out.push(`${t},${o},${h},${l},${c},${v}`);
    days.add(date);
    rows++;
  }
  return { csv: out.join("\n") + "\n", rows, days: days.size, droppedOutside };
}

/** UTC request bounds for a New York month: the 1st 06:00 UTC (01:00/02:00 New York, no regular trading) to the next 1st 06:00 UTC. */
export function monthBoundsUtc(month) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1, 6)).toISOString(), end: new Date(Date.UTC(y, m, 1, 6)).toISOString() };
}
