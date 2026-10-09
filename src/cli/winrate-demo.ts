/**
 * Demonstration with real data: win rate alone says nothing about profit.
 * Run: npx tsx src/cli/winrate-demo.ts   Writes reports/winrate-demo.md
 */
import { writeFileSync } from "node:fs";
import { loadCoinMetrics } from "../data/coinmetrics.js";
import { loadShiller } from "../data/shiller.js";
import { runBacktest } from "../engine.js";
import type { Strategy } from "../history.js";
import { metrics } from "../metrics.js";
import { smaTrend } from "../strategies.js";
import { extractTrades, tradeStats } from "../trades.js";
import type { Series } from "../types.js";

/** Always in the market: enter, exit at +tp or -sl (checked on closes), re-enter next decision. Stateful: one fresh copy per run. */
function tpSl(tp: number, sl: number, enterProb = 1, seed = 1): Strategy {
  let entry = 0, holding = false, a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return (h) => {
    const p = h.price(h.t);
    if (holding) {
      if (p >= entry * (1 + tp) || p <= entry * (1 - sl)) { holding = false; return 0; }
      return 1;
    }
    if (rnd() < enterProb) { holding = true; entry = p; return 1; }
    return 0;
  };
}

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "∞");
const out = ["# Успеваемост (win rate) срещу печалба — реални данни", "",
  "| Стратегия | Сделки | Успеваемост % | Ср. печалба % | Ср. загуба % | Очаквано на сделка % | Profit factor | Годишна доходност % |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |"];

function report(label: string, s: Series, strat: Strategy, cost: number, start: string) {
  const res = runBacktest(s, strat, { cost, lag: 1 });
  const st = tradeStats(extractTrades(res, start));
  const m = metrics(res, start);
  out.push(`| ${label} | ${st.trades} | ${fmt(st.winRate)} | ${fmt(st.avgWin, 2)} | ${fmt(st.avgLoss, 2)} | ${fmt(st.expectancy, 2)} | ${fmt(st.profitFactor, 2)} | ${fmt(m.cagr)} |`);
}

const btc = loadCoinMetrics("data/btc.csv", "BTC");
const sp = loadShiller("data/sp500.csv", { cash: "zero" });
const start = "2015-01-01";

report("BTC: купи и дръж", btc, () => 1, 0.002, start);
report("BTC: trend 100 дни", btc, smaTrend(100), 0.002, start);
report("BTC: цел +2%, стоп −10%", btc, tpSl(0.02, 0.10), 0.002, start);
report("BTC: СЛУЧАЕН вход, цел +2%, стоп −10%", btc, tpSl(0.02, 0.10, 0.1, 7), 0.002, start);
report("BTC: цел +10%, стоп −2%", btc, tpSl(0.10, 0.02), 0.002, start);
report("BTC: СЛУЧАЕН вход, цел +10%, стоп −2%", btc, tpSl(0.10, 0.02, 0.1, 7), 0.002, start);
report("S&P 500: trend 10 месеца (1881–2023)", sp, smaTrend(10), 0.001, "1881-01");

out.push("", "Данни: CoinMetrics (BTC, дневни затваряния, 2015-01 – 2026-05), Shiller (S&P 500, месечни). Разход 0.2% (BTC) / 0.1% (S&P) на сделка, решение с 1 бар закъснение, без данъци.",
  "Целта и стопът се проверяват само по дневното затваряне, затова реалният изход може да е по-далеч от зададеното ниво.");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/winrate-demo.md", text + "\n");
