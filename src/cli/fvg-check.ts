// Spot check: the first BTC setups of 2024-Q1 printed with all their levels, to verify the rules by eye. Run: npx tsx src/cli/fvg-check.ts
import { loadMinuteBars } from "../data/intraday.js";
import { aggregate, atr14, findSetups, trades, type Series1m } from "../ict/fvg.js";
const b = loadMinuteBars("data/branch", "BTCUSDT", "2024-01", "2024-03", "binance");
const s: Series1m = { key: b.t.map((t) => t / 60000), day: b.t.map((t) => new Date(t).toISOString().slice(0, 10)), seg: b.t.map(() => 0), o: b.o, h: b.h, l: b.l, c: b.c, stock: false };
const B = aggregate(s, 60), E = aggregate(s, 15);
const t = (k: number) => new Date(k * 60000).toISOString().slice(5, 16).replace("T", " ");
const st = findSetups(B, E);
const tr = trades(s, st, 0.0005);
console.log("hourly bars", B.length, "first", t(B[0]!.k0), "last", t(B.at(-1)!.k0), "setups", st.length, "trades", tr.length);
for (const x of st.slice(0, 3)) {
  const c1 = B[x.fvgBar - 2]!, c2 = B[x.fvgBar - 1]!, c3 = B[x.fvgBar]!;
  console.log(`FVG ${t(c1.k0)}: c1 h ${c1.h} | c2 o ${c2.o} c ${c2.c} (body ${(c2.c - c2.o).toFixed(0)} vs ATR ${atr14(B, x.fvgBar - 2).toFixed(0)}) | c3 l ${c3.l} -> zone ${x.bot}-${x.top}`);
  console.log(`   swing high ${t(B[x.pivot]!.k0)} h ${B[x.pivot]!.h}; BoS ${t(B[x.bos]!.k0)} close ${B[x.bos]!.c}; entry ${t(s.key[x.entryIdx]!)} at ${x.entry}, stop ${x.stop} (risk ${((100 * (x.entry - x.stop)) / x.entry).toFixed(2)}%)`);
  const z = tr.find((y) => y.entryIdx === x.entryIdx);
  if (z) console.log(`   -> exit ${t(s.key[z.exitIdx]!)} at ${z.exit} (${z.reason}), net R ${z.netR.toFixed(2)}`);
}
const risks = tr.map((y) => (100 * y.R) / y.entry).sort((a, c) => a - c);
console.log("median risk % of price", risks[Math.floor(risks.length / 2)]?.toFixed(2), "-> round-trip cost in R ≈", (0.1 / risks[Math.floor(risks.length / 2)]!).toFixed(2));
