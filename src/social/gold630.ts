// S3: gold 06:30 UK range breakout (experiments/social5-preregistration.md). Minutes m = London minute of day.
import type { DayRet } from "../daytrade/dt.js";
export interface GoldDay { readonly date: string; readonly m: number[]; readonly o: number[]; readonly h: number[]; readonly l: number[]; readonly c: number[]; readonly v: number[] }
/** Range 06:30-06:44; first 1-minute close outside it before 08:00 -> enter at the next open in that direction; stop = other side; exit 09:30 (close of the 09:29 bar). Result in R, net of `fee` per side. */
export function gold630(days: readonly GoldDay[], o: { fee: number; invert?: boolean }): DayRet[] {
  return days.map((d) => {
    const none = { day: d.date, r: 0, trades: 0 };
    const ri = d.m.map((m, i) => (m >= 390 && m < 405 ? i : -1)).filter((i) => i >= 0);
    if (ri.length < 15) return none;
    const H = Math.max(...ri.map((i) => d.h[i]!)), L = Math.min(...ri.map((i) => d.l[i]!));
    if (!(H > L)) return none;
    const last = d.m.reduce((k, m, i) => (m < 570 ? i : k), -1);
    for (let i = ri.at(-1)! + 1; i < d.m.length && d.m[i]! < 480; i++) {
      const brk = d.c[i]! > H ? 1 : d.c[i]! < L ? -1 : 0;
      if (!brk || i + 1 > last) continue;
      const dir = o.invert ? -brk : brk, k = i + 1, entry = d.o[k]!;
      const stop = o.invert ? (dir === 1 ? entry - (H - L) : entry + (H - L)) : dir === 1 ? L : H;
      const risk = dir * (entry - stop);
      if (!(risk > 0)) return none;
      let exit = d.c[last]!;
      for (let j = k; j <= last; j++) {
        if (j > k && dir * (d.o[j]! - stop) <= 0) { exit = d.o[j]!; break; }
        if (dir === 1 ? d.l[j]! <= stop : d.h[j]! >= stop) { exit = stop; break; }
      }
      return { day: d.date, r: (dir * (exit - entry) - o.fee * (entry + exit)) / risk, trades: 1 };
    }
    return none;
  });
}
