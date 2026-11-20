# Investclub test: Stage Analysis (Weinstein) and Kullamägi breakouts

Rules: experiments/investclub-preregistration.md. Data: 4375 stocks (449 delisted / inactive), 2016-01-04 .. 2026-11-18; SPY calendar.

## S1 Weinstein Stage 2 breakout

| Portfolio | Annual | Sharpe | Max drawdown | 2016–2020: annual · Sharpe | 2021–2026: annual · Sharpe |
| --- | --- | --- | --- | --- | --- |
| **S1 Weinstein Stage 2 breakout**, 0.10% per side | -7.9% | -0.13 | -73.4% | -0.7% · 0.07 | -13.7% · -0.24 |
| S1 Weinstein Stage 2 breakout, 0.30% per side | -8.6% | -0.16 | -74.6% | -1.3% · 0.04 | -14.3% · -0.26 |
| SPY (buy and hold) | 14.3% | 0.85 | -33.8% | 15.2% · 0.87 | 13.6% · 0.85 |
| all liquid stocks, equal weight | 12.3% | 0.65 | -41.1% | 19.9% · 0.92 | 6.2% · 0.39 |

- 401 trades, 33.4% winners, average win 39.8%, average loss -25.9%, average hold 103 days, 41 trades in delisted stocks; best: SMCI 428.9%, BILI 350.6%, GME 289.0%; on average 15.4 positions held
- Random control (100 repeats, same exits and sizing): median annual 6.4% (5%–95%: 2.5% … 10.7%); the strategy has the better Sharpe in **0 of 100**.
- Bootstrap (2,000, daily returns paired with SPY): Sharpe above SPY in 0.1% of runs.
- 3045 signals in the test period (more than free slots are skipped)
- Checks: beats SPY (annual and Sharpe) ✗; beats random >= 95/100 ✗; positive in both periods ✗; above SPY at 0.30% ✗ → **STOP**

## S2 Kullamägi breakout

| Portfolio | Annual | Sharpe | Max drawdown | 2016–2020: annual · Sharpe | 2021–2026: annual · Sharpe |
| --- | --- | --- | --- | --- | --- |
| **S2 Kullamägi breakout**, 0.10% per side | -13.2% | -0.57 | -86.6% | 4.4% · 0.35 | -25.8% · -1.10 |
| S2 Kullamägi breakout, 0.30% per side | -20.2% | -0.96 | -92.6% | -1.9% · -0.04 | -33.0% · -1.50 |
| SPY (buy and hold) | 14.3% | 0.85 | -33.8% | 15.2% · 0.87 | 13.6% · 0.85 |
| all liquid stocks, equal weight | 12.3% | 0.65 | -41.1% | 19.9% · 0.92 | 6.2% · 0.39 |

- 3163 trades, 40.1% winners, average win 10.6%, average loss -8.2%, average hold 5 days, 164 trades in delisted stocks; best: VKTX 208.6%, GEVO 190.1%, NCTY 187.8%; on average 5.7 positions held
- Random control (100 repeats, same exits and sizing): median annual -34.1% (5%–95%: -38.4% … -29.5%); the strategy has the better Sharpe in **100 of 100**.
- Bootstrap (2,000, daily returns paired with SPY): Sharpe above SPY in 0.0% of runs.
- 15986 signal-days × stocks in the test period; a trade needs the next day's high above the 10-day high
- Checks: beats SPY (annual and Sharpe) ✗; beats random >= 95/100 ✓; positive in both periods ✗; above SPY at 0.30% ✗ → **STOP**

- **S2 optimistic bound** (no stop on the entry day: as if every entry-day low came before the breakout): annual -5.3%, Sharpe -0.15, max drawdown -74.9%; 2016–2020 10.5%, 2021–2026 -17.0%

## Verdict

- S1 Weinstein Stage 2 breakout: STOP
- S2 Kullamägi breakout: STOP
