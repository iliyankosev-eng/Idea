// N3 data (experiments/weather-botreplica-preregistration.md): individual model runs from Open-Meteo single-runs API,
// only the runs that were available at 08:00 and 10:00 local time on each event day (2026-06-01..2026-10-10).
// Writes <pmdata>/w/runs/<ICAO>/<model>/<init>.json = {time: [UTC ISO], temp: [...]} in the market's unit. Resumable.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = process.argv[2] ?? "pmdata";
const BUDGET_MS = Number(process.env.BUDGET_MIN ?? 320) * 60_000, T0 = Date.now();
const events = JSON.parse(readFileSync(`${DIR}/w/events.json`, "utf8"));
const stations = JSON.parse(readFileSync(`${DIR}/w/stations.json`, "utf8"));
const TZ = { EDDM: "Europe/Berlin", EGLC: "Europe/London", KATL: "America/New_York", KLGA: "America/New_York", KORD: "America/Chicago", LEMD: "Europe/Madrid", LFPB: "Europe/Paris", LFPG: "Europe/Paris", LIMC: "Europe/Rome", RJTT: "Asia/Tokyo", UUWW: "Europe/Moscow", ZSPD: "Asia/Shanghai" };
const EUROPE = new Set(["EDDM", "EGLC", "LEMD", "LFPB", "LFPG", "LIMC", "UUWW"]);
export const DELAY_H = { icon_d2: 3, icon_eu: 4, icon_global: 5, gfs_global: 6, ecmwf_ifs025: 8 };
const modelsFor = (icao) => (EUROPE.has(icao) ? ["icon_d2", "icon_eu", "ecmwf_ifs025"] : ["ecmwf_ifs025", "gfs_global", "icon_global"]);
const icaoOf = (desc) => {
  const m = desc.match(/wunderground\.com\/history\/daily\/(?:[^/\s]+\/)+([A-Za-z0-9]{4})(?=[/?#.,\s)]|$)/i) ?? desc.match(/timeseries\?site=([A-Za-z0-9]{4})\b/i);
  return m ? m[1].toUpperCase() : null;
};
function tzOffset(tz, ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}
export function localToUtcMs(D, hour, tz) {
  const [y, m, d] = D.split("-").map(Number);
  const g = Date.UTC(y, m - 1, d, hour);
  let u = g - tzOffset(tz, g); u = g - tzOffset(tz, u);
  return u;
}
/** Latest 00/06/12/18 UTC run that started at least `delay` hours before t. */
export function runFor(tMs, delayH) {
  const lim = tMs - delayH * 3_600_000;
  return Math.floor(lim / 21_600_000) * 21_600_000;
}
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
const jobs = new Map();
for (const e of events) {
  const D = e.endDate.slice(0, 10);
  if (D < "2026-06-01" || D > "2026-10-10") continue;
  const icao = icaoOf(e.desc ?? "");
  if (!icao || !TZ[icao] || !stations[icao]) continue;
  const unit = e.markets.some((m) => /°F/.test(m.groupItemTitle ?? m.label ?? "")) ? "fahrenheit" : "celsius";
  for (const hour of [8, 10]) for (const m of modelsFor(icao)) {
    const init = runFor(localToUtcMs(D, hour, TZ[icao]), DELAY_H[m]);
    jobs.set(`${icao}|${m}|${init}`, { icao, m, init, unit });
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noData = new Set();
let done = 0, skipped = 0, failed = 0;
const log = [];
for (const j of jobs.values()) {
  if (Date.now() - T0 > BUDGET_MS) break;
  const dir = `${DIR}/w/runs/${j.icao}/${j.m}`, p = `${dir}/${iso(j.init).replace(":", "")}.json`;
  if (existsSync(p) || noData.has(`${j.icao}|${j.m}`)) { skipped++; continue; }
  const st = stations[j.icao];
  const url = `https://single-runs-api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}&hourly=temperature_2m&models=${j.m}&run=${iso(j.init)}&forecast_hours=72&temperature_unit=${j.unit}&timezone=GMT`;
  let ok = false;
  for (let a = 0; a < 5 && !ok; a++) {
    await sleep(800);
    try {
      const r = await fetch(url); const t = await r.text();
      if (r.status === 429) { await sleep(60_000 * (a + 1)); continue; }
      if (r.status === 400 && /No data is available for this location/.test(t)) { noData.add(`${j.icao}|${j.m}`); log.push(`${j.icao} ${j.m}: no data for this location`); ok = true; break; }
      if (!r.ok) { if (a === 4 || r.status === 400) { failed++; if (failed <= 10) log.push(`${j.icao} ${j.m} ${iso(j.init)}: HTTP ${r.status} ${t.slice(0, 120)}`); ok = true; } continue; }
      const h = JSON.parse(t).hourly;
      const key = Object.keys(h).find((k) => k.startsWith("temperature_2m"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(p, JSON.stringify({ time: h.time, temp: h[key] }));
      done++; ok = true;
    } catch { await sleep(5000); }
  }
}
log.push(`runs: jobs ${jobs.size}, new ${done}, already there ${skipped}, failed ${failed}, minutes ${((Date.now() - T0) / 60000).toFixed(0)}${Date.now() - T0 > BUDGET_MS ? " — BUDGET HIT, run again" : ""}`);
writeFileSync(`${DIR}/LAST_RUN_RUNS.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
