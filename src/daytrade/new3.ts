// N1 (last 30 minutes follow the rest of the day) and N2 (pre-FOMC drift), experiments/new3-preregistration.md.
import type { Session } from "../intraday/sessions.js";
import { barAtOrAfter, barBefore, type DayRet } from "./dt.js";

const linked = (ss: readonly Session[], d: number) => d > 0 && (!ss[d]!.prevDate || ss[d]!.prevDate === ss[d - 1]!.date);

export interface N1Opts { readonly cost: number; readonly minAbs?: number; readonly alwaysLong?: boolean }
/** Signal: prev close -> close of the bar before (close - 30 min); trade from the open of the (close - 30) bar to the last close. */
export function n1(ss: readonly Session[], o: N1Opts): (DayRet & { sig: number })[] {
  const out: (DayRet & { sig: number })[] = [];
  for (let d = 0; d < ss.length; d++) {
    const s = ss[d]!;
    const none = { day: s.date, r: 0, trades: 0, sig: 0 };
    if (!linked(ss, d)) { out.push(none); continue; }
    const prevClose = ss[d - 1]!.c[ss[d - 1]!.c.length - 1]!;
    const t30 = s.minute[s.minute.length - 1]! + 1 - 30;
    const iS = barBefore(s, t30), iE = barAtOrAfter(s, t30);
    if (iS < 0 || iE < 0 || s.minute[iE] !== t30) { out.push(none); continue; }
    const sig = s.c[iS]! / prevClose - 1;
    if (sig === 0 || (o.minAbs !== undefined && Math.abs(sig) <= o.minAbs)) { out.push({ ...none, sig }); continue; }
    const dir = o.alwaysLong ? 1 : sig > 0 ? 1 : -1, entry = s.o[iE]!, exit = s.c[s.c.length - 1]!;
    out.push({ day: s.date, r: dir * (exit / entry - 1) - (2 * o.cost) / entry, trades: 1, sig });
  }
  return out;
}

/** Long from the previous session's last close to the close of the 13:59 bar on each FOMC statement day. */
export function n2(ss: readonly Session[], fomc: ReadonlySet<string>, cost: number): DayRet[] {
  return ss.map((s, d) => {
    if (!fomc.has(s.date) || !linked(ss, d)) return { day: s.date, r: 0, trades: 0 };
    const i = barBefore(s, 840); // the bar that closes at 14:00
    if (i < 0 || s.minute[i] !== 839) return { day: s.date, r: 0, trades: 0 };
    const entry = ss[d - 1]!.c[ss[d - 1]!.c.length - 1]!;
    return { day: s.date, r: s.c[i]! / entry - 1 - (2 * cost) / entry, trades: 1 };
  });
}
