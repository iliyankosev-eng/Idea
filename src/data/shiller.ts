import { readFileSync } from "node:fs";
import { DataError, type Series } from "../types.js";
import { parseCsv } from "./csv.js";

export interface ShillerOptions {
  /** First month NOT included ("YYYY-MM"). Default "2023-07": after that the file has no dividends. */
  readonly until?: string;
  /** Cash return: "long10y" = previous month's 10-year government yield / 12 (optimistic proxy), "zero" = 0%. */
  readonly cash?: "long10y" | "zero";
}

/**
 * S&P 500 monthly data from Robert Shiller (datasets/s-and-p-500 on GitHub).
 * IMPORTANT: prices are MONTHLY AVERAGES of daily closes. A decision at the end of month t
 * cannot be traded at the month-t average, so use lag >= 1 with this data.
 * Total return of month k = P[k]/P[k-1] - 1 + (D[k]/12)/P[k-1]  (D = annual dividend).
 */
export function loadShiller(path: string, opts: ShillerOptions = {}): Series {
  const until = opts.until ?? "2023-07";
  const cashMode = opts.cash ?? "long10y";
  const rows = parseCsv(readFileSync(path, "utf8"))
    .map((r) => ({
      month: (r["Date"] ?? "").slice(0, 7),
      p: Number(r["SP500"]),
      d: Number(r["Dividend"]),
      rate: Number(r["Long Interest Rate"]),
    }))
    .filter((r) => r.month < until);

  const dates: string[] = [], price: number[] = [], ret: number[] = [], cash: number[] = [];
  rows.forEach((r, k) => {
    if (!/^\d{4}-\d{2}$/.test(r.month)) throw new DataError(`Shiller: bad date "${r.month}"`);
    if (!(r.p > 0)) throw new DataError(`Shiller: bad price at ${r.month}`);
    if (!(r.d > 0)) throw new DataError(`Shiller: dividend missing at ${r.month} (rows after 2023-06 have none; lower 'until')`);
    if (!(r.rate > 0)) throw new DataError(`Shiller: interest rate missing at ${r.month}`);
    dates.push(r.month);
    price.push(r.p);
    if (k === 0) {
      ret.push(0);
      cash.push(0);
    } else {
      const prev = rows[k - 1]!;
      ret.push(r.p / prev.p - 1 + r.d / 12 / prev.p);
      cash.push(cashMode === "zero" ? 0 : prev.rate / 100 / 12);
    }
  });
  return { name: `S&P 500 (Shiller, cash=${cashMode})`, dates, price, ret, cash, periodsPerYear: 12 };
}
