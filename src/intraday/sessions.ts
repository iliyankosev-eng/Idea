import type { MinuteBars } from "../data/intraday.js";

/** One regular session (09:30-16:00 New York) of one symbol. minute = minutes since New York midnight (570 = 09:30). */
export interface Session {
  readonly symbol: string;
  readonly date: string; // New York date
  readonly minute: number[];
  readonly o: number[];
  readonly h: number[];
  readonly l: number[];
  readonly c: number[];
}

export const OPEN = 570; // 09:30
export const LAST = 959; // 15:59, the last regular one-minute bar

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});
const HOUR = 3_600_000;

/**
 * Group minute bars into New York regular sessions (09:30-15:59), Monday to Friday.
 * The New York offset is computed once per UTC hour (daylight saving changes on the hour), then reused.
 */
export function toSessions(b: MinuteBars): Session[] {
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
    if (!cur || cur.date !== date) {
      cur = { symbol: b.symbol, date, minute: [], o: [], h: [], l: [], c: [] };
      out.push(cur);
    }
    cur.minute.push(minute); cur.o.push(b.o[i]!); cur.h.push(b.h[i]!); cur.l.push(b.l[i]!); cur.c.push(b.c[i]!);
  }
  return out;
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
