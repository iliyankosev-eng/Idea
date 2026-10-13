// Compare claimed weather-bot trades with the real Polymarket markets: result and whether the entry price existed.
// Usage: node scripts/research/weather-claims.mjs <probe-wx dir>
import { readFileSync } from "node:fs";
const DIR = process.argv[2];
const claims = JSON.parse(readFileSync(new URL("../weather-claims.json", import.meta.url), "utf8"));
const ev = JSON.parse(readFileSync(`${DIR}/events.json`, "utf8"));
const t = (s) => new Date(s * 1000).toISOString().slice(5, 16).replace("T", " ");
let ok = 0, wrong = 0, priceOk = 0, n = 0;
const rows = [];
for (const [date, city, bucket, side, entry, stake, res, pl] of claims) {
  const e = ev[`${date}|${city}`]; const mk = e.markets.find((x) => x.label === bucket);
  const yesWon = mk.final[mk.outcomes.indexOf("Yes")] === "1";
  const winner = e.markets.find((x) => x.final[x.outcomes.indexOf("Yes")] === "1")?.label ?? "?";
  const real = (side === "YES") === yesWon ? "WIN" : "LOSS";
  n++; if (real === res) ok++; else wrong++;
  const h = (e.history[bucket] ?? []).map(([ts, p]) => [ts, side === "YES" ? p : 1 - p]);
  const target = entry / 100;
  const near = h.filter(([, p]) => Math.abs(p - target) <= 0.015);
  const lo = Math.min(...h.map((x) => x[1])), hi = Math.max(...h.map((x) => x[1]));
  if (near.length) priceOk++;
  const end = Date.parse(`${date}T23:59:00Z`) / 1000;
  rows.push(`${date} ${city.padEnd(12)} ${bucket.padEnd(15)} ${side.padEnd(3)} ${String(entry).padStart(6)}¢ claimed ${res.padEnd(4)} real ${real.padEnd(4)} ${real === res ? "  " : "!!"} | winner ${winner.padEnd(15)} | side price range ${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}¢, within ±1.5¢ of entry: ${near.length ? `${near.length} pts, first ${t(near[0][0])} last ${t(near.at(-1)[0])}` : "NEVER"} (points ${h.length})`);
}
console.log(rows.join("\n"));
console.log(`\nresult matches: ${ok}/${n}, wrong: ${wrong}; entry price seen in history (±1.5¢): ${priceOk}/${n}`);
