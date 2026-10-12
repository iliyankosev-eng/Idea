// Analyse raw Hyperliquid probe data: node wallets.mjs <probeDir>
import { readFileSync, readdirSync } from "node:fs";
const DIR = process.argv[2];
const n = (x) => Number(x);
const d = (t) => new Date(t).toISOString().slice(0, 10);
const m = (t) => new Date(t).toISOString().slice(0, 7);
const f0 = (x) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("en-US") : x.toFixed(2));

for (const file of readdirSync(`${DIR}/hl`).sort()) {
  const w = JSON.parse(readFileSync(`${DIR}/hl/${file}`, "utf8"));
  const name = file.replace(".json", "");
  console.log(`\n================ ${name} ${w.user}`);
  const ms = w.state.marginSummary;
  console.log(`now: accountValue ${f0(n(ms.accountValue))}, notional ${f0(n(ms.totalNtlPos))}, open positions ${w.state.assetPositions.length}`);
  for (const p of w.state.assetPositions) {
    const q = p.position;
    console.log(`   ${q.coin} szi ${q.szi} entry ${q.entryPx} value ${f0(n(q.positionValue))} lev ${q.leverage.type} ${q.leverage.value}x uPnL ${f0(n(q.unrealizedPnl))}`);
  }
  const spotBal = (w.spot.balances ?? []).filter((b) => n(b.total) > 0).map((b) => `${b.coin} ${b.total}`);
  if (spotBal.length) console.log(`spot: ${spotBal.slice(0, 8).join(", ")}`);

  // Portfolio (official PnL / account value history)
  for (const [period, v] of w.portfolio) {
    if (!["day", "week", "month", "allTime", "perpAllTime"].includes(period)) continue;
    const av = v.accountValueHistory, pnl = v.pnlHistory;
    if (!pnl.length) { console.log(`${period}: empty`); continue; }
    const p0 = n(pnl[0][1]), p1 = n(pnl.at(-1)[1]);
    console.log(`${period}: ${d(pnl[0][0])}..${d(pnl.at(-1)[0])} pnl ${f0(p1 - p0)}, AV ${f0(n(av[0][1]))} -> ${f0(n(av.at(-1)[1]))}, volume ${f0(n(v.vlm))}, points ${pnl.length}`);
    // No time-weighted return: account value mixes spot balances and transfers, so it was unreliable (gave absurd values).
  }

  // Fills
  const fills = w.fills;
  if (!fills.length) { console.log("fills: none"); continue; }
  const byMonth = new Map();
  const coins = new Map();
  let vol = 0, closed = 0, fee = 0, taker = 0;
  for (const f of fills) {
    const k = m(f.time);
    const o = byMonth.get(k) ?? { fills: 0, closed: 0, fee: 0, vol: 0, wins: 0, losses: 0 };
    const pnl = n(f.closedPnl), fe = n(f.fee), v = n(f.px) * n(f.sz);
    o.fills++; o.closed += pnl; o.fee += fe; o.vol += v;
    if (pnl > 0) o.wins++; else if (pnl < 0) o.losses++;
    byMonth.set(k, o);
    coins.set(f.coin, (coins.get(f.coin) ?? 0) + v);
    vol += v; closed += pnl; fee += fe; if (f.crossed) taker++;
  }
  const fund = w.funding.reduce((a, x) => a + n(x.delta?.usdc ?? 0), 0);
  console.log(`fills ${fills.length} (${d(fills[0].time)}..${d(fills.at(-1).time)}), taker ${((100 * taker) / fills.length).toFixed(0)}%, volume ${f0(vol)}`);
  console.log(`closedPnl ${f0(closed)}, fees ${f0(fee)}, funding ${f0(fund)}, net ${f0(closed - fee + fund)}`);
  const top = [...coins].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, v]) => `${c} ${((100 * v) / vol).toFixed(0)}%`);
  console.log(`coins: ${top.join(", ")} (of ${coins.size})`);
  console.log("month    fills  closedPnl     fees  win/loss closes");
  for (const [k, o] of byMonth) console.log(`${k}  ${String(o.fills).padStart(5)}  ${f0(o.closed).padStart(10)}  ${f0(o.fee).padStart(8)}  ${o.wins}/${o.losses}`);
  const dir = new Map();
  for (const f of fills) dir.set(f.dir, (dir.get(f.dir) ?? 0) + 1);
  console.log(`dir: ${[...dir].map(([k, v]) => `${k} ${v}`).join(", ")}`);

  // Ledger: deposits / withdrawals
  const led = new Map();
  for (const x of w.ledger) {
    const t = x.delta?.type ?? "?";
    const amt = n(x.delta?.usdc ?? x.delta?.amount ?? 0);
    const o = led.get(t) ?? { n: 0, sum: 0, last: 0 };
    o.n++; o.sum += amt; o.last = Math.max(o.last, x.time);
    led.set(t, o);
  }
  console.log(`ledger: ${[...led].map(([k, o]) => `${k} x${o.n} sum ${f0(o.sum)} last ${d(o.last)}`).join("; ")}`);
}
