import { readFileSync } from "node:fs";
import { DataError, type Series } from "../types.js";
import { parseCsv } from "./csv.js";

const DAY_MS = 86_400_000;

/**
 * Give a daily series a realistic cash return from a FRED rate series (e.g. DTB3, % per year).
 * cash[k] = rate known on or before dates[k-1] / 100 * calendar days from dates[k-1] to dates[k] / 365,
 * so weekends and holidays earn interest and no future rate is used. FRED marks missing days with "." or "".
 * Throws if the rate data starts after the series or a rate is more than 10 days old.
 */
export function withFredCash(s: Series, fredPath: string, column: string): Series {
  const rates = parseCsv(readFileSync(fredPath, "utf8"))
    .filter((r) => (r[column] ?? "").trim() !== "" && r[column] !== ".")
    .map((r) => ({ date: r["observation_date"]!, rate: Number(r[column]) }));
  if (rates.length === 0) throw new DataError(`${fredPath}: no ${column} values`);
  const cash: number[] = [0];
  let j = -1;
  for (let k = 1; k < s.dates.length; k++) {
    const prev = s.dates[k - 1]!;
    while (j + 1 < rates.length && rates[j + 1]!.date <= prev) j++;
    if (j < 0) throw new DataError(`${column}: no rate on or before ${prev}`);
    const known = rates[j]!;
    if ((Date.parse(prev) - Date.parse(known.date)) / DAY_MS > 10) throw new DataError(`${column}: last rate before ${prev} is from ${known.date}`);
    if (!Number.isFinite(known.rate)) throw new DataError(`${column}: bad rate at ${known.date}`);
    const days = (Date.parse(s.dates[k]!) - Date.parse(prev)) / DAY_MS;
    cash.push((known.rate / 100) * (days / 365));
  }
  return { ...s, name: s.name, cash };
}
