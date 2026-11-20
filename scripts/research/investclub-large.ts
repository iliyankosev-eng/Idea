// Descriptive (NOT pre-registered): S1 / S2 on larger stocks only (50-day dollar volume >= $100M / $300M), cleaned data.
import { readdirSync, readFileSync, appendFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { buildMarket, perfOf, runS1, runS2, s1Prepare, s2Prepare, splitAtJumps } from "../../src/investclub/core.js";
const U = "data/universe";
const spyRows = readFileSync("data/branch/daily/alpaca/SPY.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const days = spyRows.map((r) => r[0]!), spy = spyRows.map((r) => Number(r[4]));
const raw = readdirSync(`${U}/daily`).map((f) => { const rows = gunzipSync(readFileSync(`${U}/daily/${f}`)).toString().trim().split("\n").slice(1).map((l) => l.split(",")); return { sym: f.replace(".csv.gz", ""), d: rows.map((r) => r[0]!), o: rows.map((r) => +r[1]!), h: rows.map((r) => +r[2]!), l: rows.map((r) => +r[3]!), c: rows.map((r) => +r[4]!), v: rows.map((r) => +r[5]!) }; });
const m = buildMarket(days, spy, raw.flatMap((r) => splitAtJumps(r)));
const start = days.findIndex((d) => d >= "2016-01-04"), end = days.length - 1, mid = days.findIndex((d) => d >= "2021-01-01");
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const lines = ["", "## Descriptive, not pre-registered: only larger stocks (cleaned data, 0.10% per side)", "", "| Variant | Annual | Sharpe | Max drawdown | 2016–2020 | 2021–2026 | Trades |", "| --- | --- | --- | --- | --- | --- | --- |"];
for (const liq of [100e6, 300e6]) {
  const r1 = runS1(m, s1Prepare(m, liq), 0.001, start), P2 = s2Prepare(m, liq);
  for (const [name, r] of [[`S1, dollar volume >= $${liq / 1e6}M`, r1], [`S2, dollar volume >= $${liq / 1e6}M`, runS2(m, P2, 0.001, start)], [`S2 optimistic bound, >= $${liq / 1e6}M`, runS2(m, P2, 0.001, start, undefined, false)]] as const) {
    const a = perfOf(r.equity, start, end), p1 = perfOf(r.equity, start, mid - 1), p2 = perfOf(r.equity, mid - 1, end);
    lines.push(`| ${name} | ${pct(a.cagr)} | ${a.sharpe.toFixed(2)} | ${pct(a.maxDD)} | ${pct(p1.cagr)} | ${pct(p2.cagr)} | ${r.trades.filter((t) => t.entryDay >= start).length} |`);
  }
}
console.log(lines.join("\n"));
appendFileSync("reports/investclub-clean.md", lines.join("\n") + "\n");
