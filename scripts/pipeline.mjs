// Data pipeline. Runs in GitHub Actions (the sources are blocked from Claude's sandbox) and writes into the
// working tree of the `data` branch: node scripts/pipeline.mjs <out-dir>
//
//   daily/coinmetrics/<asset>.csv   time,PriceUSD           (CoinMetrics community API, refreshed every run)
//   daily/fred/<series>.csv         observation_date,<id>   (FRED, refreshed every run)
//   intraday/binance/<SYMBOL>/1m/<YYYY-MM>.csv.gz  t,o,h,l,c,v  (t = open time, ms UTC; months are immutable,
//                                                    downloaded once, SHA-256 checked against Binance's .CHECKSUM)
//   intraday/binance/manifest.json  one entry per month: source hash, rows, missing minutes
//
// Every file is validated before it is written; a failed check stops the run so bad data never reaches the branch.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { lastCompleteMonth, monthRange, normalizeKlines } from "./lib/binance.mjs";

const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node scripts/pipeline.mjs <out-dir>");
const UA = "Iliyan Kosev personal research iliyan.v.kosev@gmail.com"; // SEC/FRED ask for a contact in the User-Agent
const DAY = 86_400_000;
const summary = [];

function write(rel, data) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
}

async function get(url, { binary = false, retries = 3 } = {}) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 404) return null;
    if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    if (i >= retries || (res.status < 500 && res.status !== 429)) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

// ---------- CoinMetrics daily ----------
const CM_ASSETS = ["btc", "eth", "ltc", "xrp", "doge", "ada", "bnb", "sol"];
const CM_REQUIRED = new Set(["btc", "eth"]);

async function coinmetrics(asset) {
  let url = `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=${asset}&metrics=PriceUSD&frequency=1d&start_time=2009-01-01&page_size=10000`;
  const rows = [];
  while (url) {
    const j = JSON.parse(await get(url));
    if (j.error) throw new Error(`coinmetrics ${asset}: ${JSON.stringify(j.error)}`);
    for (const d of j.data ?? []) if (d.PriceUSD != null) rows.push([d.time.slice(0, 10), d.PriceUSD]);
    url = j.next_page_url ?? null;
  }
  if (rows.length === 0) {
    if (CM_REQUIRED.has(asset)) throw new Error(`coinmetrics ${asset}: no data`);
    summary.push(`coinmetrics ${asset}: no PriceUSD, skipped`);
    return;
  }
  rows.forEach(([t, p], k) => {
    if (!(Number(p) > 0)) throw new Error(`coinmetrics ${asset}: bad price ${p} at ${t}`);
    if (k > 0 && Date.parse(t) - Date.parse(rows[k - 1][0]) !== DAY) throw new Error(`coinmetrics ${asset}: gap or disorder at ${t}`);
  });
  const last = rows[rows.length - 1][0];
  if (Date.now() - Date.parse(last) > 7 * DAY) throw new Error(`coinmetrics ${asset}: stale, last day ${last}`);
  write(`daily/coinmetrics/${asset}.csv`, "time,PriceUSD\n" + rows.map((r) => r.join(",")).join("\n") + "\n");
  summary.push(`coinmetrics ${asset}: ${rows.length} days, ${rows[0][0]} .. ${last}`);
}

// ---------- FRED daily ----------
const FRED = ["DGS10", "DTB3"]; // 10-year Treasury yield, 3-month T-bill (cash rate)

async function fred(id) {
  const text = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  if (!text) throw new Error(`fred ${id}: not found`);
  const lines = text.trim().split("\n");
  if (!lines[0].endsWith(`,${id}`) || lines.length < 1000) throw new Error(`fred ${id}: unexpected format or too short`);
  write(`daily/fred/${id}.csv`, text.endsWith("\n") ? text : text + "\n");
  summary.push(`fred ${id}: ${lines.length - 1} rows, last ${lines[lines.length - 1].slice(0, 10)}`);
}

// ---------- Binance 1-minute ----------
const BINANCE = { symbols: ["BTCUSDT", "ETHUSDT"], from: "2020-01" };

async function binanceMonths() {
  const manPath = join(OUT, "intraday/binance/manifest.json");
  const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, "utf8")) : {};
  const tmp = mkdtempSync(join(tmpdir(), "bn-"));
  const months = monthRange(BINANCE.from, lastCompleteMonth());
  let added = 0;
  for (const sym of BINANCE.symbols) {
    for (const month of months) {
      const key = `${sym}/1m/${month}`;
      const rel = `intraday/binance/${key}.csv.gz`;
      if (manifest[key] && existsSync(join(OUT, rel))) continue; // months never change once published
      const base = `https://data.binance.vision/data/spot/monthly/klines/${sym}/1m/${sym}-1m-${month}.zip`;
      const zip = await get(base, { binary: true });
      if (!zip) { summary.push(`binance ${key}: not published yet`); continue; }
      const check = await get(`${base}.CHECKSUM`);
      const expected = check?.trim().split(/\s+/)[0];
      const actual = createHash("sha256").update(zip).digest("hex");
      if (!expected || expected !== actual) throw new Error(`binance ${key}: SHA-256 mismatch (expected ${expected}, got ${actual})`);
      const zipPath = join(tmp, "m.zip");
      writeFileSync(zipPath, zip);
      const text = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 1 << 30 }).toString("utf8");
      const r = normalizeKlines(text, month);
      write(rel, gzipSync(r.csv, { level: 9 }));
      manifest[key] = { sha256: actual, rows: r.rows, missingMinutes: r.missingMinutes, first: new Date(r.firstMs).toISOString(), last: new Date(r.lastMs).toISOString() };
      added++;
    }
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  write("intraday/binance/manifest.json", JSON.stringify(sorted, null, 1) + "\n");
  const missing = Object.entries(sorted).filter(([, v]) => v.missingMinutes > 0).map(([k, v]) => `${k}: ${v.missingMinutes}`);
  summary.push(`binance: ${added} new months, ${Object.keys(sorted).length} total; months with missing minutes: ${missing.length ? missing.join("; ") : "none"}`);
}

for (const a of CM_ASSETS) {
  try { await coinmetrics(a); }
  catch (e) { if (CM_REQUIRED.has(a)) throw e; summary.push(`coinmetrics ${a}: skipped (${e.message.slice(0, 120)})`); }
}
for (const id of FRED) await fred(id);
await binanceMonths();
for (const s of summary) console.log(s);
writeFileSync(join(OUT, "LAST_RUN.txt"), `${new Date().toISOString()}\n${summary.join("\n")}\n`);
