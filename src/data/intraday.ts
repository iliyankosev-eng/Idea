import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { DataError } from "../types.js";

const MIN_MS = 60_000;

/** 1-minute bars. t = open time in ms UTC. Minutes the exchange did not trade are absent (no forward fill). */
export interface MinuteBars {
  readonly symbol: string;
  readonly t: number[];
  readonly o: number[];
  readonly h: number[];
  readonly l: number[];
  readonly c: number[];
  readonly v: number[];
  /** Expected minutes in the loaded range minus rows present. */
  readonly missingMinutes: number;
}

function months(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m === 13) { m = 1; y++; }
  }
  return out;
}

/**
 * Load Binance 1-minute bars written by scripts/pipeline.mjs (data branch, intraday/binance/<SYMBOL>/1m/<YYYY-MM>.csv.gz)
 * for whole months fromMonth..toMonth. Every month in the range must exist: a missing file is an error, not a gap.
 * Re-checks order and high/low consistency, so a corrupted file cannot slip through.
 */
export function loadMinuteBars(dataDir: string, symbol: string, fromMonth: string, toMonth: string): MinuteBars {
  const t: number[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [], v: number[] = [];
  const ms = months(fromMonth, toMonth);
  if (ms.length === 0) throw new DataError(`${symbol}: empty month range ${fromMonth}..${toMonth}`);
  for (const month of ms) {
    const path = join(dataDir, "intraday", "binance", symbol, "1m", `${month}.csv.gz`);
    if (!existsSync(path)) throw new DataError(`${symbol}: missing month file ${path}`);
    const lines = gunzipSync(readFileSync(path)).toString("utf8").split("\n");
    if (lines[0] !== "t,o,h,l,c,v") throw new DataError(`${symbol} ${month}: unexpected header "${lines[0]}"`);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line === "") continue;
      const [ts, os, hs, ls, cs, vs] = line.split(",");
      const row = [Number(ts), Number(os), Number(hs), Number(ls), Number(cs), Number(vs)] as const;
      const [T, O, H, L, C, V] = row;
      if (row.some((x) => !Number.isFinite(x))) throw new DataError(`${symbol} ${month}: bad number on line ${i + 1}`);
      if (T % MIN_MS !== 0) throw new DataError(`${symbol} ${month}: off-minute time ${T}`);
      if (t.length > 0 && T <= t[t.length - 1]!) throw new DataError(`${symbol} ${month}: time not increasing at ${new Date(T).toISOString()}`);
      if (!(L > 0) || L > Math.min(O, C) || H < Math.max(O, C) || V < 0) throw new DataError(`${symbol} ${month}: inconsistent bar at ${new Date(T).toISOString()}`);
      t.push(T); o.push(O); h.push(H); l.push(L); c.push(C); v.push(V);
    }
  }
  const [fy, fm] = fromMonth.split("-").map(Number) as [number, number];
  const [ty, tm] = toMonth.split("-").map(Number) as [number, number];
  const expected = (Date.UTC(ty, tm, 1) - Date.UTC(fy, fm - 1, 1)) / MIN_MS;
  return { symbol, t, o, h, l, c, v, missingMinutes: expected - t.length };
}

/** Daily bars (UTC days) from minute bars: open of the first minute, close of the last, max high, min low, summed volume. */
export function dailyFromMinutes(b: MinuteBars): { date: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] } {
  const out = { date: [] as string[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], v: [] as number[] };
  for (let i = 0; i < b.t.length; i++) {
    const d = new Date(b.t[i]!).toISOString().slice(0, 10);
    const k = out.date.length - 1;
    if (k < 0 || out.date[k] !== d) {
      out.date.push(d); out.o.push(b.o[i]!); out.h.push(b.h[i]!); out.l.push(b.l[i]!); out.c.push(b.c[i]!); out.v.push(b.v[i]!);
    } else {
      out.h[k] = Math.max(out.h[k]!, b.h[i]!); out.l[k] = Math.min(out.l[k]!, b.l[i]!); out.c[k] = b.c[i]!; out.v[k]! += b.v[i]!;
    }
  }
  return out;
}
