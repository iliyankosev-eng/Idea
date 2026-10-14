// Fetches the 1-minute option bars listed in scripts/options-plan.json (SPY 0DTE legs, 09:55-10:05 ET) from Alpaca.
// Runs in GitHub Actions (needs ALPACA_KEY_ID / ALPACA_SECRET_KEY). Writes <dir>/spy0dte_entry.json.gz = { date: { symbol: [[t,o,h,l,c,v,n], ...] } }.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const DIR = process.argv[2] ?? "out";
mkdirSync(DIR, { recursive: true });
const H = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "", "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "" };
const plan = JSON.parse(readFileSync("scripts/options-plan.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {}, log = [];
let ok = 0, empty = 0, errors = 0;
for (const p of plan) {
  const syms = [...new Set(Object.values(p.legs))];
  const u = new URL("https://data.alpaca.markets/v1beta1/options/bars");
  u.searchParams.set("symbols", syms.join(",")); u.searchParams.set("timeframe", "1Min");
  u.searchParams.set("start", p.start); u.searchParams.set("end", p.end); u.searchParams.set("limit", "10000");
  let j = null;
  for (let a = 0; a < 5 && !j; a++) {
    await sleep(320);
    const r = await fetch(u, { headers: H });
    if (r.status === 429) { await sleep(20_000); continue; }
    if (!r.ok) { if (errors++ < 10) log.push(`${p.date}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); break; }
    j = await r.json();
  }
  if (!j) continue;
  const bars = j.bars ?? {};
  out[p.date] = Object.fromEntries(Object.entries(bars).map(([s, bs]) => [s, bs.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v, b.n])]));
  if (Object.keys(bars).length) ok++; else empty++;
}
writeFileSync(`${DIR}/spy0dte_entry.json.gz`, gzipSync(JSON.stringify(out)));
const legsFound = Object.values(out).map((d) => Object.keys(d).length);
log.push(`days ${plan.length}: with bars ${ok}, empty ${empty}, errors ${errors}; legs per day: ${[0, 1, 2, 3, 4, 5, 6].map((k) => `${k}:${legsFound.filter((x) => x === k).length}`).join(" ")}`);
const first = Object.entries(out).find(([, d]) => Object.keys(d).length);
if (first) log.push(`example ${first[0]}: ${JSON.stringify(Object.fromEntries(Object.entries(first[1]).map(([s, b]) => [s, b.slice(0, 2)]))).slice(0, 600)}`);
writeFileSync(`${DIR}/LOG.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
