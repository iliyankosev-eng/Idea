/**
 * How often did trend beat buy-and-hold over rolling periods? (descriptive; overlapping windows are not independent)
 * Needs data/sp500.csv (npm run data) and the data branch (npm run data:sync). Run: npx tsx src/cli/trend-rolling.ts
 */
import { readFileSync } from "node:fs";
import { loadShiller } from "../data/shiller.js";
import { loadCoinMetrics } from "../data/coinmetrics.js";
import { runBacktest } from "../engine.js";
import { buyAndHold, smaTrend } from "../strategies.js";
import type { Series } from "../types.js";
const B = "data/branch/daily";

const cagr = (r: readonly number[], ppy: number) => (r.reduce((g, x) => g * (1 + x), 1) ** (ppy / r.length) - 1) * 100;
const maxDD = (r: readonly number[]) => { let eq = 1, pk = 1, dd = 0; for (const x of r) { eq *= 1 + x; pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); } return dd * 100; };
const sharpe = (r: readonly number[], rf: readonly number[] | null, ppy: number) => { const e = r.map((x, i) => x - (rf ? rf[i]! : 0)); const m = e.reduce((a, b) => a + b, 0) / e.length; const sd = Math.sqrt(e.reduce((a, b) => a + (b - m) ** 2, 0) / (e.length - 1)); return (m / sd) * Math.sqrt(ppy); };

function compare(label: string, s: Series, n: number, cost: number, lag: number, from: string, to: string, win: number, step: number, rfMode: "cash" | "none") {
  const tr = runBacktest(s, smaTrend(n), { cost, lag }).returns, bh = runBacktest(s, buyAndHold, { cost: 0, lag }).returns;
  const idx = s.dates.map((d, i) => [d, i] as const).filter(([d]) => d >= from && d <= to && Number(d.slice(0, 4)) > 0).map(([, i]) => i).filter((i) => i > n + lag + 1);
  const i0 = idx[0]!, i1 = idx[idx.length - 1]!;
  const rf = rfMode === "cash" ? s.cash : null;
  const sl = (r: readonly number[], a: number, b: number) => r.slice(a, b + 1);
  const full = (r: readonly number[]) => sl(r, i0, i1);
  const p = s.periodsPerYear;
  console.log(`\n== ${label}: ${s.dates[i0]} .. ${s.dates[i1]}`);
  console.log(`  whole period: B&H CAGR ${cagr(full(bh), p).toFixed(1)}% DD ${maxDD(full(bh)).toFixed(0)}% Sharpe(excess) ${sharpe(full(bh), rf ? full(rf) : null, p).toFixed(2)} | trend CAGR ${cagr(full(tr), p).toFixed(1)}% DD ${maxDD(full(tr)).toFixed(0)}% Sharpe(excess) ${sharpe(full(tr), rf ? full(rf) : null, p).toFixed(2)}`);
  let nW = 0, wC = 0, wD = 0, wS = 0, bothDS = 0; const dC: number[] = [];
  for (let a = i0; a + win - 1 <= i1; a += step) {
    const b = a + win - 1, rb = sl(bh, a, b), rt = sl(tr, a, b), rr = rf ? sl(rf, a, b) : null;
    nW++; const c = cagr(rt, p) - cagr(rb, p); dC.push(c);
    if (c > 0) wC++;
    if (maxDD(rt) > maxDD(rb)) wD++;
    if (sharpe(rt, rr, p) > sharpe(rb, rr, p)) wS++;
  }
  if (nW === 0) return;
  dC.sort((x, y) => x - y);
  console.log(`  rolling ${win / p}-year windows (${nW}, step ${step} bars): trend higher return ${(100 * wC / nW).toFixed(0)}% | smaller max drawdown ${(100 * wD / nW).toFixed(0)}% | higher Sharpe ${(100 * wS / nW).toFixed(0)}% | return difference %/yr: worst ${dC[0]!.toFixed(1)}, median ${dC[dC.length >> 1]!.toFixed(1)}, best ${dC[dC.length - 1]!.toFixed(1)}`);
}

// S&P 500, Phase 2 setup (cash = 10y yield as income) and with cash = 3m T-bill (1954+), Sharpe in excess of cash
const sp10 = loadShiller("data/sp500.csv");
compare("S&P 500 SMA10, cash = 10y yield (as Phase 2), whole history", sp10, 10, 0.001, 1, "1881-01", "2023-06", 120, 1, "cash");
// T-bill: monthly average of DTB3, known one month earlier
const tb = new Map<string, number[]>();
for (const l of readFileSync(`${B}/fred/DTB3.csv`, "utf8").trim().split("\n").slice(1)) { const [d, v] = l.split(","); if (v && v !== "." && v.trim() !== "") (tb.get(d!.slice(0, 7)) ?? tb.set(d!.slice(0, 7), []).get(d!.slice(0, 7))!).push(Number(v)); }
const sp0 = loadShiller("data/sp500.csv", { cash: "zero" });
const months = sp0.dates;
const tbCash = months.map((m, k) => { if (k === 0) return 0; const xs = tb.get(months[k - 1]!); return xs ? xs.reduce((a, b) => a + b, 0) / xs.length / 100 / 12 : NaN; });
const firstOk = tbCash.findIndex((x, k) => k > 0 && Number.isFinite(x));
const spTb: Series = { ...sp0, name: "S&P T-bill", dates: sp0.dates.slice(firstOk), price: sp0.price.slice(firstOk), ret: [0, ...sp0.ret.slice(firstOk + 1)], cash: [0, ...tbCash.slice(firstOk + 1)] };
compare("S&P 500 SMA10, cash = 3-month T-bill, OOS of Phase 2", spTb, 10, 0.001, 1, "1980-01", "2023-06", 120, 1, "cash");
compare("S&P 500 SMA10, cash = 3-month T-bill, 1955-2023", spTb, 10, 0.001, 1, "1955-01", "2023-06", 120, 1, "cash");

// SPY (Yahoo, adjusted, month-end closes, lag 0 because month-end prices are known at the close), 1993-2026, cash = T-bill
const spyRows = readFileSync(`${B}/yahoo/SPY.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const me = new Map<string, number>(); for (const [d, , a] of spyRows) me.set(d!.slice(0, 7), Number(a));
const sm = [...me.keys()].sort().filter((m) => m < "2026-10");
const spy: Series = { name: "SPY", dates: sm, price: sm.map((m) => me.get(m)!), ret: sm.map((m, k) => (k ? me.get(m)! / me.get(sm[k - 1]!)! - 1 : 0)), cash: sm.map((m, k) => { if (!k) return 0; const xs = tb.get(sm[k - 1]!) ?? tb.get(sm[k - 2]!)!; return xs.reduce((a, b) => a + b, 0) / xs.length / 100 / 12; }), periodsPerYear: 12 };
compare("SPY month-end SMA10, cash = T-bill (newer data up to 2026-09)", spy, 10, 0.001, 0, "1994-01", "2026-09", 120, 1, "cash");

// BTC, SMA100, cost 0.2%, lag 1, cash 0 (as Phase 2); fresh data to 2026-10-08
const btc = loadCoinMetrics(`${B}/coinmetrics/btc.csv`, "BTC");
compare("BTC SMA100, OOS of Phase 2 extended to 2026-10", btc, 100, 0.002, 1, "2021-01-01", "2026-12-31", 1095, 30, "none");
compare("BTC SMA100, from 2014", btc, 100, 0.002, 1, "2014-01-01", "2026-12-31", 1095, 30, "none");
compare("BTC SMA100, only the days after the Phase 2 data ended (new data)", btc, 100, 0.002, 1, "2026-05-24", "2026-12-31", 99999, 1, "none");
