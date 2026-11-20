// Dumps S1/S2 signals of a random 300-symbol subset for scripts/research/xcheck_investclub.py.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { mulberry32 } from "../../src/evaluate.js";
import { buildMarket, s1Prepare, s2Prepare } from "../../src/investclub/core.js";
const U = "data/universe";
const spyRows = readFileSync("data/branch/daily/alpaca/SPY.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const days = spyRows.map((r) => r[0]!), spy = spyRows.map((r) => Number(r[4]));
const raw = readdirSync(`${U}/daily`).map((f) => {
  const rows = gunzipSync(readFileSync(`${U}/daily/${f}`)).toString().trim().split("\n").slice(1).map((l) => l.split(","));
  return { sym: f.replace(".csv.gz", ""), d: rows.map((r) => r[0]!), o: rows.map((r) => +r[1]!), h: rows.map((r) => +r[2]!), l: rows.map((r) => +r[3]!), c: rows.map((r) => +r[4]!), v: rows.map((r) => +r[5]!) };
});
const m = buildMarket(days, spy, raw);
const rnd = mulberry32(42), all = m.stocks.map((s) => s.sym);
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j]!, all[i]!]; }
const subset = new Set(all.slice(0, 300));
const P1 = s1Prepare(m), P2 = s2Prepare(m);
const s1 = P1.sigs.flat().filter((x) => subset.has(m.stocks[x.s]!.sym)).map((x) => [m.stocks[x.s]!.sym, days[P1.W.last[x.w]!]]);
const s2: string[][] = [], lvl: Record<string, number> = {};
P2.sig.forEach((a, d) => a.forEach((x) => { const sym = m.stocks[x.s]!.sym; if (subset.has(sym)) { s2.push([sym, days[d]!]); lvl[`${sym}|${days[d]}`] = x.level; } }));
writeFileSync(process.argv[2] ?? "investclub-signals.json", JSON.stringify({ syms: [...subset], s1, s2, lvl }));
console.log(`subset 300: S1 ${s1.length}, S2 ${s2.length}`);
