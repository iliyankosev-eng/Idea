// Generic opening-range fade ("range bot" claim check, experiments/range-bot-preregistration.md).
import type { Session } from "../intraday/sessions.js";
import { COST_PER_SHARE as C } from "../daytrade/dt.js";

export interface RangeT { date: string; r: number }
/** 09:30-10:00 range; first trade through it (10:00-15:00) is faded; target tgtW x width toward the middle, stop stopW x width beyond. */
export function rangeTrade(s: Session, tgtW: number, stopW: number, cost = C): RangeT | null {
  let H = -Infinity, L = Infinity, i = 0;
  for (; i < s.minute.length && s.minute[i]! < 600; i++) { H = Math.max(H, s.h[i]!); L = Math.min(L, s.l[i]!); }
  const W = H - L;
  if (!(W > 0)) return null;
  for (; i < s.minute.length && s.minute[i]! < 900; i++) {
    const up = s.h[i]! >= H + 0.01, dn = s.l[i]! <= L - 0.01;
    if (up && dn) return null;
    if (!up && !dn) continue;
    const dir = up ? -1 : 1, entry = up ? H : L, stop = entry - dir * stopW * W, target = entry + dir * tgtW * W, risk = stopW * W;
    let exit = NaN;
    for (let j = i; j < s.minute.length; j++) {
      if (s.minute[j]! >= 955) { exit = s.o[j]!; break; }
      const adverse = dir === 1 ? s.l[j]! <= stop : s.h[j]! >= stop;
      if (adverse) { exit = j > i && (dir === 1 ? s.o[j]! < stop : s.o[j]! > stop) ? s.o[j]! : stop; break; }
      const fav = dir === 1 ? s.h[j]! >= target : s.l[j]! <= target;
      if (fav && j > i) { exit = target; break; }
    }
    if (Number.isNaN(exit)) exit = s.c[s.c.length - 1]!;
    return { date: s.date, r: (dir * (exit - entry) - 2 * cost) / risk };
  }
  return null;
}
