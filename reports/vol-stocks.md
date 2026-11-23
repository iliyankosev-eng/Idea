# Intraday momentum on volatile stocks picked without hindsight

Rules: experiments/vol-stocks-preregistration.md. Equal weight across the year's picks; % per year = 252 x mean daily return.

## DT1

- Whole period: -3.6% per year · Sharpe -0.65 · max drawdown -34.0% · bootstrap 1.3%
- 2017–2020: -0.8% · Sharpe -0.16; 2021–2026: -5.5% · Sharpe -0.93
- By year: 2017 -10.1%, 2018 1.1%, 2019 9.1%, 2020 -3.3%, 2021 -8.4%, 2022 -6.9%, 2023 -7.1%, 2024 -0.4%, 2025 3.7%, 2026 -14.9%
- At $0.01 per share: -15.0% · Sharpe -2.68

## DT3-bot

- Whole period: 0.1% per year · Sharpe 0.02 · max drawdown -17.8% · bootstrap 52.6%
- 2017–2020: -1.6% · Sharpe -0.33; 2021–2026: 1.3% · Sharpe 0.19
- By year: 2017 -17.4%, 2018 2.7%, 2019 10.4%, 2020 -2.3%, 2021 -0.2%, 2022 10.9%, 2023 -0.7%, 2024 -2.2%, 2025 8.2%, 2026 -9.2%
- At $0.01 per share: -8.9% · Sharpe -1.42

## DT3

- Whole period: -1.4% per year · Sharpe -0.14 · max drawdown -39.2% · bootstrap 33.3%
- 2017–2020: 6.4% · Sharpe 0.70; 2021–2026: -6.7% · Sharpe -0.60
- By year: 2017 -25.9%, 2018 21.2%, 2019 30.2%, 2020 0.1%, 2021 -11.7%, 2022 -6.6%, 2023 -1.1%, 2024 -12.7%, 2025 2.3%, 2026 -11.0%
- At $0.01 per share: -22.6% · Sharpe -2.14

## DT7

- Whole period: 8.4% per year · Sharpe 0.28 · max drawdown -78.9% · bootstrap 81.5%
- 2017–2020: 19.1% · Sharpe 0.94; 2021–2026: 1.0% · Sharpe 0.03
- By year: 2017 11.0%, 2018 -2.7%, 2019 18.6%, 2020 49.5%, 2021 53.4%, 2022 -114.0%, 2023 14.8%, 2024 43.7%, 2025 53.6%, 2026 -51.0%
- At $0.01 per share: -17.5% · Sharpe -0.59

## Buy and hold

- Whole period: 19.0% per year · Sharpe 0.35 · max drawdown -87.1% · bootstrap 86.7%
- 2017–2020: 31.8% · Sharpe 0.93; 2021–2026: 10.3% · Sharpe 0.16
- By year: 2017 1.1%, 2018 -26.1%, 2019 44.5%, 2020 107.2%, 2021 33.6%, 2022 -96.2%, 2023 88.9%, 2024 43.7%, 2025 68.4%, 2026 -86.6%

## Verdict

- **DT1**: STOP (Sharpe -0.65, bootstrap 1.3%, positive years 3 of 10, at $0.01 -15.0%)
- **DT3-bot**: STOP (Sharpe 0.02, bootstrap 52.6%, positive years 4 of 10, at $0.01 -8.9%)
- **DT3**: STOP (Sharpe -0.14, bootstrap 33.3%, positive years 4 of 10, at $0.01 -22.6%)
- **DT7**: STOP (Sharpe 0.28, bootstrap 81.5%, positive years 7 of 10, at $0.01 -17.5%)

## Data notes

- 2017: 20 of 20 picks with data
- 2018: 20 of 20 picks with data
- 2019: 20 of 20 picks with data
- 2020: 20 of 20 picks with data
- 2021: 20 of 20 picks with data
- 2022: 20 of 20 picks with data
- 2023: 20 of 20 picks with data
- 2024: 20 of 20 picks with data
- 2025: 20 of 20 picks with data
- 2026: 20 of 20 picks with data

## Reading
Picked by a rule that only uses the previous year, the volatile stocks show no intraday-momentum edge: DT1 loses, DT3
is around zero, DT7 just follows the stocks themselves (buy and hold of the same picks: 19%/y with an 87% drawdown).
The strong single-stock results on NVDA, TSLA, AMD and AMZN in reports/cross-instrument.md came from choosing those
stocks with hindsight.
