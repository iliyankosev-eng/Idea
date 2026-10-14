import { readFileSync } from "node:fs";
import type { MinuteBars } from "../data/intraday.js";
import { DataError } from "../types.js";

/** Official sessions: New York date -> [open minute, close minute) (e.g. 570, 960; early close 570, 780). */
export type Calendar = Map<string, readonly [number, number]>;

/** Read daily/alpaca/calendar.csv (date,open,close in New York time). */
export function loadCalendar(path: string): Calendar {
  const cal: Calendar = new Map();
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  for (const line of readFileSync(path, "utf8").replace(/\r/g, "").trim().split("\n").slice(1)) {
    const [date, open, close] = line.split(",");
    if (!date || !open || !close) throw new DataError(`calendar: bad line "${line}"`);
    cal.set(date, [toMin(open), toMin(close)]);
  }
  return cal;
}

/** One regular session (09:30-16:00 New York) of one symbol. minute = minutes since New York midnight (570 = 09:30). */
export interface Session {
  readonly symbol: string;
  readonly date: string; // New York date
  readonly minute: number[];
  readonly o: number[];
  readonly h: number[];
  readonly l: number[];
  readonly c: number[];
  /** Volume per minute (set by toSessions; optional so hand-built test sessions need not supply it). */
  readonly v?: number[];
  /** Stocks with a calendar: the official previous session date (to detect a missing previous day). */
  prevDate?: string;
}

export const OPEN = 570; // 09:30
export const LAST = 959; // 15:59, the last regular one-minute bar

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});
const HOUR = 3_600_000;

/**
 * Group minute bars into New York regular sessions (09:30-15:59), Monday to Friday.
 * With an exchange calendar (stocks): days that are not sessions are dropped, and bars at or after the official
 * close are dropped (early closes at 13:00 would otherwise keep after-hours prints as if they were regular trading).
 * The New York offset is computed once per UTC hour (daylight saving changes on the hour), then reused.
 */
export function toSessions(b: MinuteBars, calendar?: Calendar): Session[] {
  const out: Session[] = [];
  const offsetCache = new Map<number, { offsetMin: number }>();
  let cur: Session | null = null;
  for (let i = 0; i < b.t.length; i++) {
    const t = b.t[i]!;
    const hourKey = Math.floor(t / HOUR);
    let off = offsetCache.get(hourKey);
    if (!off) {
      const p = Object.fromEntries(NY.formatToParts(new Date(hourKey * HOUR)).map((x) => [x.type, x.value]));
      const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
      off = { offsetMin: (asUtc - hourKey * HOUR) / 60_000 };
      offsetCache.set(hourKey, off);
    }
    const local = new Date(t + off.offsetMin * 60_000); // New York wall clock, read with UTC getters
    const dow = local.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (minute < OPEN || minute > LAST) continue;
    const date = local.toISOString().slice(0, 10);
    if (calendar) {
      const sess = calendar.get(date);
      if (!sess || minute < sess[0] || minute >= sess[1]) continue;
    }
    if (!cur || cur.date !== date) {
      cur = { symbol: b.symbol, date, minute: [], o: [], h: [], l: [], c: [], v: [] };
      out.push(cur);
    }
    cur.minute.push(minute); cur.o.push(b.o[i]!); cur.h.push(b.h[i]!); cur.l.push(b.l[i]!); cur.c.push(b.c[i]!); cur.v!.push(b.v[i]!);
  }
  if (calendar) {
    const days = [...calendar.keys()].sort();
    const prev = new Map(days.map((d, i) => [d, days[i - 1]] as const));
    for (const s of out) { const p = prev.get(s.date); if (p) s.prevDate = p; }
  }
  return out;
}

/**
 * Stocks: drop sessions with fewer than half of the official minutes (data-provider outages; on 2018-05-02/03 the Nasdaq
 * names have a single bar). Returns the kept sessions and the dropped dates.
 */
export function completeSessions(ss: Session[], calendar: Calendar): { kept: Session[]; dropped: string[] } {
  const kept: Session[] = [], dropped: string[] = [];
  for (const s of ss) {
    const c = calendar.get(s.date);
    if (c && s.minute.length >= 0.5 * (c[1] - c[0])) kept.push(s);
    else dropped.push(s.date);
  }
  return { kept, dropped };
}

/** Index of the first bar at or after `minute`, or -1. */
export function firstAtOrAfter(s: Session, minute: number): number {
  for (let i = 0; i < s.minute.length; i++) if (s.minute[i]! >= minute) return i;
  return -1;
}

/** Index of the last bar at or before `minute`, or -1. */
export function lastAtOrBefore(s: Session, minute: number): number {
  for (let i = s.minute.length - 1; i >= 0; i--) if (s.minute[i]! <= minute) return i;
  return -1;
}
