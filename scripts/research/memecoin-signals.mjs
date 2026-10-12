// Check Telegram memecoin signals against real 1-minute prices: node scripts/research/memecoin-signals.mjs <probe-sol dir>
// Copy model: buy at the open of the first candle >= 2 min after the post (+cost), sell 25% at each take-profit, stop at -90% of OUR entry, rest marked at the last price.
import { readFileSync } from "node:fs";
const DIR = process.argv[2] ?? "sol";
const syms = ["ALOIS", "CYBERLEEK", "PLIQ", "GLYPH8192", "OWL"];
const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "-" : Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : Math.abs(x) >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : x.toFixed(d));
const t = (s) => new Date(s * 1000).toISOString().slice(5, 16).replace("T", " ");
for (const sym of syms) {
  const o = JSON.parse(readFileSync(`${DIR}/${sym}.json`, "utf8"));
  const post = Date.parse(o.postedUtc) / 1000;
  const ds = [...(o.dexscreener ?? [])].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const supply = ds ? ds.fdv / Number(ds.priceUsd) : NaN;
  console.log(`\n=== ${sym} ${o.address}`);
  console.log(`name ${ds?.baseToken?.name}, dex ${ds?.dexId}, pair created ${ds ? new Date(ds.pairCreatedAt).toISOString().slice(0, 16) : "-"}, now price ${ds?.priceUsd}, fdv ${f(ds?.fdv)}, mcap ${f(ds?.marketCap)}, liq ${f(ds?.liquidity?.usd)}, vol24 ${f(ds?.volume?.h24)}, txns24 ${JSON.stringify(ds?.txns?.h24)}, supply ${f(supply)}`);
  const pools = o.gtPools.map((p) => `${p.dex} ${p.address.slice(0, 6)} created ${p.created?.slice(0, 16)} reserve ${f(Number(p.reserveUsd))}`);
  console.log(`pools: ${pools.slice(0, 4).join(" | ")}`);
  const rc = o.rugcheck; console.log(`rugcheck: score ${rc.score ?? rc.score_normalised ?? "-"}, risks ${JSON.stringify((rc.risks ?? []).map((r) => `${r.name}(${r.level})`))}, lpLocked ${rc.lpLockedPct ?? "-"}`);
  if (o.gtInfo) console.log(`gt info: holders ${JSON.stringify(o.gtInfo.holders?.count)} top10 ${JSON.stringify(o.gtInfo.holders?.distribution_percentage)} gt_score ${o.gtInfo.gt_score} created? ${o.gtInfo.created_at ?? ""}`);
  const top = [...o.gtPools].sort((a, b) => Number(b.reserveUsd) - Number(a.reserveUsd))[0];
  const c = o.candles[top.address] ?? [];
  if (!c.length) { console.log("no candles"); continue; }
  console.log(`candles ${c.length}: ${t(c[0][0])} .. ${t(c.at(-1)[0])}`);
  const entryP = o.entryMcap / 1e9;
  const before = c.filter((x) => x[0] <= post), after = c.filter((x) => x[0] > post);
  const atPost = before.at(-1);
  const p1h = before.filter((x) => x[0] <= post - 3600).at(-1), p24 = before.filter((x) => x[0] <= post - 86400).at(-1);
  console.log(`signal entry price ${entryP.toExponential(4)}; last trade before post ${atPost ? `${t(atPost[0])} close ${atPost[4].toExponential(4)} (= ${(atPost[4] / entryP).toFixed(3)}x entry, mcap ${f(atPost[4] * 1e9)})` : "none"}`);
  console.log(`move before post: 1h ${p1h && atPost ? ((atPost[4] / p1h[4] - 1) * 100).toFixed(0) + "%" : "-"}, 24h ${p24 && atPost ? ((atPost[4] / p24[4] - 1) * 100).toFixed(0) + "%" : "-"}`);
  if (!after.length) { console.log("no trades after post"); continue; }
  let hi = -1, hiT = 0, lo = Infinity, loT = 0;
  const hits = o.tp.map(() => null); let sl = null;
  for (const x of after) {
    if (x[2] > hi) { hi = x[2]; hiT = x[0]; }
    if (x[3] < lo) { lo = x[3]; loT = x[0]; }
    o.tp.forEach((tp, i) => { if (hits[i] === null && x[2] >= tp) hits[i] = x[0]; });
    if (sl === null && x[3] <= entryP * 0.1) sl = x[0];
  }
  const last = after.at(-1);
  console.log(`after post: first trade ${t(after[0][0])} open ${after[0][1].toExponential(4)}; high ${(hi / entryP).toFixed(2)}x at ${t(hiT)}; low ${(lo / entryP).toFixed(3)}x at ${t(loT)}; last ${(last[4] / entryP).toFixed(3)}x at ${t(last[0])}`);
  console.log(`TP hits: ${hits.map((h, i) => `TP${i + 1} ${h ? t(h) : "no"}`).join(", ")}; SL -90% ${sl ? t(sl) : "no"}`);
  const vol = after.reduce((a, x) => a + x[5], 0); console.log(`volume after post (pool, USD) ${f(vol)}, minutes with trades ${after.length}`);
  // copy simulation: buy at open of first candle >= post + 120 s; 25% at each TP; SL at 10% of OUR entry; rest marked at last close
  for (const cost of [0.01, 0.03, 0.05]) {
    const e = after.find((x) => x[0] >= post + 120); if (!e) continue;
    const buy = e[1] * (1 + cost);
    let left = 1, cash = 0; const done = o.tp.map(() => false); let stopped = false;
    for (const x of after.filter((y) => y[0] >= e[0])) {
      if (x[3] <= buy * 0.1) { cash += left * buy * 0.1 * (1 - cost) / buy; left = 0; stopped = true; break; }
      o.tp.forEach((tp, i) => { if (!done[i] && x[2] >= tp) { done[i] = true; cash += 0.25 * tp * (1 - cost) / buy; left -= 0.25; } });
      if (left <= 1e-9) break;
    }
    const value = cash + left * last[4] * (1 - cost) / buy;
    console.log(`  copy cost ${cost * 100}%/side: buy ${e[1].toExponential(4)} (${(e[1] / entryP).toFixed(2)}x signal entry) -> result ${((value - 1) * 100).toFixed(1)}% ${stopped ? "(stopped)" : ""} TPs ${done.filter(Boolean).length}`);
  }
}
