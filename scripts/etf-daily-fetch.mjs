// Daily ETF bars for experiments/trend-preregistration.md. Run by .github/workflows/etf-data.yml.
// Output (dir from argv[2]):
//   alpaca/<SYM>.csv   d,o,h,l,c,v   (Alpaca SIP, split + dividend adjusted, 2015-06-01 .. yesterday)
//   stooq/<SYM>.csv    raw Stooq CSV (Date,Open,High,Low,Close,Volume), whatever history Stooq has
//   LOG.txt
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "out";
const SYMS = ["SPY", "EFA", "TLT", "IEF", "GLD", "DBC", "UUP", "BIL"];
const START = "2015-06-01", END = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
const H = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "", "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "" };
for (const d of ["alpaca", "stooq"]) mkdirSync(`${OUT}/${d}`, { recursive: true });
const log = (s) => { console.log(s); appendFileSync(`${OUT}/LOG.txt`, s + "\n"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const s of SYMS) {
  const bars = [];
  let token = "";
  try {
    do {
      const q = new URLSearchParams({ symbols: s, timeframe: "1Day", start: START, end: END, adjustment: "all", feed: "sip", limit: "10000", sort: "asc" });
      if (token) q.set("page_token", token);
      const r = await fetch(`https://data.alpaca.markets/v2/stocks/bars?${q}`, { headers: H });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      bars.push(...(j.bars?.[s] ?? []));
      token = j.next_page_token ?? "";
      await sleep(400);
    } while (token);
    writeFileSync(`${OUT}/alpaca/${s}.csv`, "d,o,h,l,c,v\n" + bars.map((x) => `${x.t.slice(0, 10)},${x.o},${x.h},${x.l},${x.c},${Math.round(x.v)}`).join("\n") + "\n");
    log(`alpaca ${s}: ${bars.length} days ${bars[0]?.t.slice(0, 10)} .. ${bars.at(-1)?.t.slice(0, 10)}`);
  } catch (e) { log(`alpaca ${s}: FAILED ${e}`); }
}
for (const s of SYMS) {
  try {
    const r = await fetch(`https://stooq.com/q/d/l/?s=${s.toLowerCase()}.us&i=d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const t = await r.text();
    if (!r.ok || !t.startsWith("Date,")) throw new Error(`HTTP ${r.status}: ${t.slice(0, 120).replace(/\s+/g, " ")}`);
    writeFileSync(`${OUT}/stooq/${s}.csv`, t);
    const lines = t.trim().split("\n");
    log(`stooq ${s}: ${lines.length - 1} days ${lines[1]?.slice(0, 10)} .. ${lines.at(-1)?.slice(0, 10)}`);
  } catch (e) { log(`stooq ${s}: FAILED ${e}`); }
  await sleep(1500);
}
