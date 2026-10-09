/**
 * Win rate vs. expectancy on 15 daily markets (crypto, oil, natural gas, 6 currencies).
 * Fixed before running (08-09.10.2026, see experiments/winrate-multi-preregistration.md):
 * - Target/stop are set in units of each market's daily volatility, measured ONLY on the first 500 bars,
 *   which are then excluded from the evaluation.
 * - A: target +1 sigma, stop -5 sigma.  B: target +5 sigma, stop -1 sigma.  Checked on daily closes, lag 1.
 * - Random entries: 20 seeds, enter with 10% probability per day when flat; same target/stop.
 * - Theory for a driftless random walk: P(target first) = stop / (target + stop) -> A 83%, B 17%.
 * Run: npm run winrate   Writes reports/winrate-multi.md
 */
import { writeFileSync } from "node:fs";
import { loadCoinMetrics } from "../data/coinmetrics.js";
import { loadDailyCsv } from "../data/daily.js";
import { runBacktest } from "../engine.js";
import { metrics } from "../metrics.js";
import { buyAndHold, smaTrend } from "../strategies.js";
import { tpSl } from "../tpsl.js";
import type { Strategy } from "../history.js";
import { extractTrades, tradeStats, type TradeStats } from "../trades.js";
import type { Series } from "../types.js";

const WARMUP = 500, SEEDS = 20;

function dailySigma(s: Series): number {
  const r = s.ret.slice(1, WARMUP + 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
}

function run(s: Series, strat: Strategy, cost: number, start: string): { st: TradeStats; cagr: number } {
  const res = runBacktest(s, strat, { cost, lag: 1 });
  return { st: tradeStats(extractTrades(res, start)), cagr: metrics(res, start).cagr };
}

const fmt = (x: number, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const markets: [Series, number][] = [
  ...["btc", "eth", "ltc", "xrp", "doge", "ada", "bnb"].map((c) => [loadCoinMetrics(`data/${c}.csv`, c.toUpperCase()), 0.002] as [Series, number]),
  [loadDailyCsv("data/brent-daily.csv", "Brent oil", { from: "2006-04-01" }), 0.001],
  [loadDailyCsv("data/natgas-daily.csv", "Natural gas", { from: "2007-04-01" }), 0.001],
  ...([["Euro", "EUR/USD", "1999-01-01"], ["United Kingdom", "GBP/USD", "1972-01-01"], ["Japan", "JPY/USD", "1972-01-01"],
    ["Switzerland", "CHF/USD", "1972-01-01"], ["Australia", "AUD/USD", "1972-01-01"], ["Canada", "CAD/USD", "1972-01-01"]] as const)
    .map(([c, n, f]) => [loadDailyCsv("data/fx-daily.csv", n, { priceCol: "Exchange rate", filter: { key: "Country", value: c }, invert: true, from: f }), 0.0002] as [Series, number]),
];

const out = [
  "# Успеваемост срещу печалба — 15 пазара (дневни данни)", "",
  "A = цел +1σ / стоп −5σ (теория за случайна цена: 83% успеваемост). B = цел +5σ / стоп −1σ (теория: 17%). σ = дневна волатилност от първите 500 дни (изключени от оценката).", "",
  "| Пазар | Период | σ дневна % | Купи и дръж %/год | Trend: успев. % · %/год | A правило: успев. % · %/год | A случаен вход: успев. % (мин–макс) · %/год | B правило: успев. % · %/год | B случаен: успев. % (мин–макс) · %/год |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
];
let randomA60 = 0, trendWins: number[] = [];
for (const [s, cost] of markets) {
  const start = s.dates[WARMUP]!, sig = dailySigma(s);
  const bh = run(s, buyAndHold, cost, start), tr = run(s, smaTrend(100), cost, start);
  const A = run(s, tpSl(sig, 5 * sig, 1, 1), cost, start), B = run(s, tpSl(5 * sig, sig, 1, 1), cost, start);
  const rA = Array.from({ length: SEEDS }, (_, i) => run(s, tpSl(sig, 5 * sig, 0.1, 100 + i), cost, start));
  const rB = Array.from({ length: SEEDS }, (_, i) => run(s, tpSl(5 * sig, sig, 0.1, 100 + i), cost, start));
  const summ = (xs: { st: TradeStats; cagr: number }[]) => {
    const w = xs.map((x) => x.st.winRate);
    return { mean: w.reduce((a, b) => a + b, 0) / w.length, min: Math.min(...w), max: Math.max(...w), cagr: xs.reduce((a, x) => a + x.cagr, 0) / xs.length };
  };
  const sa = summ(rA), sb = summ(rB);
  if (sa.min >= 60) randomA60++;
  trendWins.push(tr.st.winRate);
  out.push(`| ${s.name} | ${start.slice(0, 7)} – ${s.dates[s.dates.length - 1]!.slice(0, 7)} | ${fmt(sig * 100, 2)} | ${fmt(bh.cagr, 1)} | ${fmt(tr.st.winRate)} · ${fmt(tr.cagr, 1)} | ${fmt(A.st.winRate)} · ${fmt(A.cagr, 1)} | ${fmt(sa.mean)} (${fmt(sa.min)}–${fmt(sa.max)}) · ${fmt(sa.cagr, 1)} | ${fmt(B.st.winRate)} · ${fmt(B.cagr, 1)} | ${fmt(sb.mean)} (${fmt(sb.min)}–${fmt(sb.max)}) · ${fmt(sb.cagr, 1)} |`);
}
out.push("", `- Случайни входове с вариант A стигат поне 60% успеваемост при всички ${SEEDS} опита на ${randomA60} от ${markets.length} пазара.`,
  `- Успеваемост на trend (100 дни): от ${fmt(Math.min(...trendWins))}% до ${fmt(Math.max(...trendWins))}%, средно ${fmt(trendWins.reduce((a, b) => a + b, 0) / trendWins.length)}%.`,
  "- Разходи: крипто 0.2%, суровини 0.1%, валути 0.02% на сделка. Без данъци. Проверка само по дневното затваряне, решение с 1 ден закъснение.");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/winrate-multi.md", text + "\n");
