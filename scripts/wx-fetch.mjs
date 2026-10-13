// Same-day weather test data (experiments/weather-sameday-preregistration.md), added to the pmdata branch:
//  w/fc1/<ICAO>-<f|c>-<start>.json.gz  Open-Meteo previous_day1 hourly forecasts (ECMWF, GFS, ICON)
//  w/obs/<ICAO>.csv                     Iowa Environmental Mesonet METAR/ASOS temperatures (UTC, °F)
// Usage: node scripts/wx-fetch.mjs <pmdata dir>   (GitHub Actions)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIR = process.argv[2] ?? "pmdata";
mkdirSync(`${DIR}/w/fc1`, { recursive: true });
mkdirSync(`${DIR}/w/obs`, { recursive: true });
const events = JSON.parse(readFileSync(`${DIR}/w/events.json`, "utf8"));
const stations = JSON.parse(readFileSync(`${DIR}/w/stations.json`, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { log.push(s); console.log(s); };
const day = 86_400_000, iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const icaoOf = (desc) => {
  const m = desc.match(/wunderground\.com\/history\/daily\/(?:[^/\s]+\/)+([A-Za-z0-9]{4})(?=[/?#.,\s)]|$)/i) ?? desc.match(/timeseries\?site=([A-Za-z0-9]{4})\b/i);
  return m ? m[1].toUpperCase() : null;
};
async function get(url, gap = 500) {
  for (let a = 0; a < 5; a++) {
    await sleep(gap);
    try {
      const r = await fetch(url);
      if (r.status === 429 || r.status >= 500) { await sleep(10_000 * (a + 1)); continue; }
      return { status: r.status, text: await r.text() };
    } catch { await sleep(5000); }
  }
  return { status: -1, text: "" };
}
const need = new Map();
for (const e of events) {
  const icao = icaoOf(e.desc);
  if (!icao || !stations[icao]) continue;
  const unit = e.markets.some((m) => /°F/.test(m.label ?? "")) ? "fahrenheit" : "celsius";
  const k = `${icao}|${unit}`, d = Date.parse(e.endDate.slice(0, 10));
  const r = need.get(k) ?? [d, d];
  need.set(k, [Math.min(r[0], d - 2 * day), Math.max(r[1], d + day)]);
}
for (const [k, [a, b]] of need) {
  const [icao, unit] = k.split("|"), st = stations[icao];
  for (let s = a; s <= b; s += 90 * day) {
    const p = `${DIR}/w/fc1/${icao}-${unit[0]}-${iso(s)}.json.gz`;
    if (existsSync(p)) continue;
    const e = Math.min(s + 89 * day, b);
    const r = await get(`https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}&hourly=temperature_2m_previous_day1&models=ecmwf_ifs025,gfs_seamless,icon_seamless&start_date=${iso(s)}&end_date=${iso(e)}&timezone=auto&temperature_unit=${unit}`);
    let j = null; try { j = JSON.parse(r.text); } catch {}
    if (!j?.hourly) { say(`fc1 ${k} ${iso(s)}: HTTP ${r.status} ${r.text.slice(0, 150)}`); continue; }
    writeFileSync(p, gzipSync(JSON.stringify({ icao, unit, timezone: j.timezone, hourly: j.hourly })));
  }
  // observations for the whole range, UTC
  const op = `${DIR}/w/obs/${icao}.csv`;
  if (existsSync(op)) continue;
  const A = new Date(a), B = new Date(b + day);
  const q = (id) => `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${id}&data=tmpf&year1=${A.getUTCFullYear()}&month1=${A.getUTCMonth() + 1}&day1=${A.getUTCDate()}&year2=${B.getUTCFullYear()}&month2=${B.getUTCMonth() + 1}&day2=${B.getUTCDate()}&tz=Etc/UTC&format=onlycomma&latlon=no&missing=M&trace=T&report_type=3&report_type=4`;
  let r = await get(q(icao), 3000);
  let rows = r.text.trim().split("\n").length - 1;
  if (rows < 100 && icao.startsWith("K")) { r = await get(q(icao.slice(1)), 3000); rows = r.text.trim().split("\n").length - 1; }
  if (rows < 100) { say(`obs ${icao}: only ${rows} rows (HTTP ${r.status}) ${r.text.slice(0, 150)}`); continue; }
  writeFileSync(op, r.text);
  say(`obs ${icao}: ${rows} rows ${iso(a)}..${iso(b)}`);
}
say(`fc1 files: done for ${need.size} station/unit pairs`);
writeFileSync(`${DIR}/LAST_RUN_WX.txt`, log.join("\n") + "\n");
