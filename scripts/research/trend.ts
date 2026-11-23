// experiments/trend-preregistration.md - AQR-style trend following on ETFs. Needs: git worktree add data/etf origin/etfdata
import { readFileSync, writeFileSync } from "node:fs";
import { bootstrapByDay } from "../../src/pm/common.js";
import { align, DEFAULT, runFixed, runTrend, type Month, type TrendOpts } from "../../src/trend/tsmom.js";

const ALL = ["SPY", "EFA", "TLT", "IEF", "GLD", "DBC", "UUP"];
const load = (s: string) => { const rows = readFileSync(`data/etf/alpaca/${s}.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")); return { d: rows.map((r) => r[0]!), c: rows.map((r) => +r[4]!) }; };
const series = Object.fromEntries([...ALL, "BIL"].map((s) => [s, load(s)]));
const full = align(series, "BIL");
const SETS: Record<string, string[]> = { "A (SPY, TLT, GLD)": ["SPY", "TLT", "GLD"], "B (7 ETFs)": ALL };
const VARIANTS: Record<string, Partial<TrendOpts>> = { main: {}, "12-month signal only": { signal: "12m" }, "long-only": { longOnly: true } };

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += (a[i]! - ma) * (b[i]! - mb); x += (a[i]! - ma) ** 2; y += (b[i]! - mb) ** 2; } return s / Math.sqrt(x * y); };
const comp = (r: number[]) => r.reduce((p, x) => p * (1 + x), 1) - 1;
function stats(r: number[], cash: number[], label: string[], spy: number[]) {
  const ex = r.map((x, i) => x - cash[i]!), n = r.length, h = Math.floor(n / 2);
  let eq = 1, pk = 1, dd = 0; for (const x of r) { eq *= 1 + x; pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); }
  const worst = spy.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]).slice(0, 10).map(([, i]) => r[i]!);
  const years = [...new Set(label.map((l) => l.slice(0, 4)))].map((y) => [y, comp(r.filter((_, i) => label[i]!.startsWith(y)))] as const);
  return {
    cagr: (1 + comp(r)) ** (12 / n) - 1, vol: sd(r) * Math.sqrt(12), sharpe: (mean(ex) / sd(ex)) * Math.sqrt(12), dd,
    boot: bootstrapByDay(ex.map((x, i) => ({ day: label[i]!, r: x })), 6, 5000),
    h1: 12 * mean(ex.slice(0, h)), h2: 12 * mean(ex.slice(h)), corr: corr(r, spy), worst: mean(worst), years,
  };
}
const pct = (v: number, d = 1) => `${(100 * v).toFixed(d)}%`;
const out = ["# Trend following (AQR style) on ETFs", "", "Rules: experiments/trend-preregistration.md. Alpaca daily total-return data (Stooq refused the download, so no longer history). Monthly results; Sharpe = excess return over BIL.", ""];
const verdicts: string[] = [];
let checked = false;
for (const [setName, keys] of Object.entries(SETS)) {
  const ref = runTrend(full, keys, DEFAULT);
  const label = ref.map((m) => m.start.slice(0, 7)), cash = ref.map((m) => m.cash);
  const spy = runFixed(full, { SPY: 1 }, ref);
  out.push(`## Set ${setName}`, "", `Months: ${ref.length} (${ref[0]!.start} .. ${ref.at(-1)!.end}); first half ends ${ref[Math.floor(ref.length / 2) - 1]!.end}.`, "");
  const line = (name: string, r: number[]) => {
    const s = stats(r, cash, label, spy);
    out.push(`### ${name}`, "", `- ${pct(s.cagr)} a year · volatility ${pct(s.vol)} · Sharpe ${s.sharpe.toFixed(2)} · max drawdown ${pct(s.dd)} · bootstrap ${pct(s.boot, 0)}`, `- excess over cash: first half ${pct(s.h1)}/y, second half ${pct(s.h2)}/y · correlation with SPY ${s.corr.toFixed(2)} · average in SPY's 10 worst months ${pct(s.worst)}`, `- by year: ${s.years.map(([y, v]) => `${y} ${pct(v)}`).join(", ")}`, "");
    return s;
  };
  for (const [vn, vo] of Object.entries(VARIANTS)) {
    const m: Month[] = vn === "main" ? ref : runTrend(full, keys, { ...DEFAULT, ...vo });
    if (m.length !== ref.length || m.some((x, i) => x.start !== ref[i]!.start)) throw new Error("variant months differ");
    const s = line(`Trend - ${vn}`, m.map((x) => x.r));
    if (vn === "main") {
      const gross = mean(m.map((x) => Object.values(x.w).reduce((a, w) => a + Math.abs(w), 0))), cost = 12 * mean(m.map((x) => x.cost));
      out.push(`- average gross exposure ${gross.toFixed(2)}x; costs ${pct(cost, 2)} a year; average weight: ${keys.map((k) => `${k} ${mean(m.map((x) => x.w[k]!)).toFixed(2)}`).join(", ")}`, "");
      const edge = s.sharpe >= 0.5 && s.boot >= 0.95 && s.h1 > 0 && s.h2 > 0, ins = s.corr <= 0.2 && s.worst > 0;
      verdicts.push(`- **Set ${setName}**: ${edge ? "EDGE worth a paper test" : "no proof of an edge in this period"} (Sharpe ${s.sharpe.toFixed(2)}, bootstrap ${pct(s.boot, 0)}, halves ${pct(s.h1)} / ${pct(s.h2)}); insurance: ${ins ? "YES" : "no"} (correlation ${s.corr.toFixed(2)}, SPY's 10 worst months ${pct(s.worst)})`);
    }
  }
  line("SPY held", spy);
  line("60/40 (SPY/IEF)", runFixed(full, { SPY: 0.6, IEF: 0.4 }, ref));
  line(`equal weight, long (${keys.join(", ")})`, runFixed(full, Object.fromEntries(keys.map((k) => [k, 1 / keys.length])), ref));
  if (!checked) { // dump for the independent Python check
    writeFileSync("reports/trend-dump.json", JSON.stringify(ref.map((x) => ({ s: x.start, e: x.end, r: x.r, w: x.w }))));
    checked = true;
  }
}
out.push("## Verdict", "", ...verdicts, "", "## Data check", "", ...[...ALL, "BIL"].map((s) => { const x = series[s]!; return `- ${s}: ${x.d.length} days ${x.d[0]} .. ${x.d.at(-1)}; ${pct((x.c.at(-1)! / x.c[0]!) ** (252 / (x.c.length - 1)) - 1)} a year total return`; }));
writeFileSync("reports/trend.md", out.join("\n") + "\n");
console.log(verdicts.join("\n"));
