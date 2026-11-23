// FFCC Failed Auction Model, main version, on other symbols (follow-up question 23.11.2026; same pre-registered rules).
import { appendFileSync } from "node:fs";
import { loadMinuteBars } from "../../src/data/intraday.js";
import { mulberry32 } from "../../src/evaluate.js";
import { COST_PER_SHARE as C } from "../../src/daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions } from "../../src/intraday/sessions.js";
import { sessionTrades, type FOpts } from "../../src/social/ffcc.js";
const D = "data/branch", cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const M: FOpts = { len: 5, target: "1.5R", stop: "extreme", cost: C };
const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
const lines = ["", "## Other symbols (main version, same rules)", "", "| Symbol | Trades | Winners | Mean R | 95% interval | 2016–2020 | 2021–2026 | Better than random direction |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
for (const sym of process.argv.slice(2)) {
  const ss = completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-10", "alpaca"), cal), cal).kept;
  const t = ss.flatMap((s) => sessionTrades(s, M)), r = t.map((x) => x.r);
  const rnd = mulberry32(3), bm: number[] = [];
  for (let k = 0; k < 10000; k++) { let s = 0; for (let i = 0; i < r.length; i++) s += r[Math.floor(rnd() * r.length)]!; bm.push(s / r.length); }
  bm.sort((a, b) => a - b);
  const rr = Array.from({ length: 100 }, (_, k) => { const g = mulberry32(k + 1); return mean(ss.flatMap((s) => sessionTrades(s, { ...M, flip: () => g() < 0.5 })).map((x) => x.r)); });
  const line = `| ${sym} | ${t.length} | ${(100 * r.filter((x) => x > 0).length / r.length).toFixed(0)}% | ${mean(r).toFixed(3)} | ${bm[250]!.toFixed(3)} … ${bm[9750]!.toFixed(3)} | ${mean(t.filter((x) => x.date < "2021").map((x) => x.r)).toFixed(3)} | ${mean(t.filter((x) => x.date >= "2021").map((x) => x.r)).toFixed(3)} | ${rr.filter((x) => mean(r) > x).length}/100 |`;
  console.log(line); lines.push(line);
}
appendFileSync("reports/ffcc-failed-auction.md", lines.join("\n") + "\n");
