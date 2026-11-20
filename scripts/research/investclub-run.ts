// experiments/investclub-preregistration.md - runs S1 (Weinstein) and S2 (Kullamägi) on the `universe` branch data.
// Needs: git worktree add data/universe origin/universe ; data/branch (daily SPY).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { mulberry32 } from "../../src/evaluate.js";
import { buildMarket, perfOf, runS1, runS2, s1Prepare, s2Prepare, splitAtJumps, type Market, type Result } from "../../src/investclub/core.js";

const U = "data/universe";
const spyRows = readFileSync("data/branch/daily/alpaca/SPY.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const days = spyRows.map((r) => r[0]!), spy = spyRows.map((r) => Number(r[4]));
const status0 = new Map(readFileSync(`${U}/assets.csv`, "utf8").trim().split("\n").slice(1).map((l) => { const p = l.split(","); return [p[0]!, p[2]!] as const; }));
const status = { get: (k: string) => status0.get(k.split("#")[0]!) };
const raw = readdirSync(`${U}/daily`).map((f) => {
  const rows = gunzipSync(readFileSync(`${U}/daily/${f}`)).toString().trim().split("\n").slice(1).map((l) => l.split(","));
  return { sym: f.replace(".csv.gz", ""), d: rows.map((r) => r[0]!), o: rows.map((r) => +r[1]!), h: rows.map((r) => +r[2]!), l: rows.map((r) => +r[3]!), c: rows.map((r) => +r[4]!), v: rows.map((r) => +r[5]!) };
});
const CLEAN = process.env.CLEAN === "1";
const m: Market = buildMarket(days, spy, CLEAN ? raw.flatMap((r) => splitAtJumps(r)) : raw);
const start = days.findIndex((d) => d >= "2016-01-04"), end = days.length - 1, mid = days.findIndex((d) => d >= "2021-01-01");
const inactive = m.stocks.filter((s) => status.get(s.sym) === "inactive").length;
const out: string[] = [];
const say = (s = "") => { console.log(s); out.push(s); };
say(`# Investclub test: Stage Analysis (Weinstein) and Kullamägi breakouts${CLEAN ? " — CLEANED data (histories split at >5x one-day jumps)" : ""}`);
say();
say(`Rules: experiments/investclub-preregistration.md. Data: ${m.stocks.length} stocks (${inactive} delisted / inactive), ${days[start]} .. ${days[end]}; SPY calendar.`);

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
function row(name: string, eq: ArrayLike<number>) {
  const a = perfOf(eq, start, end), p1 = perfOf(eq, start, mid - 1), p2 = perfOf(eq, mid - 1, end);
  return { name, a, line: `| ${name} | ${pct(a.cagr)} | ${a.sharpe.toFixed(2)} | ${pct(a.maxDD)} | ${pct(p1.cagr)} · ${p1.sharpe.toFixed(2)} | ${pct(p2.cagr)} · ${p2.sharpe.toFixed(2)} |` };
}
// benchmarks
const spyEq = Float64Array.from(spy);
const ew = new Float64Array(days.length).fill(NaN);
{
  const dv = m.stocks.map((s) => { const x = Array.from(s.c, (c, i) => c * s.v[i]!); const o = new Float64Array(x.length).fill(NaN); let t = 0; for (let i = 0; i < x.length; i++) { t += x[i]!; if (i >= 50) t -= x[i - 50]!; if (i >= 49) o[i] = t / 50; } return o; });
  ew[start] = 1;
  for (let d = start + 1; d <= end; d++) {
    let sum = 0, n = 0;
    m.stocks.forEach((s, k) => { const i = m.at[k]![d]!, j = m.at[k]![d - 1]!; if (i > 0 && j === i - 1 && dv[k]![j]! >= 20e6) { sum += s.c[i]! / s.c[j]! - 1; n++; } });
    ew[d] = ew[d - 1]! * (1 + (n ? sum / n : 0));
  }
}
const bS = row("SPY (buy and hold)", spyEq), bE = row("all liquid stocks, equal weight", ew);

function tradeStats(r: Result) {
  const t = r.trades.filter((x) => x.entryDay >= start), w = t.filter((x) => x.ret > 0), l = t.filter((x) => x.ret <= 0);
  const avg = (a: { ret: number }[]) => (a.length ? a.reduce((p, q) => p + q.ret, 0) / a.length : 0);
  const hold = t.reduce((p, q) => p + (q.exitDay - q.entryDay), 0) / Math.max(1, t.length);
  const dead = t.filter((x) => status.get(x.sym) === "inactive").length;
  return `${t.length} trades, ${pct(w.length / Math.max(1, t.length))} winners, average win ${pct(avg(w))}, average loss ${pct(avg(l))}, average hold ${hold.toFixed(0)} days, ${dead} trades in delisted stocks; best: ${t.slice().sort((a, b) => b.ret - a.ret).slice(0, 3).map((x) => `${x.sym} ${pct(x.ret)}`).join(", ")}`;
}
function bootVsSpy(eq: ArrayLike<number>, seed: number): number {
  const a = perfOf(eq, start, end).rets, b = perfOf(spyEq, start, end).rets, n = Math.min(a.length, b.length), rnd = mulberry32(seed);
  let win = 0;
  const sh = (x: number[]) => { const mu = x.reduce((p, q) => p + q, 0) / x.length; return mu / Math.sqrt(x.reduce((p, q) => p + (q - mu) ** 2, 0) / (x.length - 1)); };
  for (let k = 0; k < 2000; k++) { const xa: number[] = [], xb: number[] = []; for (let i = 0; i < n; i++) { const j = Math.floor(rnd() * n); xa.push(a[j]!); xb.push(b[j]!); } if (sh(xa) > sh(xb)) win++; }
  return win / 2000;
}

const verdicts: string[] = [];
function evaluate(name: string, base: Result, hiCost: Result, randoms: Result[], extra: string[]) {
  const r = row(`**${name}**, 0.10% per side`, base.equity), h = row(`${name}, 0.30% per side`, hiCost.equity);
  const rs = randoms.map((x) => perfOf(x.equity, start, end).sharpe), beat = rs.filter((s) => r.a.sharpe > s).length;
  const rc = randoms.map((x) => perfOf(x.equity, start, end).cagr).sort((a, b) => a - b);
  const p1 = perfOf(base.equity, start, mid - 1), p2 = perfOf(base.equity, mid - 1, end), boot = bootVsSpy(base.equity, 7);
  say(); say(`## ${name}`); say();
  say(`| Portfolio | Annual | Sharpe | Max drawdown | 2016–2020: annual · Sharpe | 2021–2026: annual · Sharpe |`);
  say(`| --- | --- | --- | --- | --- | --- |`);
  for (const x of [r, h, bS, bE]) say(x.line);
  say(); say(`- ${tradeStats(base)}; on average ${(base.held ?? 0).toFixed(1)} positions held`);
  say(`- Random control (${randoms.length} repeats, same exits and sizing): median annual ${pct(rc[Math.floor(rc.length / 2)]!)} (5%–95%: ${pct(rc[Math.floor(0.05 * rc.length)]!)} … ${pct(rc[Math.floor(0.95 * rc.length)]!)}); the strategy has the better Sharpe in **${beat} of ${randoms.length}**.`);
  say(`- Bootstrap (2,000, daily returns paired with SPY): Sharpe above SPY in ${pct(boot)} of runs.`);
  for (const e of extra) say(`- ${e}`);
  const checks = { "beats SPY (annual and Sharpe)": r.a.cagr > bS.a.cagr && r.a.sharpe > bS.a.sharpe, "beats random >= 95/100": beat >= 95, "positive in both periods": p1.cagr > 0 && p2.cagr > 0, "above SPY at 0.30%": h.a.cagr > bS.a.cagr };
  const go = Object.values(checks).every(Boolean);
  say(`- Checks: ${Object.entries(checks).map(([k, v]) => `${k} ${v ? "✓" : "✗"}`).join("; ")} → **${go ? "GO" : "STOP"}**`);
  verdicts.push(`${name}: ${go ? "GO" : "STOP"}`);
}

// S1
const P1 = s1Prepare(m);
const nSig1 = P1.sigs.reduce((a, x, w) => a + (P1.W.last[w]! >= start ? x.length : 0), 0);
const rnd1 = (seed: number) => { const r = mulberry32(seed); return (w: number, n: number) => { const p = P1.pool[w]!; const a = [...p]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a.slice(0, n); }; };
evaluate("S1 Weinstein Stage 2 breakout", runS1(m, P1, 0.001, start), runS1(m, P1, 0.003, start), Array.from({ length: 100 }, (_, k) => runS1(m, P1, 0.001, start, rnd1(k + 1))), [`${nSig1} signals in the test period (more than free slots are skipped)`]);

// S2
const P2 = s2Prepare(m);
const nSig2 = P2.sig.reduce((a, x, d) => a + (d >= start ? x.length : 0), 0);
const rnd2 = (seed: number) => { const r = mulberry32(seed); return (d: number, n: number) => { const a = [...P2.pool[d]!]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a.slice(0, n); }; };
evaluate("S2 Kullamägi breakout", runS2(m, P2, 0.001, start), runS2(m, P2, 0.003, start), Array.from({ length: 100 }, (_, k) => runS2(m, P2, 0.001, start, rnd2(k + 1))), [`${nSig2} signal-days × stocks in the test period; a trade needs the next day's high above the 10-day high`]);

{
  const o = runS2(m, P2, 0.001, start, undefined, false), a = perfOf(o.equity, start, end), p1 = perfOf(o.equity, start, mid - 1), p2 = perfOf(o.equity, mid - 1, end);
  say(); say(`- **S2 optimistic bound** (no stop on the entry day: as if every entry-day low came before the breakout): annual ${pct(a.cagr)}, Sharpe ${a.sharpe.toFixed(2)}, max drawdown ${pct(a.maxDD)}; 2016–2020 ${pct(p1.cagr)}, 2021–2026 ${pct(p2.cagr)}`);
}
say(); say(`## Verdict`); say(); for (const v of verdicts) say(`- ${v}`);
writeFileSync(CLEAN ? "reports/investclub-clean.md" : "reports/investclub.md", out.join("\n") + "\n");
