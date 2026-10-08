import type { Series } from "./types.js";

/** Thrown when a strategy tries to read data from after the moment it is deciding. */
export class LookAheadError extends Error {
  override name = "LookAheadError";
}

/**
 * Read-only window onto a series, cut at bar `t` (the decision moment).
 * Any attempt to read bar t+1 or later throws LookAheadError, so a strategy
 * cannot use the future even by accident.
 */
export class History {
  constructor(private readonly s: Series, readonly t: number) {}

  /** Number of bars visible (0..t). */
  get length(): number {
    return this.t + 1;
  }

  get periodsPerYear(): number {
    return this.s.periodsPerYear;
  }

  private check(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i > this.t) {
      throw new LookAheadError(`bar ${i} is not visible at decision bar ${this.t} (allowed 0..${this.t})`);
    }
  }

  date(i: number): string {
    this.check(i);
    return this.s.dates[i]!;
  }

  price(i: number): number {
    this.check(i);
    return this.s.price[i]!;
  }

  ret(i: number): number {
    this.check(i);
    return this.s.ret[i]!;
  }

  /** The last n prices ending at t (oldest first), or null if fewer than n bars exist. */
  lastPrices(n: number): number[] | null {
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a positive integer, got ${n}`);
    if (n > this.length) return null;
    const out: number[] = [];
    for (let i = this.t - n + 1; i <= this.t; i++) out.push(this.price(i));
    return out;
  }

  /** The last n returns ending at t (oldest first), or null if fewer than n returns exist (bar 0 has none). */
  lastReturns(n: number): number[] | null {
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a positive integer, got ${n}`);
    if (n > this.t) return null; // returns exist for bars 1..t
    const out: number[] = [];
    for (let i = this.t - n + 1; i <= this.t; i++) out.push(this.ret(i));
    return out;
  }
}

/** A strategy looks at the visible history and returns the target weight in the asset (0 = all cash). */
export type Strategy = (h: History) => number;
