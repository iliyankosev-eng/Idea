# Pre-registration: Investclub approach — Stage Analysis and Kullamägi breakouts (20.11.2026)

Written BEFORE running any test on the data. Investclub (Simeon Petkov) teaches trend following, Stage Analysis
(Trading Mastery 2.0) and "the strategies of Kullamägi". The course rules are not public, so the public canonical
versions are tested: Stan Weinstein ("Secrets for Profiting in Bull and Bear Markets") and Kristjan Kullamägi's
breakout setup as he describes it publicly. The fundamental filter (earnings, margins, institutional interest) of
Trading Mastery 2.0 cannot be tested (no fundamental data) — said plainly in the report.

## Data
- `universe` branch: Alpaca SIP daily bars, split + dividend adjusted, 2015-06 .. 2026-11, every NYSE/NASDAQ/AMEX
  symbol Alpaca lists as active OR inactive (delisted), ETF-like names removed, symbols that never reached a 50-day
  average dollar volume of $10M dropped. Test period: 2016-01-04 .. last bar.
- Liquid on day t: 50-day average dollar volume (close x volume) >= $20M, computed with data up to t.
- SPY: data/branch/daily/alpaca/SPY.csv.
- Known limits: delisted coverage depends on Alpaca's inactive list; a reused ticker merges two companies.

## Costs
0.10% of the traded value per side (commission-free broker, spread + slippage on liquid stocks). Sensitivity: 0.30%.

## S1 — Weinstein Stage 2 breakout (weekly)
Weekly bars = last trading day of each week. MA30 = 30-week SMA of weekly closes. RS = close / SPY close,
MRS = RS / SMA52(RS) - 1 (Mansfield relative strength).
- Signal at the close of week w (stock liquid at w):
  close > MA30, MA30(w) > MA30(w-1), close > max(weekly high, weeks w-26 .. w-1), close(w-1) <= that same max
  (fresh breakout), weekly volume >= 2 x average of weeks w-10 .. w-1, MRS > 0,
  and SPY weekly close > SPY MA30 (market in stage 2).
- Entry: open of the first day of week w+1. Exit: a weekly close < MA30 -> open of the next trading day.
- Portfolio: at most 20 positions, 5% of equity each at entry, no rebalancing; more signals than free slots ->
  highest MRS first. Idle cash earns 0.

## S2 — Kullamägi breakout (daily)
ADR20 = 20-day average of (high/low - 1). SMA10, SMA20 of closes. R63 = close / close 63 days ago - 1.
- Signal at the close of day t (stock liquid at t): ADR20 >= 4%; R63 >= 30% and in the top 3% of R63 among liquid
  stocks that day; close > SMA10 > SMA20; consolidation: (max high - min low of days t-9..t) / close <= 3 x ADR20;
  level = max high of days t-9..t.
- Entry on day t+1 if high(t+1) > level: buy at max(open(t+1), level). Stop = entry x (1 - ADR20).
  Daily bars cannot tell whether the low came before the breakout: if low(t+1) <= stop the trade is stopped at the
  stop the same day (conservative).
- Management: stop hit -> exit at the stop (or at the open if the open is already below it). At the close of the
  3rd day after entry, if close > entry: sell half at that close and move the stop to the entry. The rest exits at
  the first close below SMA10 (or the stop).
- Size: risk 0.5% of equity (entry - stop), position <= 20% of equity, total invested <= 100% (no margin);
  more signals than room -> highest R63 first. One position per symbol.

## Controls and measures
- Annual return, Sharpe (daily, 0% rate), max drawdown, trades, win rate, average win / loss; 2016-2020 and
  2021-2026 separately; costs 0.10% and 0.30% per side.
- Benchmarks: SPY buy and hold; equal-weight portfolio of all liquid stocks (rebalanced daily, same costs not
  charged) — shows how much the universe itself (incl. survivorship) gives.
- Random control, 100 repeats each, same portfolio and exit rules:
  S1: on each signal week, the same number of stocks picked at random among liquid stocks with close > MA30.
  S2: on each signal day, the same number of stocks picked at random among the liquid top-3%-R63 stocks (no
  consolidation / breakout condition), entry at the next open, same stop distance and management.
- Bootstrap of daily returns (5,000 runs): share of runs with Sharpe > SPY's.

## Verdict (per strategy)
GO only if ALL hold: annual return and Sharpe above SPY over the full period at 0.10%; better Sharpe than the
random control in >= 95 of 100 repeats; positive in both sub-periods; still above SPY's annual return at 0.30%.
Otherwise STOP.
