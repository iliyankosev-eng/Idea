// Probe of Polymarket / Open-Meteo / aviationweather endpoints: structure and limits only (no strategy results).
// Usage: node scripts/probe-polymarket.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "out";
mkdirSync(OUT, { recursive: true });
const log = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(name, url, keep = 300_000) {
  try {
    const r = await fetch(url);
    const t = await r.text();
    writeFileSync(`${OUT}/${name}.json`, t.slice(0, keep));
    log.push(`${name}: HTTP ${r.status}, ${t.length} bytes`);
    await sleep(300);
    try { return JSON.parse(t); } catch { return null; }
  } catch (e) {
    log.push(`${name}: ERROR ${e.message}`);
    return null;
  }
}

const G = "https://gamma-api.polymarket.com";
// 1) Daily temperature events: how many, from when, which cities
let events = [];
for (let off = 0; off < 20000; off += 500) {
  const xs = await get(`gamma-temp-${off}`, `${G}/events?tag_slug=daily-temperature&closed=true&limit=500&offset=${off}`, 1000);
  if (!Array.isArray(xs) || !xs.length) break;
  events.push(...xs.map((e) => ({ id: e.id, title: e.title, endDate: e.endDate, startDate: e.startDate, createdAt: e.createdAt, volume: e.volume, nMarkets: e.markets?.length, desc: (e.description ?? "").slice(0, 600),
    markets: (e.markets ?? []).map((m) => ({ q: m.groupItemTitle, tokens: m.clobTokenIds, outcomePrices: m.outcomePrices, volume: m.volumeNum, conditionId: m.conditionId, closedTime: m.closedTime })) })));
}
writeFileSync(`${OUT}/temp-events.json`, JSON.stringify(events));
log.push(`temp events: ${events.length}`);

// 2) Price history for one closed weather market at several fidelities
const sample = events.find((e) => e.nMarkets > 3 && Number(e.volume) > 20000);
if (sample) {
  const tok = JSON.parse(sample.markets[2].tokens)[0];
  const end = Math.floor(Date.parse(sample.endDate) / 1000);
  for (const fid of [1, 10, 60]) await get(`clob-hist-f${fid}`, `https://clob.polymarket.com/prices-history?market=${tok}&startTs=${end - 4 * 86400}&endTs=${end + 86400}&fidelity=${fid}`);
  await get("clob-hist-max", `https://clob.polymarket.com/prices-history?market=${tok}&interval=max&fidelity=60`);
  // 3) Trades of one market (data-api) and the paging limit
  const cid = sample.markets[2].conditionId;
  await get("data-trades-0", `https://data-api.polymarket.com/trades?market=${cid}&limit=500&offset=0`);
  await get("data-trades-3000", `https://data-api.polymarket.com/trades?market=${cid}&limit=500&offset=3000`);
  await get("data-trades-10000", `https://data-api.polymarket.com/trades?market=${cid}&limit=500&offset=10000`);
}

// 4) Large closed markets (for Pulse / Cluster)
await get("gamma-big-closed", `${G}/markets?closed=true&order=volumeNum&ascending=false&end_date_min=2026-04-01T00:00:00Z&limit=500`, 3_000_000);

// 5) Forecast archive: previous runs (forecast made ~2 days earlier) for LaGuardia
await get("om-prevruns-klga", "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=40.7769&longitude=-73.874&hourly=temperature_2m_previous_day2&models=ecmwf_ifs025,gfs_seamless,icon_seamless&start_date=2025-06-01&end_date=2025-06-03&timezone=auto&temperature_unit=fahrenheit", 50_000);
await get("om-prevruns-klga-2024", "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=40.7769&longitude=-73.874&hourly=temperature_2m_previous_day2&models=ecmwf_ifs025,gfs_seamless,icon_seamless&start_date=2024-03-01&end_date=2024-03-02&timezone=auto&temperature_unit=fahrenheit", 50_000);

// 6) Station coordinates
await get("awc-stations", "https://aviationweather.gov/api/data/stationinfo?ids=KLGA,EGLC,LEMD,KORD,RJTT&format=json", 50_000);
// 7) Observed hourly temps (Iowa Environmental Mesonet ASOS), to check resolutions independently
await get("iem-klga", "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=LGA&data=tmpf&year1=2026&month1=10&day1=10&year2=2026&month2=10&day2=11&tz=America/New_York&format=onlycomma&latlon=no&missing=M&trace=T&report_type=3", 50_000);

writeFileSync(`${OUT}/LOG.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
