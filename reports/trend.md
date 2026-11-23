# Trend following (AQR style) on ETFs

Rules: experiments/trend-preregistration.md. Alpaca daily total-return data (Stooq refused the download, so no longer history). Monthly results; Sharpe = excess return over BIL.

## Set A (SPY, TLT, GLD)

Months: 117 (2017-02-01 .. 2026-11-02); first half ends 2021-12-01.

### Trend - main

- 5.5% a year · volatility 10.2% · Sharpe 0.34 · max drawdown -21.2% · bootstrap 87%
- excess over cash: first half 4.2%/y, second half 2.8%/y · correlation with SPY -0.07 · average in SPY's 10 worst months 0.1%
- by year: 2017 12.3%, 2018 -11.6%, 2019 3.3%, 2020 15.7%, 2021 4.7%, 2022 1.5%, 2023 -6.3%, 2024 12.7%, 2025 21.8%, 2026 3.5%

- average gross exposure 1.16x; costs 0.54% a year; average weight: SPY 0.33, TLT -0.10, GLD 0.11

### Trend - 12-month signal only

- 5.5% a year · volatility 10.5% · Sharpe 0.34 · max drawdown -21.4% · bootstrap 88%
- excess over cash: first half 0.1%/y, second half 6.9%/y · correlation with SPY 0.23 · average in SPY's 10 worst months -1.5%
- by year: 2017 2.6%, 2018 -15.1%, 2019 17.0%, 2020 5.4%, 2021 -0.3%, 2022 0.5%, 2023 -1.7%, 2024 22.0%, 2025 21.3%, 2026 7.4%

### Trend - long-only

- 9.8% a year · volatility 9.0% · Sharpe 0.83 · max drawdown -12.5% · bootstrap 100%
- excess over cash: first half 10.3%/y, second half 4.6%/y · correlation with SPY 0.33 · average in SPY's 10 worst months -1.1%
- by year: 2017 22.2%, 2018 -8.5%, 2019 15.8%, 2020 21.1%, 2021 8.3%, 2022 -10.6%, 2023 4.1%, 2024 15.3%, 2025 28.0%, 2026 6.5%

### SPY held

- 14.8% a year · volatility 16.3% · Sharpe 0.79 · max drawdown -23.8% · bootstrap 100%
- excess over cash: first half 16.5%/y, second half 9.2%/y · correlation with SPY 1.00 · average in SPY's 10 worst months -8.0%
- by year: 2017 20.4%, 2018 -5.6%, 2019 32.3%, 2020 15.7%, 2021 31.2%, 2022 -19.0%, 2023 26.0%, 2024 25.3%, 2025 18.2%, 2026 11.0%

### 60/40 (SPY/IEF)

- 9.5% a year · volatility 10.2% · Sharpe 0.71 · max drawdown -18.8% · bootstrap 100%
- excess over cash: first half 11.1%/y, second half 3.5%/y · correlation with SPY 0.96 · average in SPY's 10 worst months -4.7%
- by year: 2017 12.8%, 2018 -2.4%, 2019 22.6%, 2020 14.9%, 2021 16.0%, 2022 -16.5%, 2023 16.1%, 2024 14.6%, 2025 14.2%, 2026 6.0%

### equal weight, long (SPY, TLT, GLD)

- 9.2% a year · volatility 10.1% · Sharpe 0.70 · max drawdown -19.7% · bootstrap 98%
- excess over cash: first half 10.3%/y, second half 3.8%/y · correlation with SPY 0.62 · average in SPY's 10 worst months -2.2%
- by year: 2017 12.3%, 2018 -2.3%, 2019 22.4%, 2020 21.5%, 2021 4.6%, 2022 -15.4%, 2023 12.4%, 2024 14.9%, 2025 26.4%, 2026 0.3%

## Set B (7 ETFs)

Months: 117 (2017-02-01 .. 2026-11-02); first half ends 2021-12-01.

### Trend - main

- 6.4% a year · volatility 10.6% · Sharpe 0.42 · max drawdown -16.6% · bootstrap 92%
- excess over cash: first half 3.6%/y, second half 5.2%/y · correlation with SPY -0.28 · average in SPY's 10 worst months 2.5%
- by year: 2017 16.6%, 2018 -5.9%, 2019 -1.8%, 2020 7.8%, 2021 4.0%, 2022 15.0%, 2023 -4.1%, 2024 7.6%, 2025 15.1%, 2026 11.0%

- average gross exposure 1.69x; costs 0.85% a year; average weight: SPY 0.16, EFA 0.10, TLT -0.04, IEF -0.07, GLD 0.06, DBC 0.03, UUP 0.09

### Trend - 12-month signal only

- 5.1% a year · volatility 9.8% · Sharpe 0.32 · max drawdown -16.4% · bootstrap 87%
- excess over cash: first half -0.5%/y, second half 6.7%/y · correlation with SPY -0.12 · average in SPY's 10 worst months 1.6%
- by year: 2017 2.0%, 2018 -9.7%, 2019 9.9%, 2020 3.7%, 2021 0.5%, 2022 12.5%, 2023 2.4%, 2024 5.0%, 2025 11.2%, 2026 14.6%

### Trend - long-only

- 9.2% a year · volatility 8.8% · Sharpe 0.77 · max drawdown -12.7% · bootstrap 99%
- excess over cash: first half 7.9%/y, second half 5.7%/y · correlation with SPY 0.11 · average in SPY's 10 worst months 0.8%
- by year: 2017 22.1%, 2018 -7.3%, 2019 11.2%, 2020 10.5%, 2021 9.6%, 2022 7.8%, 2023 -4.8%, 2024 11.9%, 2025 18.4%, 2026 13.5%

### SPY held

- 14.8% a year · volatility 16.3% · Sharpe 0.79 · max drawdown -23.8% · bootstrap 100%
- excess over cash: first half 16.5%/y, second half 9.2%/y · correlation with SPY 1.00 · average in SPY's 10 worst months -8.0%
- by year: 2017 20.4%, 2018 -5.6%, 2019 32.3%, 2020 15.7%, 2021 31.2%, 2022 -19.0%, 2023 26.0%, 2024 25.3%, 2025 18.2%, 2026 11.0%

### 60/40 (SPY/IEF)

- 9.5% a year · volatility 10.2% · Sharpe 0.71 · max drawdown -18.8% · bootstrap 100%
- excess over cash: first half 11.1%/y, second half 3.5%/y · correlation with SPY 0.96 · average in SPY's 10 worst months -4.7%
- by year: 2017 12.8%, 2018 -2.4%, 2019 22.6%, 2020 14.9%, 2021 16.0%, 2022 -16.5%, 2023 16.1%, 2024 14.6%, 2025 14.2%, 2026 6.0%

### equal weight, long (SPY, EFA, TLT, IEF, GLD, DBC, UUP)

- 7.6% a year · volatility 6.8% · Sharpe 0.77 · max drawdown -10.7% · bootstrap 100%
- excess over cash: first half 6.8%/y, second half 3.7%/y · correlation with SPY 0.77 · average in SPY's 10 worst months -2.1%
- by year: 2017 8.1%, 2018 -3.2%, 2019 16.4%, 2020 9.9%, 2021 9.7%, 2022 -6.9%, 2023 8.1%, 2024 9.6%, 2025 16.9%, 2026 8.1%

## Verdict

- **Set A (SPY, TLT, GLD)**: no proof of an edge in this period (Sharpe 0.34, bootstrap 87%, halves 4.2% / 2.8%); insurance: YES (correlation -0.07, SPY's 10 worst months 0.1%)
- **Set B (7 ETFs)**: no proof of an edge in this period (Sharpe 0.42, bootstrap 92%, halves 3.6% / 5.2%); insurance: YES (correlation -0.28, SPY's 10 worst months 2.5%)

## Data check

- SPY: 2738 days 2016-01-04 .. 2026-11-20; 13.7% a year total return
- EFA: 2738 days 2016-01-04 .. 2026-11-20; 7.9% a year total return
- TLT: 2738 days 2016-01-04 .. 2026-11-20; -0.9% a year total return
- IEF: 2738 days 2016-01-04 .. 2026-11-20; 1.0% a year total return
- GLD: 2738 days 2016-01-04 .. 2026-11-20; 11.1% a year total return
- DBC: 2738 days 2016-01-04 .. 2026-11-20; 9.4% a year total return
- UUP: 2738 days 2016-01-04 .. 2026-11-20; 3.0% a year total return
- BIL: 2738 days 2016-01-04 .. 2026-11-20; 2.2% a year total return

## Checks
- Unit tests (test/trend.test.ts, 11) incl. no look-ahead and "a jump on the day after the month-end is not earned";
  9 deliberate bugs planted in the code, every one caught by the tests.
- Independent Python re-implementation (scripts/research/xcheck_trend.py) from the raw CSVs: set A, 117 months, same
  dates, largest monthly difference 1e-17, same 5.5% a year.
- The ETF data agrees exactly with the earlier, separate Alpaca download of SPY, GLD and BIL (data branch), and the
  total returns include dividends (SPY 4.04x vs 3.43x price only).

## Reading
- Ten years is short: AQR's evidence is 137 years and 67 markets; with 3-7 ETFs and 2016-2026 the main versions earn a
  Sharpe of 0.34-0.42 - below simply holding SPY (0.79) or 60/40 (0.71), and not enough to count as proof.
- What trend did do is what AQR and the managed-futures industry say it is for: insurance. Correlation with SPY near zero
  or negative, flat-to-positive in SPY's worst months, +15% in 2022 (set B) while 60/40 lost 16.5%.
- Long-only trend looks better (Sharpe 0.83 / 0.77), but it was a secondary variant, it mainly holds assets that went up,
  and in set B it equals simply holding all 7 (0.77). Not a finding without its own pre-registered test.
