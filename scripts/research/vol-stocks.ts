// experiments/vol-stocks-preregistration.md - DT1 / DT3-bot (primary), DT3 / DT7 (secondary) on each year's 20 most
// volatile stocks picked from the previous year. Needs: git worktree add data/voldata origin/voldata ; data/universe.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { MinuteBars } from "../../src/data/intraday.js";
import { dt1, dt3, dt3Late, type DayRet } from "../../src/daytrade/dt.js";
import { dt7 } from "../../src/daytrade/dt78.js";
import { completeSessions, loadCalendar, toSessions } from "../../src/intraday/sessions.js";
import { segments, splitDays } from "../../src/intraday/splits.js";
import { bootstrapByDay } from "../../src/pm/common.js";

const cal = loadCalendar("data/branch/daily/alpaca/calendar.csv");
const picks = JSON.parse(readFileSync("scripts/vol-picks.json", "utf8")) as Record<string, string[]>;
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const months = (y: number) => [`${y - 1}-12`, ...Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`)];
function load(sym: string, y: number): MinuteBars | null {
  const t: number[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [], v: number[] = [];
  for (const m of months(y)) {
    const p = `data/voldata/intraday/alpaca/${sym}/1m/${m}.csv.gz`;
    if (!existsSync(p)) continue;
    for (const line of gunzipSync(readFileSync(p)).toString().trim().split("\n").slice(1)) { const r = line.split(",").map(Number); t.push(r[0]!); o.push(r[1]!); h.push(r[2]!); l.push(r[3]!); c.push(r[4]!); v.push(r[5]!); }
  }
  return t.length ? { symbol: sym, t, o, h, l, c, v, missingMinutes: NaN } : null;
}
function daily(sym: string) {
  const p = `data/universe/daily/${sym}.csv.gz`;
  if (!existsSync(p)) return { date: [] as string[], c: [] as number[] };
  const rows = gunzipSync(readFileSync(p)).toString().trim().split("\n").slice(1).map((l) => l.split(","));
  return { date: rows.map((r) => r[0]!), c: rows.map((r) => +r[4]!) };
}
const COSTS = [0.0045, 0.01];
type Name = "DT1" | "DT3-bot" | "DT3" | "DT7" | "Buy and hold";
const days: Record<string, Map<string, number[]>> = {}; // key name|cost -> day -> returns
const add = (k: string, rs: DayRet[], y: number) => { const m = (days[k] ??= new Map()); for (const x of rs) if (x.day.startsWith(String(y))) (m.get(x.day) ?? m.set(x.day, []).get(x.day)!).push(x.r); };
const notes: string[] = [];
for (const [ys, syms] of Object.entries(picks)) {
  const y = +ys;
  if (!syms.length) continue;
  let got = 0;
  for (const sym of syms) {
    const b = load(sym, y);
    if (!b) { notes.push(`${y} ${sym}: no minute data`); continue; }
    const ss = completeSessions(toSessions(b, cal), cal).kept;
    if (ss.length < 20) { notes.push(`${y} ${sym}: only ${ss.length} sessions`); continue; }
    got++;
    const seg = segments(ss, splitDays(ss, daily(sym)));
    for (const cst of COSTS) {
      const per = (f: (x: typeof ss) => DayRet[]) => seg.flatMap(f);
      add(`DT1|${cst}`, per((x) => dt1(x, { dynamic: true, execNextOpen: true, cost: cst, maxLev: 2, exitMin: 955 })), y);
      add(`DT3-bot|${cst}`, per((x) => dt3Late(x, cst, 20, 2)).map((p) => (fomc.has(p.day) ? { ...p, r: 0 } : p)), y);
      add(`DT3|${cst}`, per((x) => dt3(x, cst)), y);
      add(`DT7|${cst}`, per((x) => dt7(x, cst)), y);
    }
    add("Buy and hold|0", seg.flatMap((x) => x.slice(1).map((s, i) => ({ day: s.date, r: s.c[s.c.length - 1]! / x[i]!.c[x[i]!.c.length - 1]! - 1, trades: 0 }))), y);
  }
  notes.push(`${y}: ${got} of ${syms.length} picks with data`);
}
const series = (k: string) => [...(days[k] ?? new Map()).entries()].sort().map(([day, r]) => ({ day, r: r.reduce((a, b) => a + b, 0) / r.length }));
const perf = (x: { day: string; r: number }[]) => {
  const r = x.map((p) => p.r), m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  let eq = 1, pk = 1, dd = 0; for (const v of r) { eq *= 1 + v; pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); }
  return { ann: 252 * m, sh: (m / sd) * Math.sqrt(252), dd, boot: bootstrapByDay(x) };
};
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
const out = ["# Intraday momentum on volatile stocks picked without hindsight", "", "Rules: experiments/vol-stocks-preregistration.md. Equal weight across the year's picks; % per year = 252 x mean daily return.", ""];
const verdicts: string[] = [];
for (const name of ["DT1", "DT3-bot", "DT3", "DT7", "Buy and hold"] as Name[]) {
  const k = name === "Buy and hold" ? "Buy and hold|0" : `${name}|0.0045`, x = series(k), p = perf(x);
  const e = perf(x.filter((q) => q.day < "2021")), l = perf(x.filter((q) => q.day >= "2021"));
  const years = [...new Set(x.map((q) => q.day.slice(0, 4)))].map((yy) => [yy, perf(x.filter((q) => q.day.startsWith(yy))).ann] as const);
  const hi = name === "Buy and hold" ? null : perf(series(`${name}|0.01`));
  out.push(`## ${name}`, "", `- Whole period: ${pct(p.ann)} per year · Sharpe ${p.sh.toFixed(2)} · max drawdown ${pct(p.dd)} · bootstrap ${pct(p.boot)}`, `- 2017–2020: ${pct(e.ann)} · Sharpe ${e.sh.toFixed(2)}; 2021–2026: ${pct(l.ann)} · Sharpe ${l.sh.toFixed(2)}`, `- By year: ${years.map(([yy, a]) => `${yy} ${pct(a)}`).join(", ")}`);
  if (hi) {
    out.push(`- At $0.01 per share: ${pct(hi.ann)} · Sharpe ${hi.sh.toFixed(2)}`);
    const posYears = years.filter(([, a]) => a > 0).length;
    const ok = p.sh >= 0.5 && p.boot >= 0.95 && e.ann > 0 && l.ann > 0 && posYears >= 6 && hi.ann > 0;
    verdicts.push(`- **${name}**: ${ok ? "candidate for a paper test" : "STOP"} (Sharpe ${p.sh.toFixed(2)}, bootstrap ${pct(p.boot)}, positive years ${posYears} of ${years.length}, at $0.01 ${pct(hi.ann)})`);
  }
  out.push("");
}
out.push("## Verdict", "", ...verdicts, "", "## Data notes", "", ...notes.map((n) => `- ${n}`));
writeFileSync("reports/vol-stocks.md", out.join("\n") + "\n");
console.log(verdicts.join("\n"));
