/**
 * Phase 2 runner. Rules are fixed in experiments/phase2-preregistration.md (committed before the first run).
 * Run: npm run phase2   (needs npm run data first). Writes reports/phase2-results.md
 */
import { writeFileSync } from "node:fs";
import { loadCoinMetrics } from "../data/coinmetrics.js";
import { loadShiller } from "../data/shiller.js";
import { evaluateAssets, type AssetConfig } from "../evaluate.js";

const assets: AssetConfig[] = [
  { name: "S&P 500", series: loadShiller("data/sp500.csv"), is: ["1881-01", "1979-12"], oos: ["1980-01", "2023-06"],
    smaLength: 10, volLookback: 12, cost: 0.001, taxRate: 0, bootstrapBlock: 6 },
  { name: "BTC", series: loadCoinMetrics("data/btc.csv", "BTC"), is: ["2014-01-01", "2020-12-31"], oos: ["2021-01-01", "9999-12-31"],
    smaLength: 100, volLookback: 30, cost: 0.002, taxRate: 0.09, bootstrapBlock: 20 },
  { name: "ETH", series: loadCoinMetrics("data/eth.csv", "ETH"), is: ["2016-06-01", "2020-12-31"], oos: ["2021-01-01", "9999-12-31"],
    smaLength: 100, volLookback: 30, cost: 0.002, taxRate: 0.09, bootstrapBlock: 20 },
];

const { out: sections, verdicts } = evaluateAssets(assets);
const out: string[] = ["# Фаза 2 — резултати", "", "Правила: experiments/phase2-preregistration.md. Всички числа са след разходи и данък, с продажба в края.", "", ...sections];

out.push("## Присъда по предварителните критерии (out-of-sample)", "",
  "| Актив | Вариант | Риск-критерий | Доходност ≥ основата | Bootstrap | Решение |", "| --- | --- | --- | --- | --- | --- |", ...verdicts, "",
  "Напомняне: trend (вариант 2) е бил виждан преди регистрацията — слабо доказателство. Единственият чист тест е следенето напред (Фаза 3).");

const text = out.join("\n");
console.log(text);
writeFileSync("reports/phase2-results.md", text + "\n");
