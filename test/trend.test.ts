import { describe, expect, it } from "vitest";
import { align, covAt, DEFAULT, firstK, monthEnds, runFixed, runTrend, signalAt, weightsAt, type Panel } from "../src/trend/tsmom.js";

// trading days (weekdays) from 2015-01-01
function days(n: number): string[] {
  const out: string[] = [];
  for (let t = Date.UTC(2015, 0, 1); out.length < n; t += 86400e3) { const d = new Date(t); if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10)); }
  return out;
}
// deterministic pseudo-random daily returns
function walk(n: number, drift: number, vol: number, seed: number): number[] {
  let s = seed, p = 100; const out = [p];
  for (let i = 1; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; const z = (s / 2147483648 - 0.5) * Math.sqrt(12); p *= 1 + drift + vol * z; out.push(p); }
  return out;
}
const N = 900, D = days(N);
const cash = D.map((_, i) => 100 * (1 + 0.0001) ** i);
const panel = (px: Record<string, number[]>): Panel => ({ dates: D, px, cash });

describe("trend helpers", () => {
  it("month ends: last trading day of each complete month only", () => {
    const e = monthEnds(["2020-01-30", "2020-01-31", "2020-02-03", "2020-02-28", "2020-03-02", "2020-03-03"]);
    expect(e).toEqual([1, 3]); // March is not complete
  });
  it("align keeps only common dates", () => {
    const p = align({ A: { d: ["d1", "d2", "d3"], c: [1, 2, 3] }, CASH: { d: ["d2", "d3", "d4"], c: [5, 6, 7] } }, "CASH");
    expect(p.dates).toEqual(["d2", "d3"]); expect(p.px.A).toEqual([2, 3]); expect(p.cash).toEqual([5, 6]);
  });
  it("signal: blend of 1/3/12-month excess-return signs, 12m alone", () => {
    const ends = Array.from({ length: 14 }, (_, i) => i);
    // up over 12 and 3 months, down in the last month
    const P = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 108, 112, 111, 110];
    const C = P.map(() => 1);
    expect(signalAt(P, C, ends, 13, "blend")).toBeCloseTo(1 / 3); // 1m 110<111: -1; 3m 110>108: +1; 12m 110>101: +1
    expect(signalAt(P, C, ends, 13, "12m")).toBe(1);
  });
  it("signal subtracts cash: an asset rising slower than cash is a short", () => {
    const ends = Array.from({ length: 13 }, (_, i) => i);
    const P = ends.map((i) => 100 * 1.001 ** i), C = ends.map((i) => 100 * 1.01 ** i);
    expect(signalAt(P, C, ends, 12, "blend")).toBe(-1);
  });
  it("one asset: weight = target vol / asset vol; ex-ante portfolio vol = 10%", () => {
    const p = panel({ A: walk(N, 0.001, 0.01, 7) });
    const ends = monthEnds(D), k = firstK(ends, 252);
    const w = weightsAt(p, ["A"], ends, k, DEFAULT), cov = covAt(p, ["A"], ends[k]!, 252);
    expect(Math.abs(w.A!)).toBeCloseTo(0.1 / Math.sqrt(cov[0]![0]!), 10);
  });
  it("several assets: ex-ante vol is the target, gross capped at 2", () => {
    const p = panel({ A: walk(N, 0.001, 0.01, 1), B: walk(N, -0.001, 0.008, 2), C: walk(N, 0.0005, 0.012, 3) });
    const ends = monthEnds(D), k = firstK(ends, 252), keys = ["A", "B", "C"];
    const w = weightsAt(p, keys, ends, k, DEFAULT), cov = covAt(p, keys, ends[k]!, 252), v = keys.map((x) => w[x]!);
    const pv = Math.sqrt(v.reduce((a, wi, i) => a + v.reduce((b, wj, j) => b + wi * wj * cov[i]![j]!, 0), 0));
    expect(pv).toBeCloseTo(0.1, 8);
    const capped = weightsAt(p, keys, ends, k, { ...DEFAULT, targetVol: 5 });
    expect(Object.values(capped).reduce((a, x) => a + Math.abs(x), 0)).toBeCloseTo(2, 10);
  });
  it("no look-ahead: prices after the month-end do not change the weights", () => {
    const A = walk(N, 0.001, 0.01, 4), p1 = panel({ A }), ends = monthEnds(D), k = firstK(ends, 252) + 3;
    const A2 = A.map((x, i) => (i > ends[k]! ? x * 3 : x));
    expect(weightsAt(panel({ A: A2 }), ["A"], ends, k, DEFAULT)).toEqual(weightsAt(p1, ["A"], ends, k, DEFAULT));
  });
  it("a jump on the day after the month-end is NOT earned (trade at the next close)", () => {
    const A = walk(N, 0.001, 0.005, 5), ends = monthEnds(D), k = firstK(ends, 252);
    const base = runTrend(panel({ A }), ["A"]);
    const A2 = A.map((x, i) => (i >= ends[k]! + 1 ? x * 1.2 : x)); // +20% between month-end close and the next close
    const jump = runTrend(panel({ A: A2 }), ["A"]);
    expect(jump[0]!.r).toBeCloseTo(base[0]!.r, 12);
  });
  it("return = cash + w * (asset - cash) - costs; costs from turnover and shorts", () => {
    const A = walk(N, -0.0015, 0.004, 6), p = panel({ A }), m = runTrend(p, ["A"]), idx = new Map(D.map((d, i) => [d, i]));
    const x = m[0]!, a = idx.get(x.start)!, b = idx.get(x.end)!;
    const rc = cash[b]! / cash[a]! - 1, ra = A[b]! / A[a]! - 1;
    expect(x.w.A!).toBeLessThan(0); // falling asset -> short
    expect(x.cost).toBeCloseTo(0.0003 * Math.abs(x.w.A!) + (0.005 / 12) * -x.w.A!, 12);
    expect(x.r).toBeCloseTo(rc + x.w.A! * (ra - rc) - x.cost, 12);
    const y = m[1]!;
    expect(y.cost).toBeCloseTo(0.0003 * Math.abs(y.w.A! - x.w.A!) + (0.005 / 12) * Math.max(0, -y.w.A!), 12);
  });
  it("long-only never shorts; months chain without gaps", () => {
    const p = panel({ A: walk(N, -0.0015, 0.004, 6), B: walk(N, 0.0015, 0.004, 8) });
    const m = runTrend(p, ["A", "B"], { ...DEFAULT, longOnly: true });
    expect(m.every((x) => x.w.A! >= 0 && x.w.B! >= 0)).toBe(true);
    for (let i = 1; i < m.length; i++) expect(m[i]!.start).toBe(m[i - 1]!.end);
  });
  it("fixed-weight benchmark on the same periods", () => {
    const A = walk(N, 0.001, 0.01, 9), p = panel({ A }), m = runTrend(p, ["A"]);
    const r = runFixed(p, { A: 1 }, m), idx = new Map(D.map((d, i) => [d, i]));
    expect(r[2]).toBeCloseTo(A[idx.get(m[2]!.end)!]! / A[idx.get(m[2]!.start)!]! - 1, 12);
  });
});
