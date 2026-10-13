/**
 * FVG + liquidity + BoS test (experiments/fvg-bos-preregistration.md).
 * Needs the data branch at data/branch (npm run data:sync). Run: npx tsx src/cli/fvg.ts   Writes reports/fvg-bos.md
 */
import { writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt } from "../evaluate.js";
import { aggregate, findSetups, MAIN, mirror, randomMeans, trades, type Params, type Series1m, type Trade } from "../ict/fvg.js";
import { completeSessions, loadCalendar, toSessions } from "../intraday/sessions.js";
import { bootstrapByDay, mean, verdict } from "../pm/common.js";

const D = "data/branch";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
interface Asset { sym: string; provider: "binance" | "alpaca"; from: string; cost: number; group: "crypto" | "stocks" | "other" }
const ASSETS: Asset[] = [
  { sym: "BTCUSDT", provider: "binance", from: "2020-01", cost: 0.0005, group: "crypto" },
  { sym: "ETHUSDT", provider: "binance", from: "2020-01", cost: 0.0005, group: "crypto" },
  { sym: "SPY", provider: "alpaca", from: "2016-01", cost: 0.0002, group: "stocks" },
  { sym: "QQQ", provider: "alpaca", from: "2016-01", cost: 0.0002, group: "stocks" },
  { sym: "PAXGUSDT", provider: "binance", from: "2020-08", cost: 0.0005, group: "other" },
  ...["GLD", "IWM", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "SLV", "INTC", "BA", "XOM", "PFE"].map((sym) => ({ sym, provider: "alpaca" as const, from: "2016-01", cost: 0.0003, group: "other" as const })),
];
const TO = "2026-09";

function series(a: Asset): { s: Series1m; splitIdx: number[] } {
  const b = loadMinuteBars(D, a.sym, a.from, TO, a.provider);
  if (a.provider === "binance") {
    return { s: { key: b.t.map((t) => t / 60_000), day: b.t.map((t) => new Date(t).toISOString().slice(0, 10)), seg: b.t.map(() => 0), o: b.o, h: b.h, l: b.l, c: b.c, stock: false }, splitIdx: [] };
  }
  const ss = completeSessions(toSessions(b, cal), cal).kept;
  const s: Series1m = { key: [], day: [], seg: [], o: [], h: [], l: [], c: [], stock: true };
  const splitIdx: number[] = [];
  ss.forEach((x, si) => {
    // raw (unadjusted) prices: a > 25% overnight jump is treated as a split; trades spanning it are dropped (descriptive assets only)
    if (si > 0 && s.c.length && Math.abs(Math.log(x.o[0]! / s.c[s.c.length - 1]!)) > Math.log(1.25)) splitIdx.push(s.key.length);
    for (let i = 0; i < x.minute.length; i++) { s.key.push(si * 1440 + x.minute[i]!); s.day.push(x.date); s.seg.push(si); s.o.push(x.o[i]!); s.h.push(x.h[i]!); s.l.push(x.l[i]!); s.c.push(x.c[i]!); }
  });
  return { s, splitIdx };
}

interface Run { name: string; tf: number; p: Params; short: boolean }
const RUNS: Run[] = [
  { name: "основен (1 ч структура, покупки)", tf: 60, p: MAIN, short: false },
  { name: "структура 4 ч", tf: 240, p: MAIN, short: false },
  { name: "структура 15 мин", tf: 15, p: MAIN, short: false },
  { name: "стоп на дъното на входната свещ", tf: 60, p: { ...MAIN, stopAtEntryLow: true }, short: false },
  { name: "къси продажби (огледално)", tf: 60, p: MAIN, short: true },
];
type Res = { trades: Trade[]; rnd: number[]; years: number };
const results = new Map<string, Map<string, Res>>(); // run -> asset -> result
for (const a of ASSETS) {
  const { s: base, splitIdx } = series(a);
  const years = (base.key.length ? (a.provider === "binance" ? (base.key.at(-1)! - base.key[0]!) / 525_600 : new Set(base.day).size / 252) : 0);
  for (const r of RUNS) {
    const s = r.short ? mirror(base) : base;
    const B = aggregate(s, r.tf), E = r.tf === 15 ? B : aggregate(s, 15);
    const setups = findSetups(B, E, r.p);
    let ts = trades(s, setups, a.cost);
    if (splitIdx.length) {
      const fvgStart = new Map(setups.map((x) => [x.entryIdx, B[x.fvgBar - 2]!.i0]));
      ts = ts.filter((t) => !splitIdx.some((k) => k > (fvgStart.get(t.entryIdx) ?? t.entryIdx) && k <= t.exitIdx));
    }
    const rnd = randomMeans(s, E, ts, a.cost);
    (results.get(r.name) ?? results.set(r.name, new Map()).get(r.name)!).set(a.sym, { trades: ts, rnd, years });
  }
  console.error(`${a.sym} done`);
}

function stats(list: { res: Res }[], filter: (t: Trade) => boolean = () => true) {
  const ts = list.flatMap((x) => x.res.trades.filter(filter));
  const n = ts.length, m = mean(ts.map((t) => t.netR));
  const boot = bootstrapByDay(ts.map((t) => ({ day: t.day, r: t.netR })));
  // random: per seed, trade-weighted mean over assets
  const seeds = list[0]?.res.rnd.length ?? 0;
  const rnd: number[] = [];
  for (let k = 0; k < seeds; k++) {
    let s = 0, w = 0;
    for (const x of list) { const nn = x.res.trades.length; if (nn && Number.isFinite(x.res.rnd[k]!)) { s += x.res.rnd[k]! * nn; w += nn; } }
    rnd.push(w ? s / w : NaN);
  }
  const beats = rnd.filter((x) => m > x).length;
  const yrs = list.reduce((a, x) => a + x.res.years, 0) / Math.max(1, list.length);
  const share = (rs: Trade["reason"]) => (100 * ts.filter((t) => t.reason === rs).length) / n;
  return { n, perYear: n / Math.max(1e-9, yrs) / Math.max(1, list.length), win: (100 * ts.filter((t) => t.netR > 0).length) / n, tp: share("tp"), be: share("be"), stop: share("stop"), time: share("time"), m, boot, beats, rndMean: mean(rnd), grossR: mean(ts.map((t) => (t.exit - t.entry) / t.R)) };
}
const head = ["| Група / актив | Сделки (на година, на актив) | Печеливши | Цел · BE · стоп · време | Брутно R | **Нетно R** | Bootstrap > 0 | Случайно: средно · по-добро от | Присъда |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
const line = (name: string, x: ReturnType<typeof stats>, withVerdict = true) =>
  `| ${name} | ${x.n} (${fmt(x.perYear, 0)}) | ${fmt(x.win, 0)}% | ${fmt(x.tp, 0)} · ${fmt(x.be, 0)} · ${fmt(x.stop, 0)} · ${fmt(x.time, 0)}% | ${fmt(x.grossR, 3)} | **${fmt(x.m, 3)}** | ${fmt(100 * x.boot, 1)}% | ${fmt(x.rndMean, 3)} · ${x.beats}/100 | ${withVerdict ? `**${verdict(x.m, x.boot, x.beats)}**` : "—"} |`;
const groupOf = (run: string, g: Asset["group"]) => ASSETS.filter((a) => a.group === g).map((a) => ({ res: results.get(run)!.get(a.sym)! }));

const out: string[] = ["# FVG + ликвидност + Break of Structure: резултати", "", "Правила: `experiments/fvg-bos-preregistration.md` (записани преди пускането). R = печалба / риск; нетно = след разходите.", "",
  "## Присъда (основен вариант)", "", ...head,
  line("Крипто (BTC + ETH), 2020-01 – 2026-09", stats(groupOf(RUNS[0]!.name, "crypto"))),
  line("Акции (SPY + QQQ), 2016-01 – 2026-09", stats(groupOf(RUNS[0]!.name, "stocks"))), ""];
const isA = (t: Trade) => t.day <= "2022-12-31", isB = (t: Trade) => t.day >= "2023-01-01";
out.push("## Периоди A (до 2022) и B (2023 – 2026-09), основен вариант", "", ...head,
  line("Крипто, A", stats(groupOf(RUNS[0]!.name, "crypto"), isA), false), line("Крипто, B", stats(groupOf(RUNS[0]!.name, "crypto"), isB), false),
  line("Акции, A", stats(groupOf(RUNS[0]!.name, "stocks"), isA), false), line("Акции, B", stats(groupOf(RUNS[0]!.name, "stocks"), isB), false), "");
out.push("## Варианти (не влияят на присъдата)", "", ...head);
for (const r of RUNS.slice(1)) for (const g of ["crypto", "stocks"] as const) out.push(line(`${r.name}: ${g === "crypto" ? "крипто" : "акции"}`, stats(groupOf(r.name, g)), false));
out.push("", "## Отделни активи, основен вариант (описателно)", "", ...head);
for (const a of ASSETS) out.push(line(a.sym, stats([{ res: results.get(RUNS[0]!.name)!.get(a.sym)! }]), false));
const text = out.join("\n");
console.log(text);
writeFileSync("reports/fvg-bos.md", text + "\n");
