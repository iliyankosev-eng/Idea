// experiments/fx-gold-preregistration.md - the 14 earlier strategies on XAUUSD, EURUSD, GBPUSD, USDJPY (Dukascopy),
// New York and London sessions. Needs: git worktree add data/fx origin/fxdata
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dt1, dt2, dt3, dt3Late, dt4, type DayRet } from "../../src/daytrade/dt.js";
import { dt7, dt8 } from "../../src/daytrade/dt78.js";
import { n1 } from "../../src/daytrade/new3.js";
import { fibTrades, type Bars } from "../../src/fib/confluence.js";
import { costR, firstCandleTrade } from "../../src/ict/firstCandle.js";
import type { Session } from "../../src/intraday/sessions.js";
import { bootstrapByDay } from "../../src/pm/common.js";
import { sessionTrades } from "../../src/social/ffcc.js";
import { rangeTrade } from "../../src/social/rangebot.js";
import { silvioTrades, V2 } from "../../src/social/silvio.js";

const FX = "data/fx";
// price scale so that the $0.01 steps in the strategy code are a sensible fraction of the instrument's daily range
const SCALE: Record<string, number> = { XAUUSD: 1, EURUSD: 1000, GBPUSD: 1000, USDJPY: 10 };
const SESS = { NY: { tz: "America/New_York", start: 570 }, London: { tz: "Europe/London", start: 480 } } as const;
const fmt: Record<string, Intl.DateTimeFormat> = {};
const local = (tz: string, ms: number) => { const f = (fmt[tz] ??= new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })); const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, m: +p.hour! * 60 + +p.minute! }; };
function load(sym: string) {
  const rows: { ms: number; o: number; h: number; l: number; c: number; ask: number; v: number }[] = [];
  for (const f of readdirSync(`${FX}/${sym}`).filter((x) => x.endsWith(".csv.gz")).sort()) {
    const lines = gunzipSync(readFileSync(`${FX}/${sym}/${f}`)).toString().trim().split("\n");
    const hasV = lines[0]!.split(",").length >= 7;
    for (const ln of lines.slice(1)) { const p = ln.split(","); rows.push({ ms: Date.parse(`${p[0]}:00Z`), o: +p[1]!, h: +p[2]!, l: +p[3]!, c: +p[4]!, ask: p[5] ? +p[5] : NaN, v: hasV ? +p[6]! : 1 }); }
  }
  return rows;
}
function sessions(sym: string, rows: ReturnType<typeof load>, which: keyof typeof SESS): { ss: Session[]; spreads: number[] } {
  const k = SCALE[sym]!, { tz, start } = SESS[which], by = new Map<string, Session & { v: number[] }>(), spreads: number[] = [];
  for (const r of rows) {
    const t = local(tz, r.ms);
    if (t.m < start || t.m >= start + 390) continue;
    let s = by.get(t.date);
    if (!s) { s = { symbol: sym, date: t.date, minute: [], o: [], h: [], l: [], c: [], v: [] }; by.set(t.date, s); }
    s.minute.push(570 + (t.m - start)); s.o.push(r.o * k); s.h.push(r.h * k); s.l.push(r.l * k); s.c.push(r.c * k); s.v.push(r.v);
    if (Number.isFinite(r.ask)) spreads.push((r.ask - r.c) * k);
  }
  return { ss: [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).filter((s) => s.minute.length >= 300), spreads };
}
const hours = (ss: readonly Session[]): Bars => {
  const day: string[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
  for (const s of ss) { let cur = -1; for (let i = 0; i < s.minute.length; i++) { const k = Math.floor((s.minute[i]! - 570) / 60); if (k !== cur) { cur = k; day.push(s.date); o.push(s.o[i]!); h.push(s.h[i]!); l.push(s.l[i]!); c.push(s.c[i]!); continue; } const j = c.length - 1; h[j] = Math.max(h[j]!, s.h[i]!); l[j] = Math.min(l[j]!, s.l[i]!); c[j] = s.c[i]!; } }
  return { day, o, h, l, c };
};
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
type Pt = { day: string; r: number };
const res: Record<string, Record<string, Pt[]>> = {};
const DAILY = new Set(["DT1", "DT2", "DT3", "DT3-bot", "DT4", "DT7", "DT8", "N1"]);
const notes: string[] = [];
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
for (const sym of Object.keys(SCALE)) {
  if (!existsSync(`${FX}/${sym}`)) { notes.push(`${sym}: no data`); continue; }
  const rows = load(sym);
  const ny = sessions(sym, rows, "NY"), spread = median(ny.spreads), price = median(ny.ss.map((s) => s.c[s.c.length - 1]!));
  const C = spread / 2 + 1e-5 * price; // per side, scaled units
  notes.push(`${sym}: ${rows.length} minutes ${new Date(rows[0]!.ms).toISOString().slice(0, 10)}..${new Date(rows.at(-1)!.ms).toISOString().slice(0, 10)}; median NY spread ${(spread / SCALE[sym]!).toPrecision(3)} (${(1e4 * spread / price).toFixed(2)} bp); cost per side ${(1e4 * C / price).toFixed(2)} bp`);
  for (const which of ["NY", "London"] as const) {
    const ss = which === "NY" ? ny.ss : sessions(sym, rows, which).ss, key = `${sym} ${which}`;
    const put = (st: string, x: Pt[]) => { (res[st] ??= {})[key] = x.filter((p) => p.day >= "2016-01-01"); };
    const dr = (x: DayRet[]): Pt[] => x.map((d) => ({ day: d.day, r: d.r }));
    put("DT1", dr(dt1(ss, { dynamic: true, execNextOpen: true, cost: C, maxLev: 2, exitMin: 955 })));
    put("DT2", dr(dt2(ss, C)));
    put("DT3", dr(dt3(ss, C)));
    put("DT3-bot", dr(dt3Late(ss, C, 20, 2)).map((p) => (fomc.has(p.day) ? { ...p, r: 0 } : p)));
    put("DT4", dr(dt4(ss, C)));
    put("DT7", dr(dt7(ss, C)));
    put("N1", dr(n1(ss, { cost: C })));
    if (which === "NY") { const d = { date: ss.map((s) => s.date), c: ss.map((s) => s.c[s.c.length - 1]!) }; put("DT8", dr(dt8(d, C))); }
    put("FFCC", ss.flatMap((s) => sessionTrades(s, { len: 5, target: "1.5R", stop: "extreme", cost: C })).map((t) => ({ day: t.date, r: t.r })));
    put("Range A", ss.flatMap((s) => { const t = rangeTrade(s, 0.5, 0.5, C); return t ? [{ day: t.date, r: t.r }] : []; }));
    put("Range B", ss.flatMap((s) => { const t = rangeTrade(s, 0.25, 0.75, C); return t ? [{ day: t.date, r: t.r }] : []; }));
    put("Silvio", silvioTrades(ss, { rr: 2, cost: C, trend: true, th: V2 }).map((t) => ({ day: t.date, r: t.r })));
    put("Fib", fibTrades(hours(ss), { confirm: "rsi", stopMode: "L", holdBars: 14, cost: () => 2 * C }).map((t) => ({ day: t.day, r: t.r })));
    put("First candle", ss.flatMap((s) => { const d = { date: s.date, m: s.minute, o: s.o, h: s.h, l: s.l, c: s.c }; const t = firstCandleTrade(d, { orStart: 570, lastEntry: 720, exitMin: 959 }); return t ? [{ day: s.date, r: t.r - costR(d, t, C) }] : []; }));
    notes.push(`${key}: ${ss.length} sessions`);
  }
  console.error(`${sym} done`);
}
// ---- analysis (same rules as the cross-instrument test)
const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const stat = (st: string, x: Pt[]) => { const r = x.map((p) => p.r), e = x.filter((p) => p.day < "2021").map((p) => p.r), l = x.filter((p) => p.day >= "2021").map((p) => p.r), k = DAILY.has(st) ? 252 : 1; return { main: k * mean(r), sharpe: DAILY.has(st) ? (mean(r) / sd(r)) * Math.sqrt(252) : NaN, boot: x.length ? bootstrapByDay(x) : NaN, e: k * mean(e), l: k * mean(l), n: DAILY.has(st) ? r.filter((v) => v !== 0).length : r.length }; };
const f = (st: string, v: number) => (DAILY.has(st) ? `${(100 * v).toFixed(1)}%/y` : `${v >= 0 ? "+" : ""}${v.toFixed(3)}R`);
const all: { st: string; key: string; s: ReturnType<typeof stat>; p: number; holm?: boolean }[] = [];
for (const [st, by] of Object.entries(res)) for (const [key, x] of Object.entries(by)) { const s = stat(st, x); all.push({ st, key, s, p: 1 - s.boot }); }
const srt = all.filter((r) => Number.isFinite(r.p)).sort((a, b) => a.p - b.p);
let stop = false; srt.forEach((r, i) => { if (!stop && r.p <= 0.05 / (srt.length - i)) r.holm = true; else stop = true; });
const pool = (st: string, keys: string[]): Pt[] => {
  if (!DAILY.has(st)) return keys.flatMap((k) => res[st]![k]!);
  const by = new Map<string, number[]>(); for (const k of keys) for (const p of res[st]![k]!) (by.get(p.day) ?? by.set(p.day, []).get(p.day)!).push(p.r);
  return [...by.entries()].sort().map(([day, v]) => ({ day, r: mean(v) }));
};
const out = ["# Every earlier strategy on gold and the dollar (Dukascopy)", "", `Rules: experiments/fx-gold-preregistration.md. ${all.length} single tests, Holm at 5%.`, ""];
const verdicts: string[] = [];
for (const st of Object.keys(res)) {
  const keys = Object.keys(res[st]!), P = stat(st, pool(st, keys)), pos = keys.filter((k) => stat(st, res[st]![k]!).main > 0).length;
  const yes = P.main > 0 && P.boot >= 0.95 && P.e > 0 && P.l > 0 && pos >= (2 / 3) * keys.length;
  const gk = keys.filter((k) => k.startsWith("XAUUSD")), G = gk.length ? stat(st, pool(st, gk)) : null;
  const gyes = !!G && G.main > 0 && G.boot >= 0.95 && G.e > 0 && G.l > 0 && gk.every((k) => stat(st, res[st]![k]!).main > 0);
  verdicts.push(`- **${st}**: gold+FX ${yes ? "WORKS" : "no"} (${f(st, P.main)}, bootstrap ${(100 * P.boot).toFixed(0)}%, positive ${pos}/${keys.length}); gold alone ${gyes ? "WORKS" : "no"}${G ? ` (${f(st, G.main)}, bootstrap ${(100 * G.boot).toFixed(0)}%)` : ""}`);
  out.push(`## ${st}`, "");
  for (const k of keys) { const r = all.find((x) => x.st === st && x.key === k)!; out.push(`- ${k}: ${f(st, r.s.main)}${DAILY.has(st) ? ` · Sharpe ${r.s.sharpe.toFixed(2)}` : ""} · ${r.s.n} trades · bootstrap ${(100 * r.s.boot).toFixed(0)}% · halves ${f(st, r.s.e)} / ${f(st, r.s.l)}${r.holm ? " · **survives Holm**" : ""}`); }
  out.push("");
}
out.push("## Verdict", "", ...verdicts, "", "Single results surviving Holm and positive in both halves:", ...(all.filter((r) => r.holm && r.s.e > 0 && r.s.l > 0).map((r) => `- ${r.st} ${r.key}: ${f(r.st, r.s.main)}`)), "", "## Data notes", "", ...notes.map((n) => `- ${n}`));
writeFileSync("reports/fx-gold.md", out.join("\n") + "\n");
console.log(verdicts.join("\n"));
