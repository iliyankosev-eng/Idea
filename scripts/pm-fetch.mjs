// Resumable downloader for the Polymarket tests (experiments/polymarket-preregistration.md).
// Runs in GitHub Actions (the sandbox cannot reach these sites). Usage: node scripts/pm-fetch.mjs <dir>
// Stages (each skips work already on disk): W events -> stations -> forecasts -> prices; P list -> histories; K list -> trades.
// Raw data only; no strategy logic here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

const DIR = process.argv[2] ?? "pmdata";
const BUDGET_MS = Number(process.env.BUDGET_MIN ?? 320) * 60_000;
const T0 = Date.now();
const timeUp = () => Date.now() - T0 > BUDGET_MS;
const log = [];
const say = (s) => { log.push(s); console.log(s); };
for (const d of ["w/prices", "w/fc", "p/h", "k/t"]) mkdirSync(`${DIR}/${d}`, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = { "gamma-api.polymarket.com": 150, "clob.polymarket.com": 110, "data-api.polymarket.com": 160, "previous-runs-api.open-meteo.com": 400, "aviationweather.gov": 1200 };
const chain = {};
const stats = {};
async function getJson(url) {
  const host = new URL(url).host;
  for (let a = 0; a < 6; a++) {
    chain[host] = (chain[host] ?? Promise.resolve()).then(() => sleep(GAP[host] ?? 300));
    await chain[host];
    let r;
    try { r = await fetch(url); } catch (e) { await sleep(2000 * (a + 1)); continue; }
    stats[host] = (stats[host] ?? 0) + 1;
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; }
    const text = await r.text();
    if (!r.ok) return { status: r.status, json: null, text: text.slice(0, 200) };
    try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, json: null, text: `bad JSON (${text.length} bytes)` }; }
  }
  return { status: -1, json: null, text: "gave up after retries" };
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length && !timeUp()) await fn(items[i++]); }));
}
const saveGz = (p, obj) => writeFileSync(p, gzipSync(JSON.stringify(obj)));
const loadGz = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString());
const parse = (s, dflt) => { try { return typeof s === "string" ? JSON.parse(s) : s ?? dflt; } catch { return dflt; } };
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + "Z";
const day = 86_400_000;

// ---------------- W: weather events ----------------
const CITIES = ["Madrid", "Paris", "Moscow", "Hong Kong", "Chicago", "London", "NYC", "Tokyo", "Shanghai", "Milan", "Munich", "Atlanta"];
const CITY_RE = new RegExp(`^Highest temperature in (${CITIES.join("|")}) on `);
const G = "https://gamma-api.polymarket.com";
const evPath = `${DIR}/w/events.json`;
let wEvents = existsSync(evPath) ? JSON.parse(readFileSync(evPath, "utf8")) : null;
if (!wEvents) {
  const byId = new Map();
  let outside = 0;
  for (let a = Date.UTC(2025, 0, 1); a < Date.UTC(2026, 9, 11); a += 7 * day) {
    const b = Math.min(a + 7 * day, Date.UTC(2026, 9, 11));
    for (let off = 0; off < 2400; off += 100) {
      const { status, json, text } = await getJson(`${G}/events?tag_slug=daily-temperature&closed=true&limit=100&offset=${off}&end_date_min=${iso(a)}&end_date_max=${iso(b)}`);
      if (!Array.isArray(json)) { say(`W events ${iso(a)} off ${off}: HTTP ${status} ${text ?? ""}`); break; }
      for (const e of json) {
        const end = Date.parse(e.endDate);
        if (!(end >= a && end <= b)) outside++;
        if (!CITY_RE.test(e.title ?? "")) continue;
        byId.set(e.id, {
          id: e.id, title: e.title, slug: e.slug, createdAt: e.createdAt, startDate: e.startDate, endDate: e.endDate, closedTime: e.closedTime,
          desc: (e.description ?? "").slice(0, 1500),
          markets: (e.markets ?? []).map((m) => ({ label: m.groupItemTitle, tokens: parse(m.clobTokenIds, []), outcomes: parse(m.outcomes, []), final: parse(m.outcomePrices, []), closedTime: m.closedTime, volume: m.volumeNum })),
        });
      }
      if (json.length < 100) break;
    }
  }
  wEvents = [...byId.values()].sort((x, y) => Date.parse(x.endDate) - Date.parse(y.endDate));
  writeFileSync(evPath, JSON.stringify(wEvents));
  say(`W events: ${wEvents.length} for the 12 cities; rows outside the date window (filter check): ${outside}`);
}

// stations
const stPath = `${DIR}/w/stations.json`;
let stations = existsSync(stPath) ? JSON.parse(readFileSync(stPath, "utf8")) : {};
const icaoOf = (desc) => {
  const m = desc.match(/wunderground\.com\/history\/daily\/(?:[^/\s]+\/)+([A-Za-z0-9]{4})(?=[/?#.,\s)]|$)/i) ?? desc.match(/timeseries\?site=([A-Za-z0-9]{4})\b/i);
  return m ? m[1].toUpperCase() : null;
};
{
  const ids = [...new Set(wEvents.map((e) => icaoOf(e.desc)).filter(Boolean))];
  const missing = ids.filter((id) => !stations[id]);
  if (missing.length) {
    const { json } = await getJson(`https://aviationweather.gov/api/data/stationinfo?ids=${missing.join(",")}&format=json`);
    for (const s of json ?? []) stations[s.icaoId] = { lat: s.lat, lon: s.lon, site: s.site };
  }
  writeFileSync(stPath, JSON.stringify(stations));
  const noIcao = wEvents.filter((e) => !icaoOf(e.desc));
  say(`W stations: ${Object.keys(stations).length} of ${ids.length} found (${ids.join(",")}); events without a parsable station: ${noIcao.length} (${[...new Set(noIcao.map((e) => e.title.replace(/ on .*/, "")))].join("; ")})`);
}

// forecasts: per station, 90-day chunks covering D-3 .. D
const unitOf = (e) => (e.markets.some((m) => /°F/.test(m.label ?? "")) ? "fahrenheit" : "celsius");
{
  const need = new Map(); // key icao|unit -> [minMs, maxMs]
  for (const e of wEvents) {
    const icao = icaoOf(e.desc);
    if (!icao || !stations[icao]) continue;
    const k = `${icao}|${unitOf(e)}`, d = Date.parse(e.endDate.slice(0, 10));
    const r = need.get(k) ?? [d, d];
    need.set(k, [Math.min(r[0], d - 3 * day), Math.max(r[1], d)]);
  }
  const jobs = [];
  for (const [k, [a, b]] of need) for (let s = a; s <= b; s += 90 * day) jobs.push([k, s, Math.min(s + 89 * day, b)]);
  let done = 0, failed = 0;
  await pool(jobs, 2, async ([k, s, e]) => {
    const [icao, unit] = k.split("|");
    const p = `${DIR}/w/fc/${icao}-${unit[0]}-${iso(s).slice(0, 10)}.json.gz`;
    if (existsSync(p)) return;
    const st = stations[icao];
    const url = `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}&hourly=temperature_2m_previous_day2&models=ecmwf_ifs025,gfs_seamless,icon_seamless&start_date=${iso(s).slice(0, 10)}&end_date=${iso(e).slice(0, 10)}&timezone=auto&temperature_unit=${unit}`;
    const { status, json, text } = await getJson(url);
    if (!json?.hourly) { failed++; say(`W fc ${k} ${iso(s)}: HTTP ${status} ${text ?? ""}`); return; }
    saveGz(p, { icao, unit, timezone: json.timezone, lat: json.latitude, lon: json.longitude, hourly: json.hourly });
    done++;
  });
  say(`W forecasts: ${jobs.length} chunks, new ${done}, failed ${failed}`);
}

// prices: whole life of each bucket's YES token, hourly
{
  let done = 0, empty = 0, failed = 0;
  await pool(wEvents, 4, async (e) => {
    const p = `${DIR}/w/prices/${e.id}.json.gz`;
    if (existsSync(p)) return;
    const a = Math.floor(Date.parse(e.createdAt) / 1000) - 3600, b = Math.floor(Date.parse(e.endDate) / 1000) + 2 * 86400;
    const out = {};
    for (const m of e.markets) {
      const yes = m.tokens[m.outcomes.indexOf("Yes")] ?? m.tokens[0];
      if (!yes) continue;
      const { status, json, text } = await getJson(`https://clob.polymarket.com/prices-history?market=${yes}&startTs=${a}&endTs=${b}&fidelity=60`);
      if (!json) { failed++; say(`W price ${e.id} ${m.label}: HTTP ${status} ${text ?? ""}`); return; } // do not save a partial event
      out[m.label] = (json.history ?? []).map((x) => [x.t, x.p]);
      if (!out[m.label].length) empty++;
    }
    saveGz(p, out);
    done++;
  });
  say(`W prices: new events ${done}, empty bucket histories ${empty}, failures ${failed}`);
}

// ---------------- markets lists for P and K ----------------
async function marketList(path, query, from, to, keep) {
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const byId = new Map();
  for (let a = from; a < to; a += 14 * day) {
    const b = Math.min(a + 14 * day, to);
    for (let off = 0; off < 2400; off += 100) {
      const { status, json, text } = await getJson(`${G}/markets?closed=true&limit=100&offset=${off}&end_date_min=${iso(a)}&end_date_max=${iso(b)}&${query}`);
      if (!Array.isArray(json)) { say(`list ${path} ${iso(a)} off ${off}: HTTP ${status} ${text ?? ""}`); break; }
      for (const m of json) {
        const outcomes = parse(m.outcomes, []);
        if (outcomes.length !== 2 || outcomes[0] !== "Yes" || outcomes[1] !== "No") continue;
        if (/^Highest temperature|Up or Down/i.test(m.question ?? "")) continue;
        if (!keep(Number(m.volumeNum))) continue; // local check in case the API ignores the volume filter
        byId.set(m.id, { id: m.id, q: m.question, slug: m.slug, conditionId: m.conditionId, tokens: parse(m.clobTokenIds, []), final: parse(m.outcomePrices, []),
          volume: m.volumeNum, startDate: m.startDate, createdAt: m.createdAt, endDate: m.endDate, closedTime: m.closedTime, events: (m.events ?? []).map((x) => x.slug) });
      }
      if (json.length < 100) break;
    }
  }
  const xs = [...byId.values()];
  writeFileSync(path, JSON.stringify(xs));
  say(`list ${path}: ${xs.length} binary markets`);
  return xs;
}

// ---------------- P: price histories every 10 minutes ----------------
if (!timeUp()) {
  const pm = await marketList(`${DIR}/p/markets.json`, "volume_num_min=1000000", Date.UTC(2026, 0, 1), Date.UTC(2026, 9, 11), (v) => v >= 1e6);
  let done = 0, failed = 0;
  await pool(pm, 4, async (m) => {
    const p = `${DIR}/p/h/${m.id}.json.gz`;
    if (existsSync(p) || !m.closedTime) return;
    const end = Math.floor(Date.parse(m.closedTime.replace(" ", "T").replace("+00", "Z")) / 1000);
    const st = Math.floor(Date.parse(m.startDate ?? m.createdAt) / 1000);
    const start = Math.max(st, end - 120 * 86400);
    if (!(end > start)) return;
    const pts = [];
    for (let a = start; a < end; a += 30 * 86400) {
      const b = Math.min(a + 30 * 86400, end);
      const { json } = await getJson(`https://clob.polymarket.com/prices-history?market=${m.tokens[0]}&startTs=${a}&endTs=${b}&fidelity=10`);
      if (!json) { failed++; return; }
      let h = json.history ?? [];
      if (!h.length && b - a > 7 * 86400) { // long windows may come back empty: retry in 7-day pieces
        for (let c = a; c < b; c += 7 * 86400) {
          const r = await getJson(`https://clob.polymarket.com/prices-history?market=${m.tokens[0]}&startTs=${c}&endTs=${Math.min(c + 7 * 86400, b)}&fidelity=10`);
          if (!r.json) { failed++; return; }
          h = h.concat(r.json.history ?? []);
        }
      }
      for (const x of h) pts.push([x.t, x.p]);
    }
    saveGz(p, pts);
    done++;
  });
  say(`P histories: new ${done}, failures ${failed}`);
}

// ---------------- K: trades of a random sample ----------------
if (!timeUp()) {
  const km = await marketList(`${DIR}/k/markets.json`, "volume_num_min=100000&volume_num_max=5000000", Date.UTC(2026, 3, 1), Date.UTC(2026, 9, 11), (v) => v >= 1e5 && v <= 5e6);
  let seed = 12;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sorted = [...km].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = sorted.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sorted[i], sorted[j]] = [sorted[j], sorted[i]]; }
  const sample = sorted.slice(0, 400);
  writeFileSync(`${DIR}/k/sample.json`, JSON.stringify(sample.map((m) => m.id)));
  let done = 0, partial = 0;
  await pool(sample, 3, async (m) => {
    const p = `${DIR}/k/t/${m.id}.json.gz`;
    if (existsSync(p)) return;
    const rows = [];
    let complete = false, note = "";
    for (let off = 0; off <= 100_000; off += 500) {
      const { status, json, text } = await getJson(`https://data-api.polymarket.com/trades?market=${m.conditionId}&limit=500&offset=${off}`);
      if (!Array.isArray(json)) { note = `HTTP ${status} ${text ?? ""} at offset ${off}`; break; }
      for (const t of json) rows.push([t.timestamp, t.proxyWallet, t.side === "BUY" ? "B" : "S", t.outcomeIndex, t.size, t.price]);
      if (json.length < 500) { complete = true; break; }
    }
    if (!complete) partial++;
    saveGz(p, { complete, note, n: rows.length, rows });
    done++;
  });
  say(`K trades: new ${done}, incomplete ${partial}`);
}

say(`requests: ${JSON.stringify(stats)}; minutes ${((Date.now() - T0) / 60000).toFixed(0)}; ${timeUp() ? "BUDGET HIT, run again" : "all stages done"}`);
writeFileSync(`${DIR}/LAST_RUN.txt`, log.join("\n") + "\n");
