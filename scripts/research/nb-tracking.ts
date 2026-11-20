// Noise-band tracking check: the bot's live decisions and fills vs a replay of the backtest logic on SIP minute bars.
// Usage: npx tsx scripts/research/nb-tracking.ts 2026-11-12 2026-11-13 ...   (needs origin/botlog fetched)
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { nbLeverage, noiseBand } from "../../src/bot/logic.js";
import { barAtOrAfter, barBefore, vwapBefore } from "../../src/daytrade/dt.js";
import { loadMinuteBars } from "../../src/data/intraday.js";
import { completeSessions, loadCalendar, toSessions } from "../../src/intraday/sessions.js";

const D = "data/branch", dates = process.argv.slice(2);
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const ss = completeSessions(toSessions(loadMinuteBars(D, "QQQ", "2026-08", "2026-11", "alpaca"), cal), cal).kept;
const out: string[] = ["# Noise band: live bot vs backtest replay", "", `Days: ${dates.join(", ")} (SIP minute bars available up to ${ss.at(-1)!.date}).`, ""];
out.push("| Day | Checks | Same decision | Live trades | Live $ | Live % of NB capital | Backtest % (same rules, no costs) | Backtest – live |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
let sumLive = 0, sumBt = 0;
const timing: number[] = [];
for (const date of dates) {
  const log = execSync(`git show origin/botlog:${date}.log`).toString().split("\n");
  const nb = new Map<number, { want: number; price: number; ub: number; lb: number; vwap: number; lev: number; qty: number }>();
  for (const l of log) { const k = l.match(/\[nb\] NB (\d\d):(\d\d): (\{.*?\});/); if (k) nb.set(+k[1]! * 60 + +k[2]!, JSON.parse(k[3]!)); }
  const fills = new Map<string, { side: string; qty: number; px: number }>();
  for (const l of log) { const k = l.match(/fill (\S+) QQQM (buy|sell) (\d+) @ ([\d.]+)/); if (k && k[1]!.startsWith(date)) fills.set(k[1]!, { side: k[2]!, qty: +k[3]!, px: +k[4]! }); }
  const eqLine = log.find((l) => l.includes("[check] paper account"))?.match(/equity ([\d.]+)/);
  const d = ss.findIndex((s) => s.date === date);
  if (d < 15) { out.push(`| ${date} | no minute data yet | | | | | | |`); continue; }
  const s = ss[d]!, past = ss.slice(d - 15, d), closes = past.map((p) => p.c[p.c.length - 1]!);
  const q = nbLeverage(closes, 2); // leverage on the NB capital
  let pos = 0, pnl = 0, same = 0, checks = 0;
  for (let m = 600; m <= 930; m += 30) {
    const pastMoves = past.slice(1).flatMap((p) => { const i = p.minute.indexOf(m - 1); return i >= 0 ? [Math.abs(p.c[i]! / p.o[0]! - 1)] : []; });
    const r = noiseBand({ open: s.o[0]!, prevClose: closes[14]!, pastMoves, price: s.c[barBefore(s, m)]!, vwap: vwapBefore(s, m) });
    if (!r) continue;
    const live = nb.get(m);
    if (live) { checks++; if (live.want === r.want) same++; else console.error(`MISMATCH ${date} ${m}: live ${JSON.stringify(live)} replay ${JSON.stringify({ ...r, price: s.c[barBefore(s, m)], vwap: vwapBefore(s, m) })}`); }
    const exec = s.o[barAtOrAfter(s, m)]!;
    if (r.want !== pos) { pnl -= (r.want - pos) * exec * (q / s.o[0]!); if (live) timing.push((live.price / exec - 1) * 1e4 * (r.want - pos > 0 ? 1 : -1)); pos = r.want; }
  }
  if (pos) { const j = s.minute.indexOf(955); pnl += pos * (j >= 0 ? s.o[j]! : s.c.at(-1)!) * (q / s.o[0]!); }
  let cash = 0, trades = 0;
  for (const f of fills.values()) { cash += (f.side === "sell" ? 1 : -1) * f.qty * f.px; if (f.side === "sell") trades++; }
  const cap = 0.25 * (eqLine ? +eqLine[1]! : 100000), livePct = cash / cap;
  sumLive += livePct; sumBt += pnl;
  out.push(`| ${date} | ${checks} | ${same}/${checks} | ${fills.size / 2} | ${cash.toFixed(0)} | ${(100 * livePct).toFixed(2)}% | ${(100 * pnl).toFixed(2)}% | ${(100 * (pnl - livePct)).toFixed(2)} pts |`);
}
out.push("", `Total: live ${(100 * sumLive).toFixed(2)}% of NB capital, backtest replay ${(100 * sumBt).toFixed(2)}% (before costs).`);
if (timing.length) out.push(`Timing: the bot's decision price (QQQ last trade at HH:MM:00) vs the backtest's execution price (open of minute HH:MM), signed so that positive = worse for the bot: average ${(timing.reduce((a, b) => a + b, 0) / timing.length).toFixed(1)} bp over ${timing.length} orders.`);
console.log(out.join("\n"));
writeFileSync("reports/nb-tracking.md", out.join("\n") + "\n");
