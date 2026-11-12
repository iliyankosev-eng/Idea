// Data pipeline. Runs in GitHub Actions (the sources are blocked from Claude's sandbox) and writes into the
// working tree of the `data` branch: node scripts/pipeline.mjs <out-dir>
//
//   daily/coinmetrics/<asset>.csv   time,PriceUSD           (CoinMetrics community API, refreshed every run)
//   daily/fred/<series>.csv         observation_date,<id>   (FRED, refreshed every run)
//   daily/yahoo/<ticker>.csv        Date,Close,AdjClose     (Yahoo chart API, US ETFs, refreshed every run)
//   intraday/binance/<SYMBOL>/1m/<YYYY-MM>.csv.gz  t,o,h,l,c,v  (t = open time, ms UTC; months are immutable,
//                                                    downloaded once, SHA-256 checked against Binance's .CHECKSUM)
//   intraday/binance/manifest.json  one entry per month: source hash, rows, missing minutes
//   intraday/alpaca/<TICKER>/1m/<YYYY-MM>.csv.gz   t,o,h,l,c,v  (US stocks, consolidated SIP feed, regular session
//                                                    09:30-16:00 New York only, RAW prices so months never change)
//   intraday/alpaca/manifest.json   one entry per month: rows, trading days
//   daily/alpaca/<TICKER>.csv       date,o,h,l,c,v  (split- and dividend-adjusted daily bars, refreshed every run)
//   daily/alpaca/calendar.csv       date,open,close (official US exchange sessions, New York time; early closes at 13:00)
//   daily/alpaca/premarket/<TICKER>.csv  date,pmh,pml,bars (04:00-09:29 New York high/low; SPY and QQQ only)
// Alpaca needs ALPACA_KEY_ID / ALPACA_SECRET_KEY in the environment (GitHub secrets); without them it is skipped.
// A time budget stops new downloads after BUDGET_MIN minutes so a long first backfill is saved and resumed next run.
//
// Every file is validated before it is written; a failed check stops the run so bad data never reaches the branch.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { monthBoundsUtc, normalizeAlpacaBars, premarketLevels } from "./lib/alpaca.mjs";
import { lastCompleteMonth, monthRange, normalizeKlines } from "./lib/binance.mjs";

const OUT = process.argv[2];
if (!OUT) throw new Error("usage: node scripts/pipeline.mjs <out-dir>");
const UA = "Iliyan Kosev personal research iliyan.v.kosev@gmail.com"; // SEC/FRED ask for a contact in the User-Agent
const DAY = 86_400_000;
const summary = [];
const STARTED = Date.now();
const BUDGET_MIN = Number(process.env.BUDGET_MIN ?? 40);
const overBudget = () => (Date.now() - STARTED) / 60_000 > BUDGET_MIN;

function write(rel, data) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
}

async function get(url, { binary = false, retries = 3, headers = {} } = {}) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
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

// ---------- Yahoo daily (US ETFs) ----------
const YAHOO = ["GLD", "SLV", "SPY"]; // gold ETF (2004-11), silver ETF (2006-04), S&P 500 ETF (1993-01)

async function yahoo(ticker) {
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=0&period2=${now}&interval=1d&events=div%2Csplit&includeAdjustedClose=true`;
  const j = JSON.parse(await get(url));
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`yahoo ${ticker}: ${JSON.stringify(j?.chart?.error ?? "no result")}`);
  const off = r.meta.gmtoffset; // exchange offset in seconds (New York), so the date is the exchange's trading day
  const ts = r.timestamp, close = r.indicators.quote[0].close, adj = r.indicators.adjclose?.[0]?.adjclose;
  if (!ts?.length || !adj) throw new Error(`yahoo ${ticker}: missing timestamps or adjusted close`);
  const rows = [];
  let nulls = 0;
  for (let i = 0; i < ts.length; i++) {
    if (close[i] == null || adj[i] == null) { nulls++; continue; }
    const date = new Date((ts[i] + off) * 1000).toISOString().slice(0, 10);
    if (rows.length && date <= rows[rows.length - 1][0]) throw new Error(`yahoo ${ticker}: date not increasing at ${date}`);
    if (!(close[i] > 0 && adj[i] > 0)) throw new Error(`yahoo ${ticker}: non-positive price at ${date}`);
    rows.push([date, close[i], adj[i]]);
  }
  if (nulls > 5) throw new Error(`yahoo ${ticker}: ${nulls} empty days`);
  // Yahoo includes today's unfinished session while the market is open: keep only days before today (New York date).
  const todayNy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  while (rows.length && rows[rows.length - 1][0] >= todayNy) rows.pop();
  const gaps = rows.slice(1).map((r, k) => (Date.parse(r[0]) - Date.parse(rows[k][0])) / DAY);
  const sorted = [...gaps].sort((a, b) => a - b);
  if (sorted[Math.floor(sorted.length / 2)] > 1) throw new Error(`yahoo ${ticker}: not daily data (median gap ${sorted[Math.floor(sorted.length / 2)]} days)`);
  if (Math.max(...gaps) > 7) throw new Error(`yahoo ${ticker}: gap of ${Math.max(...gaps)} days`);
  const last = rows[rows.length - 1][0];
  if (Date.now() - Date.parse(last) > 7 * DAY) throw new Error(`yahoo ${ticker}: stale, last day ${last}`);
  write(`daily/yahoo/${ticker}.csv`, "Date,Close,AdjClose\n" + rows.map((x) => x.join(",")).join("\n") + "\n");
  summary.push(`yahoo ${ticker}: ${rows.length} days, ${rows[0][0]} .. ${last}, ${nulls} empty skipped`);
}

// ---------- Binance 1-minute ----------
// PAXGUSDT: token backed 1:1 by physical gold (1 troy ounce), trades 24/7; listed on Binance in 2020.
const BINANCE = { symbols: ["BTCUSDT", "ETHUSDT", "PAXGUSDT"], from: "2020-01" };

async function binanceMonths() {
  const manPath = join(OUT, "intraday/binance/manifest.json");
  const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, "utf8")) : {};
  const tmp = mkdtempSync(join(tmpdir(), "bn-"));
  const months = monthRange(BINANCE.from, lastCompleteMonth());
  let added = 0;
  const notFound = [];
  for (const sym of BINANCE.symbols) {
    for (const month of months) {
      const key = `${sym}/1m/${month}`;
      const rel = `intraday/binance/${key}.csv.gz`;
      if (manifest[key] && existsSync(join(OUT, rel))) continue; // months never change once published
      if (overBudget()) { summary.push(`binance: time budget reached, rest continues next run`); break; }
      const base = `https://data.binance.vision/data/spot/monthly/klines/${sym}/1m/${sym}-1m-${month}.zip`;
      const zip = await get(base, { binary: true });
      if (!zip) { notFound.push(key); continue; }
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
  if (notFound.length) summary.push(`binance: not available: ${notFound.join(", ")}`);
  summary.push(`binance: ${added} new months, ${Object.keys(sorted).length} total; months with missing minutes: ${missing.length ? missing.join("; ") : "none"}`);
}

// ---------- Alpaca US stocks ----------
// Indices, large caps, gold/silver ETFs, and four large caps that did poorly in 2016-2026 (against survivorship bias).
const ALPACA = { tickers: ["SPY", "QQQ", "IWM", "DIA", "BIL", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "GLD", "SLV", "INTC", "BA", "XOM", "PFE"], from: "2016-01" };
const ALPACA_HEADERS = { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "", "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function alpacaBars(ticker, timeframe, start, end, adjustment) {
  const bars = [];
  let token = null;
  do {
    const q = new URLSearchParams({ symbols: ticker, timeframe, start, end, adjustment, feed: "sip", limit: "10000", sort: "asc" });
    if (token) q.set("page_token", token);
    await sleep(320); // free plan: 200 requests per minute
    const j = JSON.parse(await get(`https://data.alpaca.markets/v2/stocks/bars?${q}`, { headers: ALPACA_HEADERS, retries: 5 }));
    bars.push(...(j.bars?.[ticker] ?? []));
    token = j.next_page_token;
  } while (token);
  return bars;
}

const PM_TICKERS = new Set(["SPY", "QQQ"]);

/** Merge pre-market levels of one month into daily/alpaca/premarket/<tk>.csv (kept sorted, one row per date). */
function savePremarket(tk, levels) {
  const rel = `daily/alpaca/premarket/${tk}.csv`, p = join(OUT, rel);
  const rows = new Map();
  if (existsSync(p)) for (const line of readFileSync(p, "utf8").trim().split("\n").slice(1)) { const [d, h, l, n] = line.split(","); rows.set(d, `${d},${h},${l},${n}`); }
  for (const [d, v] of levels) rows.set(d, `${d},${v.pmh},${v.pml},${v.bars}`);
  write(rel, "date,pmh,pml,bars\n" + [...rows.keys()].sort().map((d) => rows.get(d)).join("\n") + "\n");
}

async function alpaca() {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) { summary.push("alpaca: no keys, skipped"); return; }
  const manPath = join(OUT, "intraday/alpaca/manifest.json");
  const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, "utf8")) : {};
  const months = monthRange(ALPACA.from, lastCompleteMonth());
  let added = 0, stopped = false;
  // Alpaca reads a date-only `end` as the end of that day; the free plan refuses the latest 15 minutes, so stop at yesterday.
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  // official trading calendar (holidays and early closes), needed to cut sessions correctly
  await sleep(320);
  const cal = JSON.parse(await get(`https://paper-api.alpaca.markets/v2/calendar?start=2016-01-01&end=${yesterday}`, { headers: ALPACA_HEADERS, retries: 5 }));
  if (!Array.isArray(cal) || cal.length < 2500) throw new Error(`alpaca calendar: unexpected answer (${Array.isArray(cal) ? cal.length + " days" : typeof cal})`);
  for (const d of cal) if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.open) || !/^\d{2}:\d{2}$/.test(d.close)) throw new Error(`alpaca calendar: bad row ${JSON.stringify(d)}`);
  write("daily/alpaca/calendar.csv", "date,open,close\n" + cal.map((d) => `${d.date},${d.open},${d.close}`).join("\n") + "\n");
  summary.push(`alpaca calendar: ${cal.length} sessions, ${cal.filter((d) => d.close !== "16:00").length} early closes`);
  for (const tk of ALPACA.tickers) {
    // daily, adjusted for splits and dividends (small, refreshed every run)
    const d = await alpacaBars(tk, "1Day", "2016-01-01", yesterday, "all");
    if (d.length < 2000) throw new Error(`alpaca ${tk}: only ${d.length} daily bars`);
    write(`daily/alpaca/${tk}.csv`, "date,o,h,l,c,v\n" + d.map((b) => `${b.t.slice(0, 10)},${b.o},${b.h},${b.l},${b.c},${b.v}`).join("\n") + "\n");
    for (const month of months) {
      const key = `${tk}/1m/${month}`, rel = `intraday/alpaca/${key}.csv.gz`;
      const pmKey = `${tk}/pm/${month}`;
      const needPm = PM_TICKERS.has(tk) && !manifest[pmKey];
      if (manifest[key] && existsSync(join(OUT, rel)) && !needPm) continue;
      if (overBudget()) { stopped = true; break; }
      const { start, end } = monthBoundsUtc(month);
      const raw = await alpacaBars(tk, "1Min", start, end, "raw");
      if (needPm) {
        const lv = premarketLevels(raw, month);
        savePremarket(tk, lv);
        manifest[pmKey] = { days: lv.size };
      }
      if (manifest[key] && existsSync(join(OUT, rel))) continue; // minute file already stored; only the pre-market part was missing
      const r = normalizeAlpacaBars(raw, month);
      if (r.rows === 0) throw new Error(`alpaca ${key}: no regular-session bars`);
      write(rel, gzipSync(r.csv, { level: 9 }));
      manifest[key] = { rows: r.rows, days: r.days, droppedOutside: r.droppedOutside };
      added++;
      if (added % 20 === 0) write("intraday/alpaca/manifest.json", JSON.stringify(manifest, null, 1) + "\n"); // progress is never lost
    }
    if (stopped) break;
    if (PM_TICKERS.has(tk)) { // the current month so far, refreshed every run (weekly bot-vs-backtest report); not in the manifest,
      const cur = yesterday.slice(0, 7); // so the complete month is downloaded again by the loop above once it is over
      if (cur > months[months.length - 1]) {
        const raw = await alpacaBars(tk, "1Min", monthBoundsUtc(cur).start, `${yesterday}T23:59:59Z`, "raw");
        const r = normalizeAlpacaBars(raw, cur);
        if (r.rows > 0) write(`intraday/alpaca/${tk}/1m/${cur}.csv.gz`, gzipSync(r.csv, { level: 9 }));
        summary.push(`alpaca ${tk} ${cur} (partial): ${r.rows} rows, ${r.days} days`);
      }
    }
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  write("intraday/alpaca/manifest.json", JSON.stringify(sorted, null, 1) + "\n");
  const total = months.length * ALPACA.tickers.length;
  summary.push(`alpaca: ${added} new months, ${Object.keys(sorted).length} of ${total}${stopped ? " (time budget reached, continues next run)" : ""}`);
}

async function main() {
  for (const a of CM_ASSETS) {
    try { await coinmetrics(a); }
    catch (e) { if (CM_REQUIRED.has(a)) throw e; summary.push(`coinmetrics ${a}: skipped (${e.message.slice(0, 120)})`); }
  }
  for (const id of FRED) await fred(id);
  for (const t of YAHOO) await yahoo(t);
  await binanceMonths();
  await alpaca();
  for (const s of summary) console.log(s);
  writeFileSync(join(OUT, "LAST_RUN.txt"), `${new Date().toISOString()}\n${summary.join("\n")}\n`);
}

try {
  await main();
} catch (e) {
  // Shown as an annotation on the run (readable without the full log). Messages never contain the API keys.
  console.log(`::error title=pipeline::${String(e?.message ?? e).slice(0, 500)}`);
  for (const s of summary) console.log(s);
  process.exit(1);
}
