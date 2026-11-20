# Investclub test: Stage Analysis (Weinstein) and Kullamägi breakouts — CLEANED data (histories split at >5x one-day jumps)

Rules: experiments/investclub-preregistration.md. Data: 4718 stocks (463 delisted / inactive), 2016-01-04 .. 2026-11-18; SPY calendar.

## S1 Weinstein Stage 2 breakout

| Portfolio | Annual | Sharpe | Max drawdown | 2016–2020: annual · Sharpe | 2021–2026: annual · Sharpe |
| --- | --- | --- | --- | --- | --- |
| **S1 Weinstein Stage 2 breakout**, 0.10% per side | -6.5% | -0.08 | -71.9% | 1.8% · 0.19 | -13.0% · -0.21 |
| S1 Weinstein Stage 2 breakout, 0.30% per side | -7.1% | -0.10 | -73.2% | 1.2% · 0.16 | -13.7% · -0.23 |
| SPY (buy and hold) | 14.3% | 0.85 | -33.8% | 15.2% · 0.87 | 13.6% · 0.85 |
| all liquid stocks, equal weight | 11.1% | 0.61 | -41.1% | 16.6% · 0.82 | 6.7% · 0.42 |

- 400 trades, 34.8% winners, average win 39.9%, average loss -25.1%, average hold 104 days, 43 trades in delisted stocks; best: SMCI 428.9%, BILI 350.6%, GME 289.0%; on average 15.6 positions held
- Random control (100 repeats, same exits and sizing): median annual 6.6% (5%–95%: 3.8% … 11.8%); the strategy has the better Sharpe in **0 of 100**.
- Bootstrap (2,000, daily returns paired with SPY): Sharpe above SPY in 0.2% of runs.
- 3015 signals in the test period (more than free slots are skipped)
- Checks: beats SPY (annual and Sharpe) ✗; beats random >= 95/100 ✗; positive in both periods ✗; above SPY at 0.30% ✗ → **STOP**

## S2 Kullamägi breakout

| Portfolio | Annual | Sharpe | Max drawdown | 2016–2020: annual · Sharpe | 2021–2026: annual · Sharpe |
| --- | --- | --- | --- | --- | --- |
| **S2 Kullamägi breakout**, 0.10% per side | -12.9% | -0.55 | -86.5% | 4.3% · 0.34 | -25.3% · -1.05 |
| S2 Kullamägi breakout, 0.30% per side | -20.0% | -0.94 | -92.6% | -2.0% · -0.05 | -32.7% · -1.46 |
| SPY (buy and hold) | 14.3% | 0.85 | -33.8% | 15.2% · 0.87 | 13.6% · 0.85 |
| all liquid stocks, equal weight | 11.1% | 0.61 | -41.1% | 16.6% · 0.82 | 6.7% · 0.42 |

- 3192 trades, 40.3% winners, average win 10.5%, average loss -7.9%, average hold 5 days, 165 trades in delisted stocks; best: VKTX 208.6%, GEVO 190.1%, NCTY 187.8%; on average 5.8 positions held
- Random control (100 repeats, same exits and sizing): median annual -31.8% (5%–95%: -36.7% … -28.1%); the strategy has the better Sharpe in **100 of 100**.
- Bootstrap (2,000, daily returns paired with SPY): Sharpe above SPY in 0.0% of runs.
- 16014 signal-days × stocks in the test period; a trade needs the next day's high above the 10-day high
- Checks: beats SPY (annual and Sharpe) ✗; beats random >= 95/100 ✓; positive in both periods ✗; above SPY at 0.30% ✗ → **STOP**

- **S2 optimistic bound** (no stop on the entry day: as if every entry-day low came before the breakout): annual -4.6%, Sharpe -0.11, max drawdown -74.1%; 2016–2020 11.1%, 2021–2026 -16.2%

## Verdict

- S1 Weinstein Stage 2 breakout: STOP
- S2 Kullamägi breakout: STOP

## Descriptive, not pre-registered: only larger stocks (cleaned data, 0.10% per side)

| Variant | Annual | Sharpe | Max drawdown | 2016–2020 | 2021–2026 | Trades |
| --- | --- | --- | --- | --- | --- | --- |
| S1, dollar volume >= $100M | 7.8% | 0.44 | -41.4% | 8.4% | 7.3% | 301 |
| S2, dollar volume >= $100M | -7.4% | -0.64 | -60.1% | -0.8% | -12.8% | 1205 |
| S2 optimistic bound, >= $100M | -4.4% | -0.34 | -47.5% | 0.7% | -8.6% | 1151 |
| S1, dollar volume >= $300M | 1.3% | 0.16 | -37.6% | 0.3% | 2.1% | 226 |
| S2, dollar volume >= $300M | -1.9% | -0.28 | -28.9% | 1.9% | -5.0% | 431 |
| S2 optimistic bound, >= $300M | -0.9% | -0.12 | -24.8% | 2.2% | -3.5% | 412 |
