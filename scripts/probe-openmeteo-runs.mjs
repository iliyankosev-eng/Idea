// Feasibility only: does Open-Meteo keep individual model runs (single-runs API), how far back, which models? Usage: node scripts/probe-openmeteo-runs.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = process.argv[2] ?? "out";
mkdirSync(OUT, { recursive: true });
const log = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const models = ["ecmwf_ifs025", "icon_d2", "icon_eu", "icon_global", "gfs_seamless", "gfs_global", "ncep_hrrr_conus"];
const places = { munich: [48.35, 11.79], miami: [25.79, -80.32] };
for (const run of ["2026-09-18T00:00", "2026-04-01T00:00", "2026-01-05T00:00"]) for (const [pl, [la, lo]] of Object.entries(places)) for (const m of models) {
  await sleep(400);
  const url = `https://single-runs-api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m&models=${m}&run=${run}&forecast_hours=48`;
  try {
    const r = await fetch(url); const t = await r.text();
    let n = 0, mx = null; try { const j = JSON.parse(t); const v = Object.entries(j.hourly ?? {}).find(([k]) => k.startsWith("temperature_2m"))?.[1] ?? []; n = v.filter((x) => x !== null).length; mx = Math.max(...v.filter((x) => x !== null)); } catch {}
    log.push(`${run} ${pl} ${m}: HTTP ${r.status}, values ${n}, max ${mx} ${r.ok ? "" : t.slice(0, 120)}`);
  } catch (e) { log.push(`${run} ${pl} ${m}: ERROR ${e.message}`); }
}
writeFileSync(`${OUT}/LOG.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
