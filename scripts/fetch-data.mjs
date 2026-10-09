// Downloads the public data sets used by the tests and reports into ./data
import { mkdirSync, writeFileSync } from "node:fs";

const sources = {
  "data/sp500.csv": "https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv",
  "data/btc.csv": "https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv",
  "data/eth.csv": "https://raw.githubusercontent.com/coinmetrics/data/master/csv/eth.csv",
  "data/gold.csv": "https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv",
  "data/wti.csv": "https://raw.githubusercontent.com/datasets/oil-prices/main/data/wti-monthly.csv",
  "data/us10y.csv": "https://raw.githubusercontent.com/datasets/bond-yields-us-10y/main/data/monthly.csv",
  "data/fx.csv": "https://raw.githubusercontent.com/datasets/exchange-rates/main/data/monthly.csv",
  "data/brent-daily.csv": "https://raw.githubusercontent.com/datasets/oil-prices/main/data/brent-daily.csv",
  "data/natgas-daily.csv": "https://raw.githubusercontent.com/datasets/natural-gas/main/data/daily.csv",
  "data/fx-daily.csv": "https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv",
  ...Object.fromEntries(["ltc", "xrp", "doge", "ada", "bnb", "sol"].map((c) => [`data/${c}.csv`, `https://raw.githubusercontent.com/coinmetrics/data/master/csv/${c}.csv`])),
};

mkdirSync("data", { recursive: true });
for (const [file, url] of Object.entries(sources)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  if (text.length < 5_000) throw new Error(`${url}: suspiciously small (${text.length} bytes)`);
  writeFileSync(file, text);
  console.log(`${file}: ${text.split("\n").length - 1} rows`);
}
console.log("Note: the reference numbers in test/fixtures/golden.json were made from the data of 2026-10-08.");
console.log("Newer data adds rows; the S&P cases end 2023-06 and are unaffected, crypto 'to end' cases may shift.");
