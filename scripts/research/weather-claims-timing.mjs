// When did the claimed entry prices exist (local time), and how favorable were they? node scripts/research/weather-claims-timing.mjs <probe-wx dir>
import { readFileSync } from "node:fs";
const claims = JSON.parse(readFileSync(new URL("../weather-claims.json", import.meta.url), "utf8"));
const ev = JSON.parse(readFileSync(process.argv[2] + "/events.json", "utf8"));
const TZ = { London: "Europe/London", "Los Angeles": "America/Los_Angeles", Chicago: "America/Chicago", "Buenos Aires": "America/Argentina/Buenos_Aires", Madrid: "Europe/Madrid", Paris: "Europe/Paris", Miami: "America/New_York", Munich: "Europe/Berlin", Toronto: "America/Toronto" };
const loc = (s, tz) => new Date(s * 1000).toLocaleString("sv-SE", { timeZone: tz }).slice(5, 16);
let sameDay = 0, before = 0;
for (const [date, city, bucket, side, entry, , res] of claims) {
  const e = ev[`${date}|${city}`];
  const h = (e.history[bucket] ?? []).map(([ts, p]) => [ts, side === "YES" ? p : 1 - p]);
  const near = h.filter(([, p]) => Math.abs(p - entry / 100) <= 0.015);
  const tz = TZ[city];
  const days = near.map(([ts]) => loc(ts, tz).slice(0, 5));
  const onDay = near.filter(([ts]) => new Date(ts * 1000).toLocaleDateString("sv-SE", { timeZone: tz }) === date);
  const prior = near.length - onDay.length;
  if (prior === 0) sameDay++; else before++;
  console.log(`${date} ${city.padEnd(12)} ${bucket.padEnd(14)} ${side} ${String(entry).padStart(5)}¢ ${res.padEnd(4)} | price seen (local): ${near.length ? `${loc(near[0][0], tz)} .. ${loc(near.at(-1)[0], tz)}` : "-"} | before the day: ${prior} pts, on the day: ${onDay.length}${onDay.length ? ` (${loc(onDay[0][0], tz).slice(6)}–${loc(onDay.at(-1)[0], tz).slice(6)})` : ""}`);
}
console.log(`entry price ONLY available on the day itself: ${sameDay}/${claims.length}; also available earlier: ${before}/${claims.length}`);
// How lucky is each entry? Share of the time (before the outcome was decided) when the claimed side was CHEAPER than the claimed entry.
console.log("\nshare of pre-decision time when the side was cheaper than the claimed entry (low = claimed entry is among the best prices):");
const out = [];
for (const [date, city, bucket, side, entry, , res, pl] of claims) {
  const e = ev[`${date}|${city}`];
  const h = (e.history[bucket] ?? []).map(([ts, p]) => [ts, side === "YES" ? p : 1 - p]);
  const decided = h.findIndex(([, p]) => p >= 0.99 || p <= 0.01);
  const pre = (decided > 0 ? h.slice(0, decided) : h);
  const cheaper = pre.filter(([, p]) => p < entry / 100 - 0.005).length / Math.max(1, pre.length);
  out.push({ date, city, side, entry, res, pl, cheaper });
}
const wins = out.filter((x) => x.res === "WIN" && x.entry < 90 && x.entry > 5);
for (const x of out.sort((a, b) => b.pl - a.pl).slice(0, 10)) console.log(`${x.date} ${x.city.padEnd(12)} ${x.side} ${x.entry}¢ ${x.res} $${x.pl}: cheaper ${(100 * x.cheaper).toFixed(0)}% of the time`);
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
console.log(`median 'cheaper' share: winners (5-90¢) ${(100 * med(wins.map((x) => x.cheaper))).toFixed(0)}% (n ${wins.length}); losers ${(100 * med(out.filter((x) => x.res === "LOSS").map((x) => x.cheaper))).toFixed(0)}%`);
