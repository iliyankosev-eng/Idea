// One-off: Alpaca SIP 1-minute bars (raw, regular session only) for each year's volatile-stock picks
// (scripts/vol-picks.json). Output: <out>/intraday/alpaca/<SYM>/1m/<YYYY-MM>.csv.gz (same format as the data branch).
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
const OUT = process.argv[2] ?? "out";
const picks = JSON.parse(readFileSync("scripts/vol-picks.json", "utf8"));
const H = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "", "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "" };
const log = (s) => { console.log(s); appendFileSync(`${OUT}/LOG.txt`, s + "\n"); };
mkdirSync(OUT, { recursive: true });
let calls = 0; const t0 = Date.now();
async function get(url) {
  for (let k = 0; k < 8; k++) {
    const wait = calls * (60000 / 150) - (Date.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    calls++;
    try { const r = await fetch(url, { headers: H }); if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 3000 * (k + 1))); continue; } if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); return await r.json(); }
    catch (e) { if (k === 7) throw e; await new Promise((x) => setTimeout(x, 3000 * (k + 1))); }
  }
}
const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
// previous year too (DT1 needs 14 earlier sessions): fetch Dec of Y-1 for every pick of year Y
const jobs = [];
for (const [y, syms] of Object.entries(picks)) for (const s of syms) jobs.push([s, `${+y - 1}-12-01`, y === "2026" ? "2026-11-20" : `${y}-12-31`]);
for (const [sym, start, end] of jobs) {
  const byMonth = new Map();
  let token = "", n = 0;
  do {
    const q = new URLSearchParams({ symbols: sym, timeframe: "1Min", start: `${start}T00:00:00Z`, end: `${end}T23:59:59Z`, adjustment: "raw", feed: "sip", limit: "10000", sort: "asc" });
    if (token) q.set("page_token", token);
    const j = await get(`https://data.alpaca.markets/v2/stocks/bars?${q}`);
    for (const b of j.bars?.[sym] ?? []) {
      const t = Date.parse(b.t), p = Object.fromEntries(ny.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      const m = +p.hour * 60 + +p.minute;
      if (m < 570 || m >= 960) continue; // regular session only
      const mon = `${p.year}-${p.month}`;
      if (!byMonth.has(mon)) byMonth.set(mon, []);
      byMonth.get(mon).push(`${t},${b.o},${b.h},${b.l},${b.c},${b.v}`); n++;
    }
    token = j.next_page_token ?? "";
  } while (token);
  for (const [mon, rows] of byMonth) {
    const dir = `${OUT}/intraday/alpaca/${sym}/1m`; mkdirSync(dir, { recursive: true });
    const path = `${dir}/${mon}.csv.gz`;
    const old = existsSync(path) ? gunzipSync(readFileSync(path)).toString().trim().split("\n").slice(1) : [];
    const all = [...new Set([...old, ...rows])].sort((a, b) => +a.split(",")[0] - +b.split(",")[0]);
    writeFileSync(path, gzipSync("t,o,h,l,c,v\n" + all.join("\n") + "\n"));
  }
  log(`${sym} ${start}..${end}: ${n} bars, ${byMonth.size} months; calls ${calls}, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
log("done");
