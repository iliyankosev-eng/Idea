// H4 — Opening Range Reversal + pre-market level sweep (experiments/h4-orr-preregistration.md).
import { readFileSync } from "node:fs";
import { DataError } from "../types.js";
import { OPEN, type Session } from "./sessions.js";
import type { TradePlan } from "./sim.js";

export interface PmLevels { readonly pmh: number; readonly pml: number }

/** daily/alpaca/premarket/<T>.csv -> date -> levels */
export function loadPremarket(path: string): Map<string, PmLevels> {
  const m = new Map<string, PmLevels>();
  for (const line of readFileSync(path, "utf8").replace(/\r/g, "").trim().split("\n").slice(1)) {
    const [d, h, l] = line.split(",");
    const pmh = Number(h), pml = Number(l);
    if (!d || !(pmh > 0) || !(pml > 0) || pml > pmh) throw new DataError(`premarket: bad line "${line}"`);
    m.set(d, { pmh, pml });
  }
  return m;
}

export interface H4Signal {
  readonly plan: TradePlan;
  readonly side: "long" | "short";
  readonly sweepMinute: number;
  readonly entryMinute: number;
  readonly entry: number;
  readonly risk: number;
}

const OR_END = 584; // 09:44
const SWEEP_FROM = 585, SWEEP_TO = 689; // 09:45 .. 11:29
const EXIT = 719; // 11:59
const RECLAIM_MAX = 60; // minutes from the start of the sweep

/**
 * One session -> at most one H4 trade. usePm = true: the sweep must take out both the opening-range extreme and the
 * pre-market level (main rule); false: the opening-range extreme only (reported variant).
 */
export function h4Signal(s: Session, pm: PmLevels | undefined, usePm: boolean): H4Signal | null {
  if (s.minute[0] !== OPEN) return null;
  let orh = -Infinity, orl = Infinity, nOr = 0;
  for (let i = 0; i < s.minute.length && s.minute[i]! <= OR_END; i++) { orh = Math.max(orh, s.h[i]!); orl = Math.min(orl, s.l[i]!); nOr++; }
  if (nOr < 10) return null;
  if (usePm && !pm) return null;
  const lowLevel = usePm ? Math.min(orl, pm!.pml) : orl;
  const highLevel = usePm ? Math.max(orh, pm!.pmh) : orh;

  for (let i = 0; i < s.minute.length; i++) {
    const m = s.minute[i]!;
    if (m < SWEEP_FROM) continue;
    if (m > SWEEP_TO) return null;
    const down = s.l[i]! < lowLevel, up = s.h[i]! > highLevel;
    if (!down && !up) continue;
    if (down && up) return null; // both sides in one bar: no clear signal
    const side: "long" | "short" = down ? "long" : "short";
    let extreme = side === "long" ? Infinity : -Infinity;
    for (let j = i; j < s.minute.length && s.minute[j]! - m <= RECLAIM_MAX; j++) {
      extreme = side === "long" ? Math.min(extreme, s.l[j]!) : Math.max(extreme, s.h[j]!);
      const reclaimed = side === "long" ? s.c[j]! > orl : s.c[j]! < orh;
      if (!reclaimed) continue;
      const k = j + 1;
      if (k >= s.minute.length || s.minute[k]! > EXIT) return null;
      const entry = s.o[k]!;
      const dir: 1 | -1 = side === "long" ? 1 : -1;
      const stop = side === "long" ? extreme - 0.01 : extreme + 0.01;
      const target = side === "long" ? orh : orl;
      const risk = dir * (entry - stop);
      if (!(risk > 0)) return null;
      if (dir * (target - entry) < 2 * risk) return null;
      return { plan: { dir, entryMinute: s.minute[k]!, exitMinute: EXIT, stop, target }, side, sweepMinute: m, entryMinute: s.minute[k]!, entry, risk };
    }
    return null; // swept but not reclaimed within 60 minutes
  }
  return null;
}
