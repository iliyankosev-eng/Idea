// Alpaca (Benzinga) news history for the stock universe, 2016-01-01 .. 2026-10-01. Runs in GitHub Actions (needs ALPACA_KEY_ID / ALPACA_SECRET_KEY).
// Writes <dir>/news/<SYMBOL>.json.gz = [[created_at ISO, number of symbols tagged, headline], ...] sorted by time. Resumable per symbol.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const DIR = process.argv[2] ?? "newsdata";
mkdirSync(`${DIR}/news`, { recursive: true });
const SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "INTC", "BA", "XOM", "PFE", "SPY", "QQQ"];
const H = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "", "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
for (const sym of SYMBOLS) {
  const p = `${DIR}/news/${sym}.json.gz`;
  if (existsSync(p)) continue;
  const rows = [];
  let token = null, pages = 0, err = "";
  do {
    const u = new URL("https://data.alpaca.markets/v1beta1/news");
    u.searchParams.set("symbols", sym); u.searchParams.set("start", "2016-01-01T00:00:00Z"); u.searchParams.set("end", "2026-10-01T00:00:00Z");
    u.searchParams.set("limit", "50"); u.searchParams.set("sort", "asc"); u.searchParams.set("include_content", "false");
    if (token) u.searchParams.set("page_token", token);
    let j = null;
    for (let a = 0; a < 5 && !j; a++) {
      await sleep(320);
      const r = await fetch(u, { headers: H });
      if (r.status === 429) { await sleep(30_000); continue; }
      if (!r.ok) { err = `HTTP ${r.status} ${(await r.text()).slice(0, 150)}`; break; }
      j = await r.json();
    }
    if (!j) break;
    for (const n of j.news ?? []) rows.push([n.created_at, (n.symbols ?? []).length, n.headline ?? ""]);
    token = j.next_page_token ?? null; pages++;
  } while (token);
  if (err && !rows.length) { log.push(`${sym}: ${err}`); continue; }
  writeFileSync(p, gzipSync(JSON.stringify(rows)));
  log.push(`${sym}: ${rows.length} items, ${pages} pages, ${rows[0]?.[0] ?? "-"} .. ${rows.at(-1)?.[0] ?? "-"}${err ? ` (stopped: ${err})` : ""}`);
}
writeFileSync(`${DIR}/LAST_RUN_NEWS.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
