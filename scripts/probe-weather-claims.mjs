// Check claimed Polymarket weather trades (scripts/weather-claims.json) against the real markets.
// For every (city, date): the event, all buckets with their final result, and the 10-minute price history of the claimed bucket.
// Usage: node scripts/probe-weather-claims.mjs <outDir>   (runs in GitHub Actions)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "out";
mkdirSync(OUT, { recursive: true });
const claims = JSON.parse(readFileSync(new URL("./weather-claims.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
async function get(url) {
  for (let a = 0; a < 5; a++) {
    await sleep(250);
    try {
      const r = await fetch(url);
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; }
      const t = await r.text();
      return r.ok ? JSON.parse(t) : { error: r.status, text: t.slice(0, 200) };
    } catch { await sleep(3000); }
  }
  return { error: -1 };
}
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const slugCity = (c) => ({ "NYC": "nyc" }[c] ?? c.toLowerCase().replace(/ /g, "-"));
const events = {};
for (const [date, city] of claims) {
  const key = `${date}|${city}`;
  if (events[key]) continue;
  const [y, m, d] = date.split("-").map(Number);
  const slugs = [`highest-temperature-in-${slugCity(city)}-on-${MONTHS[m - 1]}-${d}-${y}`, `highest-temperature-in-${slugCity(city)}-on-${MONTHS[m - 1]}-${d}`];
  let ev = null;
  for (const s of slugs) {
    const r = await get(`https://gamma-api.polymarket.com/events?slug=${s}`);
    if (Array.isArray(r) && r.length) { ev = r[0]; break; }
  }
  if (!ev) { log.push(`${key}: event not found (${slugs.join(", ")})`); events[key] = null; continue; }
  const markets = (ev.markets ?? []).map((mk) => ({ label: mk.groupItemTitle, outcomes: JSON.parse(mk.outcomes ?? "[]"), final: JSON.parse(mk.outcomePrices ?? "[]"), tokens: JSON.parse(mk.clobTokenIds ?? "[]"), volume: mk.volumeNum, closedTime: mk.closedTime }));
  events[key] = { slug: ev.slug, title: ev.title, createdAt: ev.createdAt, endDate: ev.endDate, closedTime: ev.closedTime, desc: (ev.description ?? "").slice(0, 600), markets, history: {} };
  log.push(`${key}: ${ev.slug}, ${markets.length} buckets`);
}
for (const [date, city, bucket] of claims) {
  const e = events[`${date}|${city}`];
  if (!e) continue;
  const mk = e.markets.find((x) => x.label === bucket);
  if (!mk) { log.push(`${date} ${city} ${bucket}: bucket not found (have: ${e.markets.map((x) => x.label).join(" | ")})`); continue; }
  if (e.history[bucket]) continue;
  const yes = mk.tokens[mk.outcomes.indexOf("Yes")] ?? mk.tokens[0];
  const a = Math.floor(Date.parse(e.createdAt) / 1000) - 3600, b = Math.floor(Date.parse(e.endDate) / 1000) + 2 * 86400;
  const pts = [];
  for (let s = a; s < b; s += 6 * 86400) {
    const r = await get(`https://clob.polymarket.com/prices-history?market=${yes}&startTs=${s}&endTs=${Math.min(s + 6 * 86400, b)}&fidelity=10`);
    for (const x of r.history ?? []) pts.push([x.t, x.p]);
    if (r.error) log.push(`${date} ${city} ${bucket}: history HTTP ${r.error}`);
  }
  e.history[bucket] = pts.sort((x, y) => x[0] - y[0]);
}
writeFileSync(`${OUT}/events.json`, JSON.stringify(events));
writeFileSync(`${OUT}/LOG.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
