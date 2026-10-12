// Wallets recommended by a Telegram copy-trading channel: profile, check of the channel's claims, and what happened after the post.
// Usage: node scripts/research/hl-channel.mjs <probeDir> <wallets.json>
// After-share uses the official PnL history of ONE period (allTime = perp + spot, perpAllTime = perp only); periods restart at 0, never mix them.
import { readFileSync, existsSync } from "node:fs";

const [DIR, LIST] = process.argv.slice(2);
const wallets = JSON.parse(readFileSync(LIST, "utf8"));
const n = Number;
const k = (x) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : `${(x / 1e3).toFixed(1)}k`);
const d = (t) => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400_000;

function afterShare(w, per, t0) {
  const v = w.portfolio.find((p) => p[0] === per)?.[1];
  if (!v || !v.pnlHistory.length) return null;
  const s = v.pnlHistory.map(([t, x], i) => ({ t, pnl: n(x), av: n(v.accountValueHistory[i]?.[1]) }));
  const i0 = s.findIndex((p) => p.t >= t0);
  if (i0 < 0) return null;
  const start = s[i0], end = s.at(-1);
  let peak = start.pnl, mdd = 0, low = null;
  for (const p of s.slice(i0)) { peak = Math.max(peak, p.pnl); if (p.pnl - peak < mdd) { mdd = p.pnl - peak; low = p.t; } }
  return { startT: start.t, gapH: (start.t - t0) / 3.6e6, av: start.av, change: end.pnl - start.pnl, mdd, low, avNow: end.av, first: s.find((p) => p.av > 0)?.t ?? s[0].t };
}

/** Position episodes per coin from fills: open when size leaves 0, close when it returns to 0 (or flips). */
function episodes(fills) {
  const pos = new Map(), open = new Map(), out = [];
  for (const f of fills) {
    if (f.coin.startsWith("@") || f.dir === "Buy" || f.dir === "Sell") continue; // spot
    const before = n(f.startPosition), delta = (f.side === "B" ? 1 : -1) * n(f.sz), after = before + delta;
    if (Math.abs(before) < 1e-12 && Math.abs(after) > 1e-12) open.set(f.coin, f.time);
    if (Math.abs(before) > 1e-12 && (Math.abs(after) < 1e-9 * Math.max(1, Math.abs(before)) || Math.sign(after) !== Math.sign(before))) {
      if (open.has(f.coin)) out.push({ coin: f.coin, days: (f.time - open.get(f.coin)) / DAY });
      open.delete(f.coin);
      if (Math.abs(after) > 1e-12) open.set(f.coin, f.time);
    }
    pos.set(f.coin, after);
  }
  const now = Date.now();
  const stillOpen = [...open].map(([coin, t]) => ({ coin, days: (now - t) / DAY }));
  return { closed: out, stillOpen };
}

for (const wl of wallets) {
  const p = `${DIR}/hl/${wl.name}.json`;
  if (!existsSync(p)) { console.log(`\n${wl.name}: no data`); continue; }
  const w = JSON.parse(readFileSync(p, "utf8"));
  const t0 = Date.parse(wl.shared);
  console.log(`\n=== ${wl.name} ${wl.address} shared ${wl.shared.slice(0, 16)}  claim: ${wl.claim || "-"}`);
  const ms = w.state.marginSummary;
  const usdc = (w.spot.balances ?? []).filter((b) => /^USD/.test(b.coin)).reduce((a, b) => a + n(b.total), 0);
  console.log(`now: perp account ${k(n(ms.accountValue))}, spot USD* ${k(usdc)}, positions: ${w.state.assetPositions.map((x) => `${x.position.coin} ${x.position.leverage.value}x ${k(n(x.position.positionValue))} uPnL ${k(n(x.position.unrealizedPnl))}`).join("; ") || "none"}`);
  for (const per of ["perpAllTime", "allTime"]) {
    const v = w.portfolio.find((q) => q[0] === per)?.[1];
    if (v?.pnlHistory.length) console.log(`${per}: ${d(v.pnlHistory[0][0])}..${d(v.pnlHistory.at(-1)[0])} pnl ${k(n(v.pnlHistory.at(-1)[1]) - n(v.pnlHistory[0][1]))}, volume ${k(n(v.vlm))}`);
  }
  for (const per of ["perpAllTime", "allTime"]) {
    const a = afterShare(w, per, t0);
    if (!a) { console.log(`after share (${per}): no point after the share date`); continue; }
    console.log(`after share (${per}): from ${new Date(a.startT).toISOString().slice(0, 16)} (+${a.gapH.toFixed(0)}h) account ${k(a.av)} -> change ${k(a.change)} = ${a.av > 0 ? ((100 * a.change) / a.av).toFixed(0) : "-"}%; worst drop ${k(a.mdd)} = ${a.av > 0 ? ((100 * a.mdd) / a.av).toFixed(0) : "-"}%${a.low ? ` (low ${d(a.low)})` : ""}; account now ${k(a.avNow)}`);
  }
  // half-year PnL (perp) for "profitable two years"
  const v = w.portfolio.find((q) => q[0] === "perpAllTime")?.[1];
  if (v?.pnlHistory.length > 1) {
    const by = new Map();
    for (let i = 1; i < v.pnlHistory.length; i++) {
      const t = v.pnlHistory[i][0], key = `${new Date(t).getUTCFullYear()}-H${new Date(t).getUTCMonth() < 6 ? 1 : 2}`;
      by.set(key, (by.get(key) ?? 0) + n(v.pnlHistory[i][1]) - n(v.pnlHistory[i - 1][1]));
    }
    console.log(`perp pnl by half-year: ${[...by].map(([q, x]) => `${q} ${k(x)}`).join(" | ")}`);
  }
  const f = w.fills;
  if (!f.length) { console.log("fills: none"); continue; }
  const vol = new Map(); let total = 0, taker = 0, closed = 0, closeNotional = 0, fee = 0;
  for (const x of f) {
    const v2 = n(x.px) * n(x.sz); total += v2; vol.set(x.coin, (vol.get(x.coin) ?? 0) + v2);
    if (x.crossed) taker++;
    fee += n(x.fee);
    if (/^Close|>/.test(x.dir ?? "")) { closed += n(x.closedPnl); closeNotional += v2; }
  }
  const top = [...vol].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v3]) => `${c} ${((100 * v3) / total).toFixed(0)}%`);
  const xyz = [...vol].filter(([c]) => c.includes(":")).reduce((a, [, v3]) => a + v3, 0);
  console.log(`fills ${f.length} (${d(f[0].time)}..${d(f.at(-1).time)}), ${(f.length / Math.max(1, (f.at(-1).time - f[0].time) / DAY)).toFixed(1)}/day, taker ${((100 * taker) / f.length).toFixed(0)}%, coins ${vol.size}: ${top.join(", ")}; builder-dex (xyz:/...) share ${((100 * xyz) / total).toFixed(0)}%`);
  console.log(`closing fills: pnl ${k(closed)} on notional ${k(closeNotional)} = ${((100 * closed) / closeNotional).toFixed(2)}% per $ closed; fees ${k(fee)}`);
  const ep = episodes(f);
  const ds = ep.closed.map((e) => e.days).sort((a, b) => a - b);
  if (ds.length) console.log(`position episodes closed ${ds.length}: median ${ds[Math.floor(ds.length / 2)].toFixed(1)} d, >100 d: ${ds.filter((x) => x > 100).length}; still open: ${ep.stillOpen.map((e) => `${e.coin} ${e.days.toFixed(0)}d`).join(", ") || "-"}`);
  const led = new Map();
  for (const x of w.ledger) { const t = x.delta?.type ?? "?"; const o = led.get(t) ?? { c: 0, s: 0 }; o.c++; o.s += n(x.delta?.usdc ?? x.delta?.amount ?? 0); led.set(t, o); }
  console.log(`ledger: ${[...led].map(([t, o]) => `${t} x${o.c} ${k(o.s)}`).join("; ")}`);
}
