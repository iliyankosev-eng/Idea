import { metricsFromReturns, windowRange, type Metrics } from "./metrics.js";
import { validateSeries, type Series } from "./types.js";

/**
 * Realistic portfolio simulation on top of a list of decisions (target weights).
 *
 * Differences from runBacktest (which assumes the weight is reset to target every bar for free):
 * - Holdings drift with the price between rebalances; costs are paid on the amount actually traded.
 * - Rebalancing happens only when the held weight is more than `band` away from the target
 *   (going to 0 or from 0 always trades), so small daily wiggles do not generate trades.
 * - Optional capital-gains tax on realised gains, netted per calendar year (no loss carry-forward,
 *   as in Bulgaria), paid at the first bar of the next year; at the end everything is sold and taxed.
 * - The simulation starts flat (all cash) at the first bar of the window.
 * Trading costs of a bar are deducted at the end of that bar (same convention as runBacktest), so for
 * 0/1 weights, band 0, no tax and no final liquidation the returns equal runBacktest's (tested).
 */
export interface PortfolioOptions {
  readonly start?: string;
  readonly end?: string;
  /** Same meaning as in runBacktest: weight decided at bar t is first held during bar t+1+lag. */
  readonly lag: number;
  /** Cost as a fraction of the traded amount. */
  readonly cost: number;
  /** Rebalance only if |held weight - target| > band. 0 = always rebalance. */
  readonly band: number;
  /** Tax rate on net realised gains per calendar year (0.09 = 9%). 0 = no tax. */
  readonly taxRate: number;
  /** Sell everything (with cost) and pay tax at the end of the window. Default true. */
  readonly liquidateAtEnd?: boolean;
}

export interface PortfolioResult {
  readonly dates: readonly string[];
  /** Net return of each bar in the window, after costs and taxes. */
  readonly returns: readonly number[];
  /** Weight held at the end of each bar (after price moves). */
  readonly heldWeights: readonly number[];
  readonly metrics: Metrics;
  readonly trades: number;
  /** Totals in units of starting capital (1.0 = 100% of the initial money). */
  readonly costsPaid: number;
  readonly taxesPaid: number;
  /** Average yearly drag in % of the portfolio value at the time each cost/tax was paid. */
  readonly costDragPerYear: number;
  readonly taxDragPerYear: number;
}

const yearOf = (d: string) => d.slice(0, 4);

export function simulatePortfolio(series: Series, decisions: readonly number[], o: PortfolioOptions): PortfolioResult {
  validateSeries(series);
  if (decisions.length !== series.dates.length) throw new RangeError("decisions must have one value per bar");
  if (!Number.isInteger(o.lag) || o.lag < 0) throw new RangeError("lag must be a non-negative integer");
  if (!(o.cost >= 0 && o.cost < 1)) throw new RangeError("cost must be in [0, 1)");
  if (!(o.band >= 0 && o.band < 1)) throw new RangeError("band must be in [0, 1)");
  if (!(o.taxRate >= 0 && o.taxRate < 1)) throw new RangeError("taxRate must be in [0, 1)");
  for (const d of decisions) if (!Number.isFinite(d) || d < 0) throw new RangeError(`invalid decision ${d}`);
  const liquidate = o.liquidateAtEnd ?? true;
  const [i0, i1] = windowRange(series.dates, o.start, o.end);

  let H = 0; // market value of the holding
  let C = 1; // cash
  let B = 0; // cost basis of the holding
  let realised = 0; // net realised gains in the current calendar year
  let pendingCost = 0; // trading costs of the current bar, deducted at its end
  let trades = 0, costsPaid = 0, taxesPaid = 0, costDrag = 0, taxDrag = 0;
  const returns: number[] = [], held: number[] = [], dates: string[] = [];

  const sell = (amount: number): void => {
    if (amount <= 0 || H <= 0) return;
    const f = Math.min(1, amount / H);
    const proceeds = f * H;
    realised += proceeds - f * B;
    B -= f * B;
    H -= proceeds;
    C += proceeds;
    pendingCost += o.cost * proceeds;
  };
  const buy = (amount: number): void => {
    if (amount <= 0) return;
    H += amount;
    B += amount;
    C -= amount;
    pendingCost += o.cost * amount;
  };
  /** Costs reduce the whole portfolio pro rata, so they do not shift the held weight (no phantom rebalancing). */
  const chargeCosts = () => {
    if (pendingCost <= 0) return;
    const E = H + C;
    const factor = 1 - pendingCost / E;
    costDrag += pendingCost / E;
    H *= factor;
    C *= factor;
    costsPaid += pendingCost;
    pendingCost = 0;
  };
  const payTax = () => {
    const tax = o.taxRate * Math.max(0, realised);
    realised = 0;
    if (tax <= 0) return;
    taxDrag += tax / (H + C);
    if (C < tax) sell(tax - C); // raise cash if needed; the gain of that sale counts in the new year
    C -= tax;
    taxesPaid += tax;
  };

  for (let k = i0; k <= i1; k++) {
    const E0 = H + C;
    // 1) tax for the previous calendar year, paid at the first bar of a new year
    if (k > i0 && yearOf(series.dates[k]!) !== yearOf(series.dates[k - 1]!)) payTax();
    // 2) rebalance at the start of bar k towards the target decided earlier
    const src = k - 1 - o.lag;
    const target = src >= 0 ? decisions[src]! : 0;
    const E = H + C;
    const w = E > 0 ? H / E : 0;
    const mustTrade = (target === 0 && H > 0) || (target > 0 && H === 0) || Math.abs(w - target) > o.band;
    if (mustTrade) {
      const want = target * E;
      if (Math.abs(want - H) > 1e-12 * Math.max(1, E)) {
        if (want < H) sell(H - want);
        else buy(want - H);
        trades++;
      }
    }
    // 3) price and interest during bar k, then this bar's trading costs
    H *= 1 + series.ret[k]!;
    C *= 1 + series.cash[k]!;
    chargeCosts();
    // 4) at the end of the window: sell everything (with cost) and pay the last year's tax
    if (liquidate && k === i1) {
      if (H > 0) {
        sell(H);
        trades++;
        chargeCosts();
      }
      payTax();
    }
    const E1 = H + C;
    returns.push(E1 / E0 - 1);
    held.push(E1 > 0 ? H / E1 : 0);
    dates.push(series.dates[k]!);
  }

  const metrics = metricsFromReturns(returns, series.periodsPerYear, {
    start: dates[0]!,
    end: dates[dates.length - 1]!,
  });
  return {
    dates, returns, heldWeights: held, metrics, trades, costsPaid, taxesPaid,
    costDragPerYear: (costDrag / metrics.years) * 100,
    taxDragPerYear: (taxDrag / metrics.years) * 100,
  };
}
