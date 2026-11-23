// Split handling for raw (unadjusted) minute sessions (experiments/cross-instrument-preregistration.md).
import type { Session } from "./sessions.js";

/** Days whose session close-to-close move differs from the adjusted daily move by more than `k` x (a split). */
export function splitDays(ss: readonly Session[], daily: { date: readonly string[]; c: readonly number[] }, k = 1.4): Set<string> {
  const adj = new Map(daily.date.map((d, i) => [d, daily.c[i]!]));
  const out = new Set<string>();
  for (let d = 1; d < ss.length; d++) {
    const a0 = adj.get(ss[d - 1]!.date), a1 = adj.get(ss[d]!.date);
    if (!a0 || !a1) continue;
    const raw = ss[d]!.c[ss[d]!.c.length - 1]! / ss[d - 1]!.c[ss[d - 1]!.c.length - 1]!, q = raw / (a1 / a0);
    if (q > k || q < 1 / k) out.add(ss[d]!.date);
  }
  return out;
}
/** Split-free pieces of history: a new piece starts at every split day. */
export function segments(ss: readonly Session[], splits: ReadonlySet<string>): Session[][] {
  const out: Session[][] = [[]];
  for (const s of ss) { if (splits.has(s.date) && out[out.length - 1]!.length) out.push([]); out[out.length - 1]!.push(s); }
  return out.filter((x) => x.length);
}
