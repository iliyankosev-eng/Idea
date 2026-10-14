// N3: 0DTE SPY iron condor (and ATM straddle) entered at 10:00 ET, held to expiry (experiments/new3-preregistration.md).
export type OptBar = [string, number, number, number, number, number, number]; // t (UTC ISO), o, h, l, c, v, n
export interface N3Day {
  readonly date: string;
  readonly S: number; // SPY close of the 09:59 bar
  readonly close: number; // SPY last close of the session (expiry value)
  readonly t10: string; // 10:00 ET as UTC ISO "YYYY-MM-DDTHH:MM"
  readonly legs: Readonly<Record<"sc" | "sp" | "lc" | "lp" | "ac" | "ap", string>>;
  readonly bars: Readonly<Record<string, readonly OptBar[]>>;
}
export interface N3Result { readonly date: string; readonly ic: boolean; readonly icRet: number; readonly credit?: number; readonly maxRisk?: number; readonly straddle?: number }

export const strikeOf = (occ: string) => Number(occ.slice(-8)) / 1000;
/** Close of the bar at 10:00, else of the nearest bar within 5 minutes (ties: the earlier one); undefined if none. */
export function entryPrice(bars: readonly OptBar[] | undefined, t10: string): number | undefined {
  if (!bars?.length) return undefined;
  const t0 = Date.parse(`${t10}:00Z`);
  let best: OptBar | undefined, bestD = Infinity;
  for (const b of bars) {
    const d = (Date.parse(b[0]) - t0) / 60000;
    if (Math.abs(d) > 5) continue;
    if (Math.abs(d) < bestD || (Math.abs(d) === bestD && d < 0)) { best = b; bestD = Math.abs(d); }
  }
  return best?.[4];
}
export function n3(days: readonly N3Day[], cost: number): N3Result[] {
  return days.map((d) => {
    const p = Object.fromEntries(Object.entries(d.legs).map(([k, s]) => [k, entryPrice(d.bars[s], d.t10)])) as Record<string, number | undefined>;
    const X = d.close;
    let straddle: number | undefined;
    if (p.ac !== undefined && p.ap !== undefined) {
      const K = strikeOf(d.legs.ac), itm = X !== K ? 1 : 0;
      straddle = (p.ac + p.ap - Math.abs(X - K) - (2 + itm) * cost) / d.S;
    }
    if ([p.sc, p.sp, p.lc, p.lp].some((x) => x === undefined)) return { date: d.date, ic: false, icRet: 0, ...(straddle !== undefined ? { straddle } : {}) };
    const [ksc, ksp, klc, klp] = [d.legs.sc, d.legs.sp, d.legs.lc, d.legs.lp].map(strikeOf) as [number, number, number, number];
    const credit = p.sc! + p.sp! - p.lc! - p.lp!;
    const intr = [Math.max(0, X - ksc), Math.max(0, ksp - X), Math.max(0, X - klc), Math.max(0, klp - X)];
    const exitLegs = intr.filter((x) => x > 0).length;
    const pnl = credit - intr[0]! - intr[1]! + intr[2]! + intr[3]! - (4 + exitLegs) * cost;
    const maxRisk = Math.max(klc - ksc, ksp - klp) - credit;
    if (!(credit > 0) || !(maxRisk > 0)) return { date: d.date, ic: false, icRet: 0, ...(straddle !== undefined ? { straddle } : {}) };
    return { date: d.date, ic: true, icRet: pnl / maxRisk, credit, maxRisk, ...(straddle !== undefined ? { straddle } : {}) };
  });
}
