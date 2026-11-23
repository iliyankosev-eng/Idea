// experiments/range-bot-preregistration.md - does "3-month backtest + Monte Carlo" predict passing a prop eval?
import { loadMinuteBars } from "../../src/data/intraday.js";
import { mulberry32 } from "../../src/evaluate.js";
import { COST_PER_SHARE as C } from "../../src/daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions } from "../../src/intraday/sessions.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const ss = completeSessions(toSessions(loadMinuteBars(D, "QQQ", "2016-01", "2026-09", "alpaca"), cal), cal).kept;

export { rangeTrade } from "../../src/social/rangebot.js";
import { rangeTrade } from "../../src/social/rangebot.js";

/** Topstep-50K-like eval on a sequence of R results: +1 pass, -1 fail, 0 undecided. */
export function evalRun(rs: readonly number[], riskUsd = 400, target = 3000, mll = 2000): number {
  let bal = 0, peak = 0;
  for (const r of rs) {
    bal += r * riskUsd; peak = Math.max(peak, bal);
    if (bal >= target) return 1;
    if (bal <= Math.min(peak - mll, 0)) return -1;
  }
  return 0;
}
function mcPass(rs: readonly number[], seed: number, n = 10000): number {
  const rnd = mulberry32(seed); let pass = 0;
  for (let k = 0; k < n; k++) { const seq = Array.from({ length: 300 }, () => rs[Math.floor(rnd() * rs.length)]!); if (evalRun(seq) === 1) pass++; }
  return pass / n;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
for (const [name, tgt, stp] of [["A 1:1", 0.5, 0.5], ["B high win rate", 0.25, 0.75]] as const) {
  const byDay = new Map<string, number>();
  for (const s of ss) { const t = rangeTrade(s, tgt, stp); if (t) byDay.set(s.date, t.r); }
  const days = ss.map((s) => s.date), all = [...byDay.values()];
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  console.log(`\n=== ${name}: ${all.length} trades on ${days.length} days, win rate ${pct(all.filter((x) => x > 0).length / all.length)}, average ${avg.toFixed(3)}R, total ${all.reduce((a, b) => a + b, 0).toFixed(1)}R`);
  // 63-day windows stepping 21 days (monthly)
  const rows: { start: string; sum: number; n: number; win: number; mc: number; next: number; nextSum: number }[] = [];
  for (let a = 0; a + 126 <= days.length; a += 21) {
    const w = days.slice(a, a + 63).map((d) => byDay.get(d)).filter((x): x is number => x !== undefined);
    const nx = days.slice(a + 63, a + 126).map((d) => byDay.get(d)).filter((x): x is number => x !== undefined);
    if (w.length < 10) continue;
    rows.push({ start: days[a]!, sum: w.reduce((p, q) => p + q, 0), n: w.length, win: w.filter((x) => x > 0).length / w.length, mc: mcPass(w, a + 1, 2000), next: evalRun(nx), nextSum: nx.reduce((p, q) => p + q, 0) });
  }
  const best = rows.reduce((p, q) => (q.sum > p.sum ? q : p));
  console.log(`best 3-month window from ${best.start}: ${best.n} trades, win rate ${pct(best.win)}, ${best.sum.toFixed(1)}R = $${(best.sum * 400).toFixed(0)} at $400 risk, Monte Carlo pass ${pct(mcPass(best.n ? days.slice(days.indexOf(best.start), days.indexOf(best.start) + 63).map((d) => byDay.get(d)).filter((x): x is number => x !== undefined) : [], 7))}`);
  console.log(`  the next 3 months traded for real: ${best.next === 1 ? "PASS" : best.next === -1 ? "FAIL" : "undecided"}, ${best.nextSum.toFixed(1)}R`);
  const hi = rows.filter((r) => r.mc >= 0.9);
  const real = hi.filter((r) => r.next === 1).length, fail = hi.filter((r) => r.next === -1).length;
  console.log(`windows with Monte Carlo pass >= 90%: ${hi.length} of ${rows.length}; average MC ${pct(hi.reduce((p, q) => p + q.mc, 0) / Math.max(1, hi.length))}; next 3 months for real: ${real} pass, ${fail} fail, ${hi.length - real - fail} undecided -> real pass rate ${pct(real / Math.max(1, hi.length))}`);
  console.log(`all windows: real pass rate when starting the eval at a random month ${pct(rows.filter((r) => r.next === 1).length / rows.length)}`);
}
