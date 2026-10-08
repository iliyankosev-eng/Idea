# Phase 1 calibration: S&P 500, 1901-2012, no costs

Published (Faber, month-end total returns): buy-and-hold 9.3%/yr, vol 17.9%, max DD -83.5%; 10-month SMA 10.2%/yr, vol 12.0%, max DD -50.3%.

| Strategy (this engine, Shiller monthly averages) | CAGR % | Vol % | Max DD % | Sharpe | Turnover/yr |
| --- | --- | --- | --- | --- | --- |
| Buy-and-hold | 9.42 | 15.0 | -81.8 | 0.68 | 0.00 |
| SMA 10, lag 0 (biased: month-average look-ahead) | 11.93 | 9.9 | -41.0 | 1.19 | 1.29 |
| SMA 10, lag 1 (honest for this data) | 10.22 | 9.7 | -46.7 | 1.06 | 1.29 |

Notes: monthly averages smooth prices, so volatility is lower than Faber's month-end data;
lag 0 on averaged data peeks half a month ahead, which is why lag 1 is the honest setting here.
