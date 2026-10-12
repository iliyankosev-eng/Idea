// Run: npx tsx src/cli/pm-pc-check.ts [data/pm]. Post-hoc robustness checks of PC (added after the results; they do not change the verdict).
// Diagnostics for PC (counter-trade after a spike). Not part of the pre-registered verdict.
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { mulberry32 } from "../evaluate.js";
import { bootstrapByDay, mean, priceAt, type Pt } from "../pm/common.js";
import { findSpikes, holdReturn, resolved } from "../pm/flow.js";
const D = process.argv[2] ?? "data/pm";
const gz = (p: string) => JSON.parse(gunzipSync(readFileSync(p)).toString());
const ms: any[] = JSON.parse(readFileSync(`${D}/p/markets.json`, "utf8"));
const rows: any[] = [];
const mk: any[] = [];
for (const m of ms) {
  const p = `${D}/p/h/${m.id}.json.gz`; if (!existsSync(p) || !m.closedTime) continue;
  const yes = resolved(m.final, 0); if (yes === null) continue;
  const h: Pt[] = gz(p).sort((a: Pt, b: Pt) => a[0] - b[0]); if (h.length < 10) continue;
  const close = Date.parse(m.closedTime.replace(" ", "T").replace("+00", "Z")) / 1000;
  mk.push({ m, h, close, yes });
  for (const s of findSpikes(h, close)) {
    const side = (s.dir === 1 ? -1 : 1) as 1 | -1;
    const r = holdReturn(h, close, yes, s.t, side, 86400, 0.01);
    if (r === null) continue;
    const r2 = holdReturn(h, close, yes, s.t, side, 86400, 0.02);
    const late = holdReturn(h, close, yes, s.t + 1200, side, 86400, 0.01); // entry 30 min after the spike instead of 10
    const te = s.t + 600, pe = priceAt(h, te, 1200)!;
    const viaRes = te + 86400 >= close;
    const nAround = h.filter(([t]) => t >= s.t - 3600 && t <= s.t + 3600).length;
    const pts6 = h.filter(([t]) => t > te && t <= te + 6 * 3600).map((x) => x[1]);
    rows.push({ id: m.id, q: m.q, slug: (m.events?.[0] ?? m.slug) as string, t: s.t, day: new Date(s.t * 1000).toISOString().slice(0, 10), dir: s.dir, from: s.from, to: s.to, pe, r, r2, late, viaRes, nAround });
  }
}
const rs = rows.map((x) => x.r).sort((a, b) => a - b);
const q = (p: number) => rs[Math.floor(p * (rs.length - 1))]!;
console.log("n", rows.length, "mean", mean(rs).toFixed(3), "median", q(0.5).toFixed(3), "p5", q(0.05).toFixed(3), "p95", q(0.95).toFixed(3), "max", rs.at(-1)!.toFixed(2));
const trim = rs.slice(Math.floor(rs.length * 0.01), Math.ceil(rs.length * 0.99)); console.log("mean without top/bottom 1%", mean(trim).toFixed(3));
const capped = rows.map((x) => Math.min(x.r, 3)); console.log("mean with returns capped at +300%", mean(capped).toFixed(3));
const res = rows.filter((x) => x.viaRes), non = rows.filter((x) => !x.viaRes);
console.log("closed within 24h (resolution exit):", res.length, "mean", mean(res.map((x) => x.r)).toFixed(3), "| exited at 24h price:", non.length, "mean", mean(non.map((x) => x.r)).toFixed(3), "boot", bootstrapByDay(non.map((x) => ({ day: x.day, r: x.r }))).toFixed(3));
console.log("cost 0.02:", mean(rows.map((x) => x.r2)).toFixed(3), "boot", bootstrapByDay(rows.map((x) => ({ day: x.day, r: x.r2 }))).toFixed(3));
const lt = rows.filter((x) => x.late !== null); console.log("entry 30 min after spike:", lt.length, mean(lt.map((x) => x.late)).toFixed(3), "boot", bootstrapByDay(lt.map((x) => ({ day: x.day, r: x.late }))).toFixed(3));
console.log("up spikes (buy NO):", mean(rows.filter((x) => x.dir === 1).map((x) => x.r)).toFixed(3), "down spikes (buy YES):", mean(rows.filter((x) => x.dir === -1).map((x) => x.r)).toFixed(3));
const byM = new Map<string, number[]>(); for (const x of rows) { const k = x.day.slice(0, 7); (byM.get(k) ?? byM.set(k, []).get(k)!).push(x.r); }
console.log("by month:", [...byM].sort().map(([k, v]) => `${k} ${v.length} ${mean(v).toFixed(3)}`).join(" | "));
// category by keyword
const cat = (s: string) => /nba|nfl|nhl|mlb|fifa|world-cup|premier|la-liga|uefa|champions|serie|bundesliga|ligue|tennis|atp|wta|ufc|f1|golf|cricket|vs-|-vs|game|match|win-on|esports|lol|cs2|dota/i.test(s) ? "sport" : /bitcoin|btc|eth|crypto|solana|xrp|price/i.test(s) ? "crypto" : /trump|election|iran|ukraine|russia|israel|fed|rate|president|senate|war|ceasefire|tariff|china/i.test(s) ? "politics/macro" : "other";
const byC = new Map<string, number[]>(); for (const x of rows) { const k = cat(x.slug + " " + x.q); (byC.get(k) ?? byC.set(k, []).get(k)!).push(x.r); }
console.log("by category:", [...byC].map(([k, v]) => `${k} ${v.length} ${mean(v).toFixed(3)} boot ${bootstrapByDay(rows.filter((x) => cat(x.slug + " " + x.q) === k).map((x) => ({ day: x.day, r: x.r }))).toFixed(2)}`).join(" | "));
// activity around spike
const thin = rows.filter((x) => x.nAround < 8), thick = rows.filter((x) => x.nAround >= 8);
console.log("points within +-1h of spike: <8:", thin.length, mean(thin.map((x) => x.r)).toFixed(3), " >=8:", thick.length, mean(thick.map((x) => x.r)).toFixed(3));
// events with many markets: one event can produce many correlated signals
const byE = new Map<string, number>(); for (const x of rows) byE.set(x.slug, (byE.get(x.slug) ?? 0) + 1);
console.log("distinct events", byE.size, "top", [...byE].sort((a, b) => b[1] - a[1]).slice(0, 5));
// fair random baseline: random times where the YES price is in [0.10, 0.90], random side, same 24h hold, same markets
const means: number[] = [];
for (let s = 0; s < 100; s++) {
  const rnd = mulberry32(11000 + s); let sum = 0, n = 0;
  for (const x of rows) {
    const k = mk.find((z) => z.m.id === x.id)!;
    for (let tries = 0; tries < 20; tries++) {
      const a = k.h[0][0] + 3600, b = k.close - 86400; if (!(b > a)) break;
      const u = a + rnd() * (b - a), p = priceAt(k.h, u + 600, 1200);
      if (p === null || p < 0.1 || p > 0.9) continue;
      const r = holdReturn(k.h, k.close, k.yes, u, rnd() < 0.5 ? 1 : -1, 86400, 0.01); if (r !== null) { sum += r; n++; } break;
    }
  }
  means.push(sum / n);
}
means.sort((a, b) => a - b);
console.log("fair random (price 0.10-0.90): mean", mean(means).toFixed(3), "range", means[0]!.toFixed(3), means.at(-1)!.toFixed(3), "PC beats", means.filter((m) => mean(rs) > m).length, "/100");
// top 10 trades
console.log(rows.sort((a, b) => b.r - a.r).slice(0, 8).map((x) => `${x.day} ${x.q.slice(0, 60)} ${x.from.toFixed(2)}->${x.to.toFixed(2)} entry ${x.pe.toFixed(3)} r ${x.r.toFixed(2)} ${x.viaRes ? "RES" : ""}`).join("\n"));
