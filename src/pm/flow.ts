// P — Pulse (sudden probability moves) and K — Cluster (many wallets buying one outcome). Rules: experiments/polymarket-preregistration.md.
import { mulberry32 } from "../evaluate.js";
import { priceAt, ret, type Pt } from "./common.js";

const H = 3600, DAY = 86400;

/** Resolution of outcome index o (0 = Yes, 1 = No) from final prices; null if not a clean 1/0. */
export function resolved(final: readonly string[], o: 0 | 1): 0 | 1 | null {
  const v = final[o];
  return v === "1" ? 1 : v === "0" ? 0 : null;
}

// ---------------- Pulse ----------------
export interface Spike { readonly t: number; readonly dir: 1 | -1; readonly from: number; readonly to: number }

/** Spikes: |p(t) - p(t - 60 min)| >= 0.20 with p(t - 60 min) in [0.10, 0.90]; not in the last 24 h; at most one per 24 h. */
export function findSpikes(h: readonly Pt[], close: number): Spike[] {
  const out: Spike[] = [];
  let last = -Infinity;
  for (const [t, p] of h) {
    if (t > close - DAY) break;
    if (t < last + DAY) continue;
    const p0 = priceAt(h, t - H, 20 * 60);
    if (p0 === null || p0 < 0.1 || p0 > 0.9) continue;
    if (Math.abs(p - p0) >= 0.2) { out.push({ t, dir: p > p0 ? 1 : -1, from: p0, to: p }); last = t; }
  }
  return out;
}

/**
 * Trade on the YES (side 1) or NO (side -1) token: entry at t + 10 min (+cost), exit after `hold` seconds (-cost),
 * or at resolution if the market closes first (or hold = Infinity). Null if a needed price is missing.
 */
export function holdReturn(h: readonly Pt[], close: number, yesFinal: 0 | 1, t: number, side: 1 | -1, hold: number, cost: number): number | null {
  const te = t + 600;
  const pe = priceAt(h, te, 20 * 60);
  if (pe === null) return null;
  const entry = (side === 1 ? pe : 1 - pe) + cost;
  if (te + hold >= close) return ret(entry, side === 1 ? yesFinal : 1 - yesFinal);
  const px = priceAt(h, te + hold, 20 * 60);
  if (px === null) return null;
  return ret(entry, (side === 1 ? px : 1 - px) - cost);
}

// ---------------- Cluster ----------------
export type TradeRow = readonly [number, string, "B" | "S", 0 | 1, number, number]; // ts, wallet, side, outcome, size, price
export interface Cluster { readonly t: number; readonly outcome: 0 | 1; readonly wallets: number; readonly notional: number; readonly price: number }

/** Clusters: in 60 min >= 15 distinct buyers of one outcome, >= $5 000, >= 3x the other outcome's buyers, price in [0.05, 0.90]. */
export function findClusters(rows: readonly TradeRow[], close: number, minWallets = 15, minNotional = 5000): Cluster[] {
  const out: Cluster[] = [];
  const win: TradeRow[] = [];
  let head = 0;
  const buyers: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  const notional: [number, number] = [0, 0];
  const last: [number, number] = [-Infinity, -Infinity];
  for (const r of rows) {
    const [t, w, side, o, size, price] = r;
    while (head < win.length && win[head]![0] <= t - H) { // drop trades older than 60 minutes
      const [, w0, , o0, s0, p0] = win[head++]!;
      const m = buyers[o0]; const c = m.get(w0)! - 1;
      if (c) m.set(w0, c); else m.delete(w0);
      notional[o0] -= s0 * p0;
    }
    if (side !== "B") continue;
    win.push(r);
    buyers[o].set(w, (buyers[o].get(w) ?? 0) + 1);
    notional[o] += size * price;
    if (t > close - 6 * H || t < last[o] + DAY) continue;
    const n = buyers[o].size, other = buyers[o === 0 ? 1 : 0].size;
    if (n >= minWallets && notional[o] >= minNotional && n >= 3 * other && price >= 0.05 && price <= 0.9) {
      out.push({ t, outcome: o, wallets: n, notional: notional[o], price });
      last[o] = t;
    }
  }
  return out;
}

/** Buy outcome o at the first trade of o at least 5 min after t (+cost), hold to resolution. */
export function clusterReturn(rows: readonly TradeRow[], t: number, o: 0 | 1, res: 0 | 1, cost: number): number | null {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid]![0] < t + 300) lo = mid + 1; else hi = mid; } // first row at or after t + 5 min
  for (let i = lo; i < rows.length; i++) if (rows[i]![3] === o) return ret(rows[i]![5] + cost, res);
  return null;
}

/** Per seed, the mean of one random counterpart for each of the n signals (draw(rnd, i) returns a return or null). */
export function randomMeans(n: number, seeds: number, draw: (rnd: () => number, i: number) => number | null): number[] {
  const out: number[] = [];
  for (let s = 0; s < seeds; s++) {
    const rnd = mulberry32(9000 + s);
    let sum = 0, k = 0;
    for (let i = 0; i < n; i++) { const r = draw(rnd, i); if (r !== null) { sum += r; k++; } }
    out.push(k ? sum / k : NaN);
  }
  return out;
}
