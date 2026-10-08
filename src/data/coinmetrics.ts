import { readFileSync } from "node:fs";
import { DataError, type Series } from "../types.js";
import { parseCsv } from "./csv.js";

const DAY_MS = 86_400_000;

/**
 * Daily prices from CoinMetrics community data (github.com/coinmetrics/data, csv/<asset>.csv).
 * Uses PriceUSD; rows without a price are dropped. Requires consecutive calendar days
 * (crypto trades every day) so a hole in the data cannot hide a large move.
 * Cash earns 0%.
 */
export function loadCoinMetrics(path: string, name: string, from = "2010-01-01"): Series {
  const rows = parseCsv(readFileSync(path, "utf8"))
    .filter((r) => (r["PriceUSD"] ?? "") !== "" && (r["time"] ?? "") >= from)
    .map((r) => ({ date: r["time"]!, p: Number(r["PriceUSD"]) }));

  const dates: string[] = [], price: number[] = [], ret: number[] = [], cash: number[] = [];
  rows.forEach((r, k) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new DataError(`${name}: bad date "${r.date}"`);
    if (!(r.p > 0)) throw new DataError(`${name}: bad price at ${r.date}`);
    if (k > 0) {
      const prev = rows[k - 1]!;
      const gap = (Date.parse(r.date) - Date.parse(prev.date)) / DAY_MS;
      if (gap !== 1) throw new DataError(`${name}: gap of ${gap} days between ${prev.date} and ${r.date}`);
    }
    dates.push(r.date);
    price.push(r.p);
    ret.push(k === 0 ? 0 : r.p / rows[k - 1]!.p - 1);
    cash.push(0);
  });
  return { name, dates, price, ret, cash, periodsPerYear: 365 };
}
