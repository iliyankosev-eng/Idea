// One-off research probe (runs in GitHub Actions; the sandbox cannot reach these sites).
// 1) Hyperliquid public info API: history of the wallets a Telegram copy-trading group gave out.
// 2) Feasibility check for testing Polymarket weather markets (Polymarket gamma/clob + Open-Meteo).
// Usage: node scripts/probe-hyperliquid.mjs <outDir>. Writes raw JSON only; analysis is done separately.
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "probe-out";
mkdirSync(`${OUT}/hl`, { recursive: true });
mkdirSync(`${OUT}/pm`, { recursive: true });

const WALLETS = {
  current: "0x3e470a0bf8460c3a8320327cf5db7deed3a3aaf6",
  prev1: "0x3d5f1ad033c4e7c6a6d433d50d694c488dcaebcf",
  prev2: "0x19f5c3bc2e0978d9a1da389d7d4cfe33cd770fe9",
  prev3: "0x2f01afc9f9437c4fcb8f2e8612c57bf522bcc81d",
  prev4: "0xc3d101ae37bba62baf199c6d5e5d8f0eecfd200e",
  prev5: "0x987163b6b482c30c2f5f3aa2760109668eb0091d",
  prev6: "0xe2f86feccb1207710a442bc4e27a0701a290275a",
  prev7: "0x04a30a7d59d08b028c7efceffc69e737cecef111",
};
const API = "https://api.hyperliquid.xyz/info";
const START = Date.UTC(2023, 0, 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

async function info(body) {
  for (let a = 0; a < 5; a++) {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 429) { await sleep(10_000 * (a + 1)); continue; }
    if (!r.ok) throw new Error(`${body.type} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await sleep(1200); // ~50 requests per minute, under the 1200 weight/minute limit
    return r.json();
  }
  throw new Error(`${body.type}: rate limited 5 times`);
}

/** All items in [s, e]: if a response hits the page limit, split the window in half (order of the API response does not matter). */
async function byTime(type, user, s, e, limit) {
  const xs = await info({ type, user, startTime: s, endTime: e });
  if (!Array.isArray(xs)) throw new Error(`${type}: not an array`);
  if (xs.length < limit || e - s < 60_000) return xs;
  const mid = Math.floor((s + e) / 2);
  return [...(await byTime(type, user, s, mid, limit)), ...(await byTime(type, user, mid + 1, e, limit))];
}

function dedupe(xs, key) {
  const m = new Map();
  for (const x of xs) m.set(key(x), x);
  return [...m.values()].sort((a, b) => a.time - b.time);
}

const now = Date.now();
for (const [name, user] of Object.entries(WALLETS)) {
  try {
    const portfolio = await info({ type: "portfolio", user });
    const state = await info({ type: "clearinghouseState", user });
    const spot = await info({ type: "spotClearinghouseState", user });
    const fills = dedupe(await byTime("userFillsByTime", user, START, now, 2000), (f) => `${f.hash}-${f.tid}-${f.oid}`);
    const funding = dedupe(await byTime("userFunding", user, START, now, 500), (f) => `${f.hash}-${f.time}-${f.delta?.coin}`);
    const ledger = dedupe(await byTime("userNonFundingLedgerUpdates", user, START, now, 500), (f) => `${f.hash}-${f.time}`);
    writeFileSync(`${OUT}/hl/${name}.json`, JSON.stringify({ user, fetchedAt: now, portfolio, state, spot, fills, funding, ledger }));
    log.push(`${name} ${user}: fills ${fills.length}, funding ${funding.length}, ledger ${ledger.length}`);
  } catch (e) {
    log.push(`${name} ${user}: ERROR ${e.message}`);
  }
}

// Polymarket + Open-Meteo feasibility (status and a sample only).
async function sample(name, url) {
  try {
    const r = await fetch(url);
    const t = await r.text();
    writeFileSync(`${OUT}/pm/${name}.json`, t.slice(0, 2_000_000));
    log.push(`${name}: HTTP ${r.status}, ${t.length} bytes`);
  } catch (e) {
    log.push(`${name}: ERROR ${e.message}`);
  }
}
await sample("gamma-search-temperature", "https://gamma-api.polymarket.com/public-search?q=highest%20temperature&limit_per_type=50&events_status=closed");
await sample("gamma-events-weather", "https://gamma-api.polymarket.com/events?tag_slug=weather&closed=true&limit=100&order=endDate&ascending=false");
await sample("openmeteo-histforecast-madrid", "https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=40.4936&longitude=-3.5668&start_date=2026-09-01&end_date=2026-09-07&daily=temperature_2m_max&models=ecmwf_ifs025,gfs_seamless,icon_seamless&timezone=Europe%2FMadrid");

writeFileSync(`${OUT}/LOG.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
