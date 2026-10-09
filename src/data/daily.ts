import { readFileSync } from "node:fs";
import { DataError, type Series } from "../types.js";
import { parseCsv } from "./csv.js";

const DAY_MS = 86_400_000;

export interface DailyOptions {
  /** Column with the price. Default "Price". */
  readonly priceCol?: string;
  /** Keep only rows where row[key] === value (e.g. Country = "Euro"). */
  readonly filter?: { readonly key: string; readonly value: string };
  /** Use 1/price (FX files quote foreign units per USD; the USD value of the currency is 1/rate). */
  readonly invert?: boolean;
  readonly from?: string;
  /** Largest allowed gap between consecutive trading days, in calendar days. Default 7. */
  readonly maxGapDays?: number;
}

/**
 * Business-day series (markets closed on weekends/holidays). Empty values (holidays) are skipped,
 * but a gap longer than maxGapDays is an error, so a hole in the data cannot hide a large move.
 * Non-positive prices are errors (e.g. WTI on 2020-04-20 at -37 USD: use Brent instead).
 * periodsPerYear = 252, cash = 0.
 */
export function loadDailyCsv(path: string, name: string, o: DailyOptions = {}): Series {
  const col = o.priceCol ?? "Price", maxGap = o.maxGapDays ?? 7, from = o.from ?? "0000";
  const rows = parseCsv(readFileSync(path, "utf8"))
    .filter((r) => !o.filter || r[o.filter.key] === o.filter.value)
    .filter((r) => (r["Date"] ?? "") >= from && (r[col] ?? "").trim() !== "")
    .map((r) => {
      const raw = Number(r[col]);
      return { date: r["Date"]!.slice(0, 10), p: o.invert ? 1 / raw : raw, raw };
    });
  if (rows.length < 2) throw new DataError(`${name}: no data`);
  const dates: string[] = [], price: number[] = [], ret: number[] = [], cash: number[] = [];
  rows.forEach((r, k) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new DataError(`${name}: bad date "${r.date}"`);
    if (!(r.raw > 0) || !Number.isFinite(r.p)) throw new DataError(`${name}: non-positive or bad price ${r.raw} at ${r.date}`);
    if (k > 0) {
      const gap = (Date.parse(r.date) - Date.parse(rows[k - 1]!.date)) / DAY_MS;
      if (gap <= 0) throw new DataError(`${name}: dates not increasing at ${r.date}`);
      if (gap > maxGap) throw new DataError(`${name}: gap of ${gap} days before ${r.date}`);
    }
    dates.push(r.date);
    price.push(r.p);
    ret.push(k === 0 ? 0 : r.p / rows[k - 1]!.p - 1);
    cash.push(0);
  });
  return { name, dates, price, ret, cash, periodsPerYear: 252 };
}
