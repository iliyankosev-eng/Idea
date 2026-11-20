// Daily bars (split + dividend adjusted, SIP) for every US stock Alpaca knows, active AND inactive (delisted),
// so the universe is not only today's survivors. Run by .github/workflows/universe-data.yml.
// Output (dir from argv[2]):
//   assets.csv                 symbol,exchange,status,name   (every asset considered)
//   daily/<SYMBOL>.csv.gz       d,o,h,l,c,v                   (only symbols that were ever liquid, see LIQ)
//   LOG.txt
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const OUT = process.argv[2] ?? "out", START = "2015-06-01", END = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
const LIQ = 10e6; // keep a symbol if its 50-day average dollar volume ever reached $10M
const H = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "", "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "" };
mkdirSync(`${OUT}/daily`, { recursive: true });
const log = (s) => { console.log(s); appendFileSync(`${OUT}/LOG.txt`, s + "\n"); };

let calls = 0, t0 = Date.now();
async function get(url) {
  for (let k = 0; k < 8; k++) {
    // stay under 150 (the bot shares the account limit of 200) requests per minute
    const wait = calls * (60000 / 150) - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    calls++;
    try {
      const r = await fetch(url, { headers: H });
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 3000 * (k + 1))); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (e) { if (k === 7) throw e; await new Promise((res) => setTimeout(res, 3000 * (k + 1))); }
  }
}

const ETF = /\b(ETF|ETN|FUND|PROSHARES|DIREXION|ISHARES|SPDR|INVESCO|VANECK|LEVERAGED|INVERSE|2X|3X|BULL|BEAR|DAILY|INDEX|NOTES?|WARRANTS?|RIGHTS?|UNITS?|PREFERRED|DEPOSITARY SHARES REPRESENTING)\b/i;
const assets = [];
for (const status of ["active", "inactive"]) {
  const a = await get(`https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity&status=${status}`);
  for (const x of a) if (["NYSE", "NASDAQ", "AMEX"].includes(x.exchange) && /^[A-Z]{1,5}$/.test(x.symbol)) assets.push({ symbol: x.symbol, exchange: x.exchange, status, name: String(x.name ?? "").replace(/[,\n]/g, " ") });
}
// a symbol can appear as both active and inactive (reused ticker): keep one entry
const seen = new Set(), uni = assets.filter((x) => (seen.has(x.symbol) ? false : (seen.add(x.symbol), true)));
writeFileSync(`${OUT}/assets.csv`, "symbol,exchange,status,name,etf_like\n" + uni.map((x) => `${x.symbol},${x.exchange},${x.status},${x.name},${ETF.test(x.name) ? 1 : 0}`).join("\n") + "\n");
const syms = uni.filter((x) => !ETF.test(x.name)).map((x) => x.symbol);
log(`assets: ${uni.length} (active ${uni.filter((x) => x.status === "active").length}, inactive ${uni.filter((x) => x.status === "inactive").length}); fetching ${syms.length} non-ETF-like symbols ${START}..${END}`);

let kept = 0, empty = 0, rows = 0;
for (let b = 0; b < syms.length; b += 100) {
  const batch = syms.slice(b, b + 100), bars = new Map();
  let token = "";
  do {
    const q = new URLSearchParams({ symbols: batch.join(","), timeframe: "1Day", start: START, end: END, adjustment: "all", feed: "sip", limit: "10000", sort: "asc" });
    if (token) q.set("page_token", token);
    const j = await get(`https://data.alpaca.markets/v2/stocks/bars?${q}`);
    for (const [s, arr] of Object.entries(j.bars ?? {})) { if (!bars.has(s)) bars.set(s, []); bars.get(s).push(...arr); }
    token = j.next_page_token ?? "";
  } while (token);
  for (const s of batch) {
    const a = bars.get(s) ?? [];
    if (!a.length) { empty++; continue; }
    let sum = 0, best = 0;
    for (let i = 0; i < a.length; i++) { sum += a[i].c * a[i].v; if (i >= 50) sum -= a[i - 50].c * a[i - 50].v; if (i >= 49) best = Math.max(best, sum / 50); }
    if (best < LIQ) continue;
    kept++; rows += a.length;
    const csv = "d,o,h,l,c,v\n" + a.map((x) => `${x.t.slice(0, 10)},${+x.o.toFixed(4)},${+x.h.toFixed(4)},${+x.l.toFixed(4)},${+x.c.toFixed(4)},${Math.round(x.v)}`).join("\n") + "\n";
    writeFileSync(`${OUT}/daily/${s}.csv.gz`, gzipSync(csv));
  }
  if ((b / 100) % 10 === 0) log(`batch ${b / 100 + 1}/${Math.ceil(syms.length / 100)}: kept ${kept}, empty ${empty}, rows ${rows}, calls ${calls}, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
log(`done: kept ${kept} liquid symbols, ${rows} rows; ${empty} symbols without data; ${calls} calls in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
