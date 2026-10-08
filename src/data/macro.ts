import { readFileSync } from "node:fs";
import { DataError, type Series } from "../types.js";
import { parseCsv } from "./csv.js";

/** "YYYY-MM" of the month after `ym`. */
export function nextMonth(ym: string): string {
  let y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) + 1;
  if (m === 13) { y++; m = 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Builds a monthly Series from (month, price) pairs; requires consecutive months and positive prices. Cash = 0. */
export function monthlyFromPrices(name: string, rows: { month: string; price: number }[]): Series {
  const dates: string[] = [], price: number[] = [], ret: number[] = [], cash: number[] = [];
  rows.forEach((r, k) => {
    if (!/^\d{4}-\d{2}$/.test(r.month)) throw new DataError(`${name}: bad month "${r.month}"`);
    if (!(r.price > 0) || !Number.isFinite(r.price)) throw new DataError(`${name}: bad price ${r.price} at ${r.month}`);
    if (k > 0 && r.month !== nextMonth(rows[k - 1]!.month)) {
      throw new DataError(`${name}: missing month between ${rows[k - 1]!.month} and ${r.month}`);
    }
    dates.push(r.month);
    price.push(r.price);
    ret.push(k === 0 ? 0 : r.price / rows[k - 1]!.price - 1);
    cash.push(0);
  });
  return { name, dates, price, ret, cash, periodsPerYear: 12 };
}

/** Generic monthly CSV with a date column (YYYY-MM or YYYY-MM-DD) and a price column. */
export function loadMonthlyCsv(path: string, name: string, priceCol = "Price", from = "0000-00"): Series {
  const rows = parseCsv(readFileSync(path, "utf8"))
    .map((r) => ({ month: (r["Date"] ?? "").slice(0, 7), price: Number(r[priceCol]) }))
    .filter((r) => r.month >= from);
  return monthlyFromPrices(name, rows);
}

/** Price (per 1 of face value) of a bond paying semi-annual coupon `c`, maturing in `years`, at yield `y`. */
export function bondPrice(c: number, y: number, years: number): number {
  const n = years * 2, v = (1 + y / 2) ** -n;
  return (c / y) * (1 - v) + v;
}

/**
 * Approximate total return of a constant-maturity 10-year US Treasury from monthly yields.
 * Each month we buy a new 10-year bond at par (coupon = last month's yield), hold it one month,
 * and reprice it at this month's yield with 10 years minus one month left:
 *   r_t = bondPrice(y_{t-1}, y_t, 10 - 1/12) - 1 + y_{t-1}/12
 * This captures yield-dependent duration and convexity (a fixed duration of 8 gave +44% for 1982
 * vs. 32.8% published, which the calibration test caught).
 * The "price" is the cumulative total-return index (used by trend signals).
 */
export function loadBondFromYields(path: string, name = "US 10y Treasury (approx.)"): Series {
  const rows = parseCsv(readFileSync(path, "utf8")).map((r) => ({
    month: (r["Date"] ?? "").slice(0, 7),
    y: Number(r["Rate"]) / 100,
  }));
  const out: { month: string; price: number }[] = [];
  let idx = 100;
  rows.forEach((r, k) => {
    if (!(r.y > 0)) throw new DataError(`${name}: bad yield at ${r.month}`);
    if (k > 0) {
      const y0 = rows[k - 1]!.y;
      idx *= bondPrice(y0, r.y, 10 - 1 / 12) + y0 / 12;
    }
    out.push({ month: r.month, price: idx });
  });
  return monthlyFromPrices(name, out);
}

/**
 * Value in USD of holding one unit of a foreign currency. The FRED file quotes every currency
 * as foreign units per 1 USD (checked: GBP 0.4157 in 1971 = $2.41/GBP; EUR 0.8627 in 1999 = $1.16/EUR),
 * so the USD value is 1 / rate. Interest-rate differences (carry) are NOT included.
 */
export function loadFx(path: string, country: string, name = `${country} currency vs USD`): Series {
  const rows = parseCsv(readFileSync(path, "utf8"))
    .filter((r) => r["Country"] === country)
    .map((r) => ({ month: (r["Date"] ?? "").slice(0, 7), price: 1 / Number(r["Exchange rate"]) }));
  if (rows.length === 0) throw new DataError(`no FX rows for ${country}`);
  return monthlyFromPrices(name, rows);
}
