// Probe: QQQ 1-minute bars from the IEX feed (what the bot sees in real time on the free plan) for the first minutes
// of each session, 2024-05 .. 2026-09, to compare the DT3 opening-range decision on IEX with the SIP backtest.
// Writes <dir>/iex_QQQ_open.csv = t(UTC ISO),o,h,l,c,v for bars between 13:25 and 14:45 UTC. Needs ALPACA_KEY_ID / ALPACA_SECRET_KEY.
import { mkdirSync, writeFileSync } from "node:fs";
const DIR = process.argv[2] ?? "out";
mkdirSync(DIR, { recursive: true });
const H = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "", "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [], log = [];
for (let y = 2024, m = 5; y < 2026 || (y === 2026 && m <= 9); m === 12 ? (y++, m = 1) : m++) {
  const a = `${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`;
  const b = m === 12 ? `${y + 1}-01-01T00:00:00Z` : `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00Z`;
  let token = null, n = 0;
  do {
    const u = new URL("https://data.alpaca.markets/v2/stocks/QQQ/bars");
    for (const [k, v] of Object.entries({ timeframe: "1Min", start: a, end: b, feed: "iex", limit: "10000", adjustment: "raw" })) u.searchParams.set(k, v);
    if (token) u.searchParams.set("page_token", token);
    let j = null;
    for (let t = 0; t < 5 && !j; t++) {
      await sleep(350);
      const r = await fetch(u, { headers: H });
      if (r.status === 429) { await sleep(30_000); continue; }
      if (!r.ok) { log.push(`${a}: HTTP ${r.status} ${(await r.text()).slice(0, 150)}`); break; }
      j = await r.json();
    }
    if (!j) break;
    for (const x of j.bars ?? []) { const hm = x.t.slice(11, 16); if (hm >= "13:25" && hm <= "14:45") { rows.push(`${x.t},${x.o},${x.h},${x.l},${x.c},${x.v}`); n++; } }
    token = j.next_page_token ?? null;
  } while (token);
  log.push(`${a.slice(0, 7)}: ${n} bars kept`);
}
writeFileSync(`${DIR}/iex_QQQ_open.csv`, "t,o,h,l,c,v\n" + rows.join("\n") + "\n");
log.push(`total ${rows.length} bars`);
writeFileSync(`${DIR}/LOG.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
