# Pre-registration: AQR-style trend following on ETFs (23.11.2026)

Iliyan asked about a "learn quant in a week" video whose hands-on step is: take stocks, bonds and gold, buy what is going
up, short what is going down (after AQR, "A Century of Evidence on Trend-Following Investing", Hurst/Ooi/Pedersen).
Written before any of the data below was downloaded.

## Assets
- Set A (the video): SPY (US stocks), TLT (long US bonds), GLD (gold).
- Set B (broader, closer to AQR's mix of asset classes): SPY, EFA (non-US stocks), TLT, IEF (7-10y bonds), GLD,
  DBC (commodities), UUP (US dollar).
- Cash: BIL (1-3 month T-bills).

## Data
- Alpaca daily bars, adjusted for splits AND dividends (total return), 2016-01 .. 2026-11 (etfdata branch).
- Stooq daily (longer history: SPY 1993, TLT/IEF 2002, GLD 2004, DBC 2006, UUP/BIL 2007). Used only for an ETF whose
  Stooq series matches Alpaca over 2016-01 .. 2026-10: annual return within 0.5 points and daily-return correlation
  >= 0.99 (i.e. Stooq also contains dividends). Otherwise that set is tested on Alpaca only.
- Test window: from the first month-end where every asset of the set and BIL have 13 months of history plus 252 days for
  volatility, to 2026-10. Alpaca: about 2017-01 .. 2026-10. Stooq (if valid): about 2008-06 .. 2026-10.

## Strategy (as in the AQR paper, simplified to ETFs)
At each month-end close, per asset: excess return over BIL in the past 1, 3 and 12 months; signal = average of their
signs (-1, -1/3, +1/3, +1). Weight = signal / volatility (std of the past 252 daily excess returns, annualised). The whole
portfolio is scaled to 10% expected annual volatility (covariance of the past 252 daily excess returns); gross exposure
is capped at 2x (what a normal margin account allows overnight). Trades happen at the close of the NEXT trading day
(one day of delay, no look-ahead) and are held for the month. Return = BIL + sum of weight x (asset - BIL).
Costs: 0.03% of every dollar traded (spread + slippage) and 0.5% a year on short positions (borrow fee).
Secondary variants (reported, not part of the verdict): 12-month signal only; long-only (signal > 0 -> long, else cash).

## Comparisons
SPY held; 60/40 (60% SPY, 40% IEF, rebalanced monthly); equal-weight of the set's assets held long (monthly rebalanced).

## Measures
Annual return, volatility, Sharpe of the excess return over BIL, max drawdown, block bootstrap P(mean excess > 0)
(blocks of 6 months, 5000 runs), first and second half of the window, every calendar year, correlation with SPY,
average result in SPY's 10 worst months, 2022.

## Verdict (per set, on the longest valid data)
- "Edge worth a paper test": Sharpe of excess >= 0.5, bootstrap >= 95%, excess positive in both halves.
- Otherwise "no proof of an edge in this period".
- Separately: "useful as insurance" if the correlation with SPY is <= 0.2 and the average in SPY's 10 worst months > 0.
