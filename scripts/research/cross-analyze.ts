// Analysis for experiments/cross-instrument-preregistration.md (reads reports/cross-instrument.json).
import { readFileSync, writeFileSync } from "node:fs";
import { bootstrapByDay, bootstrapTotal } from "../../src/pm/common.js";

type Pt = { day: string; r: number };
const { res, notes } = JSON.parse(readFileSync("reports/cross-instrument.json", "utf8")) as { res: Record<string, Record<string, Pt[]>>; notes: string[] };
const ORIG: Record<string, string[]> = { DT1: ["SPY", "QQQ"], DT2: ["QQQ"], DT3: ["QQQ"], "DT3-bot": ["QQQ"], DT4: ["SPY"], DT7: ["SPY", "QQQ"], DT8: ["SPY", "QQQ"], N1: ["SPY", "QQQ"], FFCC: ["SPY", "QQQ"], "Range A": ["QQQ"], "Range B": ["QQQ"], Silvio: ["QQQ", "DIA"], Fib: ["QQQ", "GLD"], "First candle": ["SPY", "QQQ", "IWM", "GLD"] };
const DAILY = new Set(["DT1", "DT2", "DT3", "DT3-bot", "DT4", "DT7", "DT8", "N1"]);
const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const half = (x: Pt[], early: boolean) => x.filter((p) => (p.day < "2021-01-01") === early);
const stat = (st: string, x: Pt[]) => {
  const r = x.map((p) => p.r), boot = x.length ? (DAILY.has(st) ? bootstrapByDay(x) : bootstrapTotal(x)) : NaN; // R: day sums, so the sign matches the per-trade mean
  if (DAILY.has(st)) return { main: 252 * mean(r), sharpe: (mean(r) / sd(r)) * Math.sqrt(252), boot, e: 252 * mean(half(x, true).map((p) => p.r)), l: 252 * mean(half(x, false).map((p) => p.r)), n: r.filter((v) => v !== 0).length };
  return { main: mean(r), sharpe: NaN, boot, e: mean(half(x, true).map((p) => p.r)), l: mean(half(x, false).map((p) => p.r)), n: r.length };
};
const fmtMain = (st: string, v: number) => (DAILY.has(st) ? `${(100 * v).toFixed(1)}%/y` : `${v >= 0 ? "+" : ""}${v.toFixed(3)}R`);
// ---- all single tests + Holm
type Row = { st: string; sym: string; s: ReturnType<typeof stat>; p: number; holm?: boolean };
const rows: Row[] = [];
for (const [st, bySym] of Object.entries(res)) for (const [sym, x] of Object.entries(bySym)) { const s = stat(st, x); rows.push({ st, sym, s, p: 1 - s.boot }); }
const sorted = rows.filter((r) => Number.isFinite(r.p)).sort((a, b) => a.p - b.p);
let stop = false;
sorted.forEach((r, i) => { if (stop) { r.holm = false; return; } if (r.p <= 0.05 / (sorted.length - i)) r.holm = true; else { r.holm = false; stop = true; } });
// ---- pooled over new instruments
const out: string[] = [];
const say = (s = "") => out.push(s);
say("# Every earlier strategy on 18 instruments"); say();
say(`Rules: experiments/cross-instrument-preregistration.md. ${rows.length} single tests; Holm correction at 5%. Daily-return strategies in % per year (all days, net); per-trade strategies in R per trade (net).`);
say();
const verdicts: string[] = [];
for (const st of Object.keys(ORIG)) {
  const bySym = res[st] ?? {}, newSyms = Object.keys(bySym).filter((s) => !ORIG[st]!.includes(s));
  let pooled: Pt[];
  if (DAILY.has(st)) { const by = new Map<string, number[]>(); for (const s of newSyms) for (const p of bySym[s]!) (by.get(p.day) ?? by.set(p.day, []).get(p.day)!).push(p.r); pooled = [...by.entries()].sort().map(([day, v]) => ({ day, r: mean(v) })); }
  else pooled = newSyms.flatMap((s) => bySym[s]!);
  const P = stat(st, pooled), pos = newSyms.filter((s) => stat(st, bySym[s]!).main > 0).length;
  const yes = P.main > 0 && P.boot >= 0.95 && P.e > 0 && P.l > 0 && pos >= (2 / 3) * newSyms.length;
  verdicts.push(`- **${st}**: ${yes ? "YES, holds on other markets" : "NO"} — new instruments together ${fmtMain(st, P.main)} (bootstrap ${(100 * P.boot).toFixed(0)}%; 2016–2020 ${fmtMain(st, P.e)}, 2021–2026 ${fmtMain(st, P.l)}); positive on ${pos} of ${newSyms.length}`);
  say(`## ${st}`); say();
  say(`Original: ${ORIG[st]!.join(", ")}. New instruments together: ${fmtMain(st, P.main)}${DAILY.has(st) ? `, Sharpe ${P.sharpe.toFixed(2)}` : ""}, bootstrap ${(100 * P.boot).toFixed(0)}%, 2016–2020 ${fmtMain(st, P.e)}, 2021–2026 ${fmtMain(st, P.l)}; positive on ${pos} of ${newSyms.length}. **${yes ? "Holds" : "Does not hold"}.**`);
  say();
  for (const sym of Object.keys(bySym)) {
    const r = rows.find((x) => x.st === st && x.sym === sym)!;
    say(`- ${sym}${ORIG[st]!.includes(sym) ? " (original)" : ""}: ${fmtMain(st, r.s.main)}${DAILY.has(st) ? ` · Sharpe ${r.s.sharpe.toFixed(2)}` : ""} · ${r.s.n} trades · bootstrap ${(100 * r.s.boot).toFixed(0)}% · halves ${fmtMain(st, r.s.e)} / ${fmtMain(st, r.s.l)}${r.holm ? " · **survives Holm**" : ""}`);
  }
  say();
}
say("## Verdict"); say(); for (const v of verdicts) say(v);
say(); say("Single results that survive the Holm correction and are positive in both halves:");
const sig = rows.filter((r) => r.holm && r.s.e > 0 && r.s.l > 0);
say(sig.length ? sig.map((r) => `- ${r.st} on ${r.sym}${ORIG[r.st]!.includes(r.sym) ? " (original)" : ""}: ${fmtMain(r.st, r.s.main)}`).join("\n") : "- none");
say(); say("## Data notes"); say(); for (const n of notes) say(`- ${n}`);
writeFileSync("reports/cross-instrument.md", out.join("\n") + "\n");
console.log(verdicts.join("\n")); console.log(sig.map((r) => `${r.st} ${r.sym} ${fmtMain(r.st, r.s.main)}`).join("\n"));
