// What happened after the group shared each wallet? node scripts/research/hl-after-share.mjs <probeDir>
// Method A: official perp PnL history (perpAllTime only). Method B: realized from fills (closedPnl - fee + funding).
import { readFileSync } from "node:fs";
const DIR = process.argv[2];
const SHARED = { current: "2026-09-13", prev1: "2026-08-31", prev2: "2026-08-24", prev3: "2026-06-11", prev4: "2026-06-06" };
const n = Number, d = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
const k = (x) => `${(x / 1000).toFixed(0)}k`;
for (const [name, date] of Object.entries(SHARED)) {
  const w = JSON.parse(readFileSync(`${DIR}/hl/${name}.json`, "utf8"));
  const t0 = Date.parse(`${date}T12:00:00Z`); // midday of the share day (time of post unknown)
  const pts = new Map();
  const PER = process.argv[3] ?? "perpAllTime"; // "allTime" = perp + spot. Each period restarts its PnL at 0, so periods are never mixed.
  for (const per of [PER]) {
    const v = w.portfolio.find((p) => p[0] === per)?.[1];
    if (!v) continue;
    v.pnlHistory.forEach(([t, x], i) => pts.set(t, { pnl: n(x), av: n(v.accountValueHistory[i]?.[1]) }));
  }
  const s = [...pts].sort((a, b) => a[0] - b[0]);
  const startIdx = s.findIndex(([t]) => t >= t0);
  const before = s[startIdx - 1], start = s[startIdx], end = s.at(-1);
  let peak = start[1].pnl, mdd = 0, at = "";
  for (const [t, p] of s.slice(startIdx)) { peak = Math.max(peak, p.pnl); if (p.pnl - peak < mdd) { mdd = p.pnl - peak; at = d(t); } }
  const avStart = start[1].av;
  const gapH = ((start[0] - t0) / 3.6e6).toFixed(0), prevGapH = before ? ((t0 - before[0]) / 3.6e6).toFixed(0) : "-";
  const fills = w.fills.filter((f) => f.time >= t0), fund = w.funding.filter((f) => f.time >= t0);
  const realized = fills.reduce((a, f) => a + n(f.closedPnl) - n(f.fee), 0) + fund.reduce((a, f) => a + n(f.delta.usdc), 0);
  const covered = w.fills.length && w.fills[0].time < t0;
  console.log(`${name} shared ${date}: start point ${d(start[0])} (+${gapH}h; previous point -${prevGapH}h), perp AV ${k(avStart)}`);
  console.log(`   A official: pnl change ${k(end[1].pnl - start[1].pnl)} = ${((100 * (end[1].pnl - start[1].pnl)) / avStart).toFixed(0)}% of perp AV; worst drop after share ${k(mdd)} = ${((100 * mdd) / avStart).toFixed(0)}% (low at ${at}); perp AV now ${k(end[1].av)}`);
  console.log(`   B fills: ${covered ? "" : "(fills do not reach back, partial) "}realized net ${k(realized)} from ${fills.length} fills; unrealized now ${k(w.state.assetPositions.reduce((a, p) => a + n(p.position.unrealizedPnl), 0))}`);
}
