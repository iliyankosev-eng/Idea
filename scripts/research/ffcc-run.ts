// experiments/ffcc-failed-auction-preregistration.md
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../../src/data/intraday.js";
import { mulberry32 } from "../../src/evaluate.js";
import { COST_PER_SHARE as C } from "../../src/daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../../src/intraday/sessions.js";
import { sessionTrades, type FOpts, type FTrade } from "../../src/social/ffcc.js";

const D = "data/branch", cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const data: Record<string, Session[]> = {};
for (const sym of ["QQQ", "SPY"]) data[sym] = completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-11", "alpaca"), cal), cal).kept;
const out: string[] = [];
const say = (s = "") => { console.log(s); out.push(s); };
const run = (o: FOpts) => Object.fromEntries(Object.entries(data).map(([k, ss]) => [k, ss.flatMap((s) => sessionTrades(s, o))])) as Record<string, FTrade[]>;
const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
function boot(r: number[], seed: number) { const rnd = mulberry32(seed), m: number[] = []; for (let k = 0; k < 10000; k++) { let s = 0; for (let i = 0; i < r.length; i++) s += r[Math.floor(rnd() * r.length)]!; m.push(s / r.length); } m.sort((a, b) => a - b); return [m[250]!, m[9750]!]; }
const line = (name: string, t: FTrade[]) => {
  const r = t.map((x) => x.r), early = t.filter((x) => x.date < "2021").map((x) => x.r), late = t.filter((x) => x.date >= "2021").map((x) => x.r);
  return `| ${name} | ${t.length} | ${(100 * r.filter((x) => x > 0).length / Math.max(1, r.length)).toFixed(0)}% | ${mean(r).toFixed(3)} | ${mean(early).toFixed(3)} | ${mean(late).toFixed(3)} | ${r.reduce((p, q) => p + q, 0).toFixed(0)} |`;
};
say("# FFCC Failed Auction Model — test on QQQ and SPY (New York session, 2016-01 .. 2026-11)");
say(); say(`Rules: experiments/ffcc-failed-auction-preregistration.md. Sessions: QQQ ${data.QQQ!.length}, SPY ${data.SPY!.length}. Cost $${C} per share and side.`);
say(); say("| Version | Trades | Winners | Mean R | 2016–2020 | 2021–2026 | Sum R |"); say("| --- | --- | --- | --- | --- | --- | --- |");
const M: FOpts = { len: 5, target: "1.5R", stop: "extreme", cost: C };
const main = run(M), pooled = [...main.QQQ!, ...main.SPY!];
say(line("**Main: 5-min, stop above the extreme, 1.5R — QQQ**", main.QQQ!));
say(line("**Main — SPY**", main.SPY!));
say(line("**Main — both**", pooled));
const variants: [string, FOpts][] = [["Target = POC", { ...M, target: "POC" }], ["Stop = displacement candle range", { ...M, stop: "candle" }], ["1-minute candles", { ...M, len: 1 }], ["15-minute candles", { ...M, len: 15 }], ["Main without costs", { ...M, cost: 0 }]];
for (const [n, o] of variants) { const r = run(o); say(line(`${n} — both`, [...r.QQQ!, ...r.SPY!])); }
const [lo, hi] = boot(pooled.map((x) => x.r), 11);
const rnd = Array.from({ length: 100 }, (_, k) => { const g = mulberry32(k + 1), r = run({ ...M, flip: () => g() < 0.5 }); return mean([...r.QQQ!, ...r.SPY!].map((x) => x.r)); });
const beat = rnd.filter((x) => mean(pooled.map((t) => t.r)) > x).length;
say(); say(`- Bootstrap 95% interval of the mean R (both): ${lo.toFixed(3)} … ${hi.toFixed(3)}`);
say(`- Random direction (100 repeats, same entries/stops/targets mirrored): median mean R ${[...rnd].sort((a, b) => a - b)[50]!.toFixed(3)}; the model is better in **${beat} of 100**.`);
const days = data.QQQ!.length + data.SPY!.length;
say(`- Trades per session: ${(pooled.length / days).toFixed(2)}; average risk (entry to stop): QQQ $${mean(main.QQQ!.map((x) => Math.abs(x.entry - x.stop))).toFixed(2)}, SPY $${mean(main.SPY!.map((x) => Math.abs(x.entry - x.stop))).toFixed(2)}; exits: target ${pooled.filter((x) => x.exit === x.target).length}, stop ${pooled.filter((x) => x.exit === x.stop).length}, 15:55 ${pooled.filter((x) => x.exit !== x.target && x.exit !== x.stop).length}.`);
const m = mean(pooled.map((x) => x.r)), mq = mean(main.QQQ!.map((x) => x.r)), ms = mean(main.SPY!.map((x) => x.r));
const e = mean(pooled.filter((x) => x.date < "2021").map((x) => x.r)), l = mean(pooled.filter((x) => x.date >= "2021").map((x) => x.r));
const checks = { "QQQ > 0": mq > 0, "SPY > 0": ms > 0, "bootstrap low > 0": lo > 0, "beats random >= 95/100": beat >= 95, "2016–2020 > 0": e > 0, "2021–2026 > 0": l > 0 };
say(`- Checks: ${Object.entries(checks).map(([k, v]) => `${k} ${v ? "✓" : "✗"}`).join("; ")} → **${Object.values(checks).every(Boolean) ? "GO" : "STOP"}** (mean ${m.toFixed(3)}R)`);
writeFileSync("reports/ffcc-failed-auction.md", out.join("\n") + "\n");
