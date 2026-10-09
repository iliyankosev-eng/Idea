// Pure functions for Binance public kline files (data.binance.vision). No network here, so they can be unit-tested.
// Spot files: no reliable header; 12 columns; open time in ms until 2024-12, in MICROseconds from 2025-01-01.

const MIN_MS = 60_000;

/** "83321.94000000" -> "83321.94", "100.00000000" -> "100". Exact decimal string, no float rounding. */
export function trimDecimal(s) {
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a non-negative decimal: "${s}"`);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Open time to milliseconds. ms values are ~1.7e12, µs values ~1.7e15. */
export function toMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`bad timestamp "${raw}"`);
  if (n > 1e17) throw new Error(`timestamp looks like nanoseconds: "${raw}"`);
  return n > 1e14 ? n / 1000 : n;
}

/** Number of minutes in a UTC month "YYYY-MM". */
export function minutesInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return (Date.UTC(y, m, 1) - Date.UTC(y, m - 1, 1)) / MIN_MS;
}

/**
 * Parse one monthly 1-minute file and check it. Throws on anything that would silently corrupt a backtest:
 * wrong month, unsorted or duplicate minutes, timestamps off the minute grid, non-positive prices,
 * high/low that do not contain open/close, negative volume.
 * Missing minutes (exchange outages) are allowed but counted, so a report can show them.
 * Returns { csv: "t,o,h,l,c,v\n...", rows, missingMinutes, firstMs, lastMs }.
 */
export function normalizeKlines(text, month) {
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const [y, m] = month.split("-").map(Number);
  const end = Date.UTC(y, m, 1);
  const out = ["t,o,h,l,c,v"];
  let prev = -Infinity, rows = 0, firstMs = NaN;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (line.trim() === "") continue;
    const c = line.split(",");
    if (rows === 0 && /^[a-z_ ]+$/i.test(c[0])) continue; // header row ("open_time"), if present
    if (c.length < 6) throw new Error(`${month}: expected >= 6 columns, got ${c.length}: "${line}"`);
    const t = toMs(c[0]);
    if (t % MIN_MS !== 0) throw new Error(`${month}: time ${t} is not on a whole minute`);
    if (t < start || t >= end) throw new Error(`${month}: time ${new Date(t).toISOString()} outside the month`);
    if (t <= prev) throw new Error(`${month}: time not increasing at ${new Date(t).toISOString()}`);
    const [o, h, l, cl, v] = c.slice(1, 6).map(trimDecimal);
    const [O, H, L, C, V] = [o, h, l, cl, v].map(Number);
    if (!(O > 0 && H > 0 && L > 0 && C > 0)) throw new Error(`${month}: non-positive price at ${new Date(t).toISOString()}`);
    if (L > Math.min(O, C) || H < Math.max(O, C) || L > H) throw new Error(`${month}: high/low do not contain open/close at ${new Date(t).toISOString()}`);
    if (!(V >= 0)) throw new Error(`${month}: negative volume at ${new Date(t).toISOString()}`);
    out.push(`${t},${o},${h},${l},${cl},${v}`);
    if (rows === 0) firstMs = t;
    prev = t;
    rows++;
  }
  if (rows === 0) throw new Error(`${month}: no rows`);
  return { csv: out.join("\n") + "\n", rows, missingMinutes: minutesInMonth(month) - rows, firstMs, lastMs: prev };
}

/** Months "YYYY-MM" from `from` to `to` inclusive. */
export function monthRange(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m === 13) { m = 1; y++; }
  }
  return out;
}

/** The last fully finished UTC month before `now`. */
export function lastCompleteMonth(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}
