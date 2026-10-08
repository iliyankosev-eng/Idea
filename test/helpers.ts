import type { Series } from "../src/types.js";

/** Build a series from prices (ret computed from prices). Dates are day numbers padded to sort correctly. */
export function makeSeries(prices: number[], cash: number | number[] = 0, periodsPerYear = 365): Series {
  const dates = prices.map((_, i) => `d${String(i).padStart(6, "0")}`);
  const ret = prices.map((p, i) => (i === 0 ? 0 : p / prices[i - 1]! - 1));
  const c = prices.map((_, i) => (i === 0 ? 0 : Array.isArray(cash) ? cash[i]! : cash));
  return { name: "test", dates, price: prices, ret, cash: c, periodsPerYear };
}

/** Deterministic pseudo-random numbers (mulberry32) so tests are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomWalk(n: number, seed: number, start = 100): number[] {
  const r = rng(seed);
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1]! * (1 + (r() - 0.5) * 0.08));
  return out;
}
