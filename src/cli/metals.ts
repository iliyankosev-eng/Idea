/**
 * Gold (GLD) and silver (SLV). Rules are fixed in experiments/metals-preregistration.md (committed before the first run).
 * Needs the data branch: npm run data:sync.  Run: npm run metals   Writes reports/metals.md
 */
import { writeFileSync } from "node:fs";
import { withFredCash } from "../data/cash.js";
import { loadDailyCsv } from "../data/daily.js";
import { runBacktest } from "../engine.js";
import { evaluateAssets, fmt, realisedVol, type AssetConfig } from "../evaluate.js";
import type { Strategy } from "../history.js";
import { metrics, windowRange } from "../metrics.js";
import { buyAndHold, smaTrend } from "../strategies.js";
import { tpSl } from "../tpsl.js";
import { extractTrades, tradeStats } from "../trades.js";
import type { Series } from "../types.js";

const B = "data/branch/daily";
const IS_END = "2015-12-31", OOS: [string, string] = ["2016-01-01", "9999-12-31"];

function load(ticker: string, name: string, cash: boolean): Series {
  const s = loadDailyCsv(`${B}/yahoo/${ticker}.csv`, name, { priceCol: "AdjClose" });
  return cash ? withFredCash(s, `${B}/fred/DTB3.csv`, "DTB3") : s;
}

function configs(taxRate: number, cash: boolean): AssetConfig[] {
  const mk = (ticker: string, name: string, cost: number): AssetConfig => {
    const series = load(ticker, name, cash);
    return { name, series, is: [series.dates[0]!, IS_END], oos: OOS, smaLength: 200, volLookback: 21, cost, taxRate, bootstrapBlock: 20 };
  };
  return [mk("GLD", "Злато (GLD)", 0.001), mk("SLV", "Сребро (SLV)", 0.002)];
}

const verdictHeader = ["| Актив | Вариант | Риск-критерий | Доходност ≥ основата | Bootstrap | Решение |", "| --- | --- | --- | --- | --- | --- |"];
const main = evaluateAssets(configs(0.09, true));
const tax0 = evaluateAssets(configs(0, true));
const cash0 = evaluateAssets(configs(0.09, false));

const out: string[] = [
  "# Злато и сребро — резултати", "",
  "Правила: experiments/metals-preregistration.md. Основните числа са след разходи и данък 9%, кешът носи лихва (3-месечни T-bills), с продажба в края.", "",
  ...main.out,
  "## Присъда по предварителните критерии (out-of-sample, данък 9%, кеш = T-bills)", "", ...verdictHeader, ...main.verdicts, "",
  "## Устойчивост на присъдата (само за информация)", "",
  "### Данък 0% (ако ETC се окаже освободен)", "", ...verdictHeader, ...tax0.verdicts, "",
  "### Кеш = 0% (без лихва)", "", ...verdictHeader, ...cash0.verdicts, "",
];

// ---- Win rate (descriptive): target/stop in units of in-sample daily volatility, vs random entries ----
out.push("## Успеваемост срещу печалба (out-of-sample, след разходи, без данък, кеш = T-bills)", "",
  "A = цел +1σ / стоп −5σ, B = цел +5σ / стоп −1σ; σ = дневна волатилност от in-sample периода. Случаен вход: 20 серии, 10% шанс за вход на ден.", "",
  "| Актив | σ дневна % | Купи и дръж %/год | Trend 200: успев. % · %/год | A: успев. % · очаквано на сделка % · %/год | A случаен: успев. % (мин–макс) · %/год | B: успев. % · очаквано на сделка % · %/год | B случаен: успев. % (мин–макс) · %/год |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const c of configs(0, true)) {
  const s = c.series, start = s.dates[windowRange(s.dates, ...OOS)[0]]!;
  const sig = realisedVol(s, ...c.is) / Math.sqrt(s.periodsPerYear);
  const run = (strat: Strategy) => {
    const res = runBacktest(s, strat, { cost: c.cost, lag: 1 });
    return { st: tradeStats(extractTrades(res, start)), cagr: metrics(res, start).cagr };
  };
  const rand = (tp: number, sl: number) => {
    const xs = Array.from({ length: 20 }, (_, i) => run(tpSl(tp, sl, 0.1, 100 + i)));
    const w = xs.map((x) => x.st.winRate);
    return `${fmt(w.reduce((a, b) => a + b, 0) / w.length, 0)} (${fmt(Math.min(...w), 0)}–${fmt(Math.max(...w), 0)}) · ${fmt(xs.reduce((a, x) => a + x.cagr, 0) / xs.length, 1)}`;
  };
  const bh = run(buyAndHold), tr = run(smaTrend(200)), A = run(tpSl(sig, 5 * sig, 1, 1)), Bv = run(tpSl(5 * sig, sig, 1, 1));
  out.push(`| ${c.name} | ${fmt(sig * 100, 2)} | ${fmt(bh.cagr, 1)} | ${fmt(tr.st.winRate, 0)} · ${fmt(tr.cagr, 1)} | ${fmt(A.st.winRate, 0)} · ${fmt(A.st.expectancy, 2)} · ${fmt(A.cagr, 1)} | ${rand(sig, 5 * sig)} | ${fmt(Bv.st.winRate, 0)} · ${fmt(Bv.st.expectancy, 2)} · ${fmt(Bv.cagr, 1)} | ${rand(5 * sig, sig)} |`);
}
out.push("", "Теория за случайна цена без посока: P(цел преди стоп) = стоп / (цел + стоп) → A 83%, B 17%.");

const text = out.join("\n");
console.log(text);
writeFileSync("reports/metals.md", text + "\n");
