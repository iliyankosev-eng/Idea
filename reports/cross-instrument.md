# Every earlier strategy on 18 instruments

Rules: experiments/cross-instrument-preregistration.md. 252 single tests; Holm correction at 5%. Daily-return strategies in % per year (all days, net); per-trade strategies in R per trade (net).

## DT1

Original: SPY, QQQ. New instruments together: 3.0%/y, Sharpe 0.57, bootstrap 98%, 2016–2020 3.6%/y, 2021–2026 2.4%/y; positive on 11 of 16. **Holds.**

- SPY (original): 10.6%/y · Sharpe 1.02 · 1634 trades · bootstrap 100% · halves 7.7%/y / 13.0%/y · **survives Holm**
- QQQ (original): 18.6%/y · Sharpe 1.60 · 1582 trades · bootstrap 100% · halves 15.8%/y / 21.1%/y · **survives Holm**
- DIA: 0.4%/y · Sharpe 0.04 · 1629 trades · bootstrap 55% · halves 0.8%/y / 0.1%/y
- IWM: -0.2%/y · Sharpe -0.02 · 1701 trades · bootstrap 49% · halves 4.1%/y / -3.9%/y
- GLD: -0.3%/y · Sharpe -0.04 · 1541 trades · bootstrap 45% · halves -3.8%/y / 2.6%/y
- SLV: -11.7%/y · Sharpe -1.05 · 1517 trades · bootstrap 0% · halves -17.6%/y / -6.7%/y
- AAPL: 7.5%/y · Sharpe 0.56 · 1573 trades · bootstrap 98% · halves 11.0%/y / 4.6%/y
- MSFT: 4.1%/y · Sharpe 0.31 · 1605 trades · bootstrap 87% · halves 3.4%/y / 4.7%/y
- NVDA: 13.0%/y · Sharpe 0.96 · 1543 trades · bootstrap 100% · halves 14.6%/y / 11.6%/y · **survives Holm**
- AMZN: 11.5%/y · Sharpe 0.89 · 1590 trades · bootstrap 100% · halves 20.3%/y / 3.9%/y · **survives Holm**
- GOOGL: 8.6%/y · Sharpe 0.67 · 1570 trades · bootstrap 99% · halves 15.6%/y / 2.6%/y
- META: 7.1%/y · Sharpe 0.56 · 1605 trades · bootstrap 97% · halves 11.1%/y / 3.8%/y
- TSLA: 21.3%/y · Sharpe 1.51 · 1617 trades · bootstrap 100% · halves 22.1%/y / 20.7%/y · **survives Holm**
- AMD: 9.8%/y · Sharpe 0.69 · 1566 trades · bootstrap 99% · halves 8.2%/y / 11.2%/y
- INTC: 0.2%/y · Sharpe 0.02 · 1600 trades · bootstrap 54% · halves -6.8%/y / 6.2%/y
- BA: 1.9%/y · Sharpe 0.13 · 1692 trades · bootstrap 66% · halves 3.9%/y / 0.2%/y
- XOM: -2.7%/y · Sharpe -0.23 · 1593 trades · bootstrap 23% · halves -3.9%/y / -1.6%/y
- PFE: -21.9%/y · Sharpe -1.62 · 1630 trades · bootstrap 0% · halves -23.2%/y / -20.8%/y

## DT2

Original: QQQ. New instruments together: -32.1%/y, Sharpe -2.67, bootstrap 0%, 2016–2020 -48.3%/y, 2021–2026 -18.2%/y; positive on 4 of 17. **Does not hold.**

- SPY: -4.7%/y · Sharpe -0.38 · 2723 trades · bootstrap 7% · halves -12.5%/y / 2.0%/y
- QQQ (original): 5.9%/y · Sharpe 0.36 · 2721 trades · bootstrap 90% · halves -1.8%/y / 12.6%/y
- DIA: -8.0%/y · Sharpe -0.66 · 2723 trades · bootstrap 1% · halves -7.4%/y / -8.5%/y
- IWM: -16.0%/y · Sharpe -0.89 · 2723 trades · bootstrap 0% · halves -30.1%/y / -3.9%/y
- GLD: -23.4%/y · Sharpe -2.33 · 2723 trades · bootstrap 0% · halves -29.1%/y / -18.5%/y
- SLV: -218.0%/y · Sharpe -8.42 · 2723 trades · bootstrap 0% · halves -307.1%/y / -141.4%/y
- AAPL: -11.6%/y · Sharpe -0.53 · 2721 trades · bootstrap 3% · halves -13.8%/y / -9.7%/y
- MSFT: -25.8%/y · Sharpe -1.22 · 2721 trades · bootstrap 0% · halves -46.6%/y / -7.9%/y
- NVDA: 41.6%/y · Sharpe 1.17 · 2721 trades · bootstrap 100% · halves 44.0%/y / 39.5%/y · **survives Holm**
- AMZN: 6.8%/y · Sharpe 0.28 · 2721 trades · bootstrap 83% · halves 28.4%/y / -11.7%/y
- GOOGL: -23.9%/y · Sharpe -1.02 · 2721 trades · bootstrap 0% · halves -12.1%/y / -33.9%/y
- META: -4.2%/y · Sharpe -0.15 · 2721 trades · bootstrap 31% · halves 1.0%/y / -8.6%/y
- TSLA: 75.5%/y · Sharpe 1.71 · 2721 trades · bootstrap 100% · halves 60.6%/y / 88.3%/y · **survives Holm**
- AMD: -106.4%/y · Sharpe -1.84 · 2721 trades · bootstrap 0% · halves -243.3%/y / 11.2%/y
- INTC: -90.1%/y · Sharpe -2.66 · 2721 trades · bootstrap 0% · halves -86.3%/y / -93.4%/y
- BA: 26.2%/y · Sharpe 0.85 · 2713 trades · bootstrap 100% · halves 33.7%/y / 19.7%/y
- XOM: -45.4%/y · Sharpe -1.97 · 2708 trades · bootstrap 0% · halves -61.0%/y / -32.0%/y
- PFE: -118.7%/y · Sharpe -4.97 · 2701 trades · bootstrap 0% · halves -139.7%/y / -100.5%/y

## DT3

Original: QQQ. New instruments together: 5.0%/y, Sharpe 0.51, bootstrap 96%, 2016–2020 6.1%/y, 2021–2026 4.1%/y; positive on 10 of 17. **Does not hold.**

- SPY: 6.6%/y · Sharpe 0.29 · 2695 trades · bootstrap 85% · halves 4.4%/y / 8.6%/y
- QQQ (original): 23.3%/y · Sharpe 0.82 · 2700 trades · bootstrap 100% · halves 29.0%/y / 18.4%/y
- DIA: -3.8%/y · Sharpe -0.17 · 2699 trades · bootstrap 26% · halves 5.5%/y / -11.9%/y
- IWM: 9.7%/y · Sharpe 0.34 · 2691 trades · bootstrap 87% · halves 13.0%/y / 6.9%/y
- GLD: 2.7%/y · Sharpe 0.14 · 2660 trades · bootstrap 68% · halves 0.8%/y / 4.3%/y
- SLV: -40.9%/y · Sharpe -1.44 · 2536 trades · bootstrap 0% · halves -57.5%/y / -26.6%/y
- AAPL: -2.5%/y · Sharpe -0.10 · 2712 trades · bootstrap 37% · halves 11.2%/y / -14.3%/y
- MSFT: 23.9%/y · Sharpe 0.81 · 2708 trades · bootstrap 100% · halves 24.8%/y / 23.1%/y
- NVDA: 24.2%/y · Sharpe 0.79 · 2708 trades · bootstrap 100% · halves 31.2%/y / 18.2%/y
- AMZN: 35.5%/y · Sharpe 1.15 · 2715 trades · bootstrap 100% · halves 58.7%/y / 15.6%/y · **survives Holm**
- GOOGL: 8.5%/y · Sharpe 0.31 · 2701 trades · bootstrap 84% · halves 9.6%/y / 7.5%/y
- META: -1.9%/y · Sharpe -0.07 · 2708 trades · bootstrap 41% · halves 4.0%/y / -7.0%/y
- TSLA: 33.9%/y · Sharpe 1.04 · 2711 trades · bootstrap 100% · halves 34.7%/y / 33.1%/y · **survives Holm**
- AMD: 12.3%/y · Sharpe 0.41 · 2677 trades · bootstrap 92% · halves 17.6%/y / 7.7%/y
- INTC: -12.7%/y · Sharpe -0.45 · 2687 trades · bootstrap 7% · halves -24.1%/y / -2.8%/y
- BA: 6.9%/y · Sharpe 0.24 · 2695 trades · bootstrap 79% · halves -5.4%/y / 17.6%/y
- XOM: -4.0%/y · Sharpe -0.15 · 2666 trades · bootstrap 31% · halves -12.8%/y / 3.6%/y
- PFE: -12.6%/y · Sharpe -0.49 · 2653 trades · bootstrap 6% · halves -11.6%/y / -13.4%/y

## DT3-bot

Original: QQQ. New instruments together: 2.0%/y, Sharpe 0.38, bootstrap 90%, 2016–2020 1.0%/y, 2021–2026 2.8%/y; positive on 12 of 17. **Does not hold.**

- SPY: 6.6%/y · Sharpe 0.63 · 1492 trades · bootstrap 99% · halves 3.2%/y / 9.6%/y
- QQQ (original): 12.5%/y · Sharpe 0.91 · 1569 trades · bootstrap 100% · halves 10.6%/y / 14.1%/y
- DIA: 0.4%/y · Sharpe 0.03 · 1652 trades · bootstrap 55% · halves 5.4%/y / -3.9%/y
- IWM: 4.4%/y · Sharpe 0.33 · 1591 trades · bootstrap 85% · halves 6.6%/y / 2.5%/y
- GLD: 1.2%/y · Sharpe 0.13 · 1391 trades · bootstrap 69% · halves 0.9%/y / 1.5%/y
- SLV: -9.5%/y · Sharpe -0.74 · 1305 trades · bootstrap 1% · halves -14.7%/y / -5.0%/y
- AAPL: -5.5%/y · Sharpe -0.38 · 1889 trades · bootstrap 11% · halves -0.1%/y / -10.2%/y
- MSFT: 8.7%/y · Sharpe 0.56 · 1808 trades · bootstrap 97% · halves 6.8%/y / 10.3%/y
- NVDA: 9.1%/y · Sharpe 0.53 · 1745 trades · bootstrap 97% · halves 3.7%/y / 13.8%/y
- AMZN: 15.5%/y · Sharpe 0.96 · 1764 trades · bootstrap 100% · halves 23.4%/y / 8.7%/y
- GOOGL: 4.7%/y · Sharpe 0.31 · 1791 trades · bootstrap 84% · halves -1.5%/y / 10.0%/y
- META: 0.1%/y · Sharpe 0.01 · 1780 trades · bootstrap 51% · halves -1.2%/y / 1.2%/y
- TSLA: 16.9%/y · Sharpe 0.96 · 1738 trades · bootstrap 100% · halves 14.6%/y / 18.8%/y · **survives Holm**
- AMD: 6.3%/y · Sharpe 0.36 · 1774 trades · bootstrap 88% · halves -0.0%/y / 11.8%/y
- INTC: -8.9%/y · Sharpe -0.56 · 1828 trades · bootstrap 3% · halves -11.5%/y / -6.6%/y
- BA: 1.8%/y · Sharpe 0.11 · 1805 trades · bootstrap 64% · halves -3.2%/y / 6.1%/y
- XOM: -5.2%/y · Sharpe -0.39 · 1741 trades · bootstrap 11% · halves -8.5%/y / -2.4%/y
- PFE: -12.0%/y · Sharpe -0.87 · 1815 trades · bootstrap 0% · halves -5.8%/y / -17.3%/y

## DT4

Original: SPY. New instruments together: -3.2%/y, Sharpe -0.84, bootstrap 1%, 2016–2020 -1.7%/y, 2021–2026 -4.5%/y; positive on 3 of 17. **Does not hold.**

- SPY (original): -1.2%/y · Sharpe -0.24 · 2717 trades · bootstrap 22% · halves -0.1%/y / -2.1%/y
- QQQ: -0.7%/y · Sharpe -0.13 · 2715 trades · bootstrap 34% · halves 2.8%/y / -3.7%/y
- DIA: -2.9%/y · Sharpe -0.61 · 2706 trades · bootstrap 2% · halves -2.5%/y / -3.2%/y
- IWM: -3.3%/y · Sharpe -0.63 · 2715 trades · bootstrap 2% · halves -0.7%/y / -5.5%/y
- GLD: 0.3%/y · Sharpe 0.15 · 2707 trades · bootstrap 69% · halves -1.5%/y / 1.9%/y
- SLV: -11.7%/y · Sharpe -3.21 · 2693 trades · bootstrap 0% · halves -13.7%/y / -10.0%/y
- AAPL: -5.9%/y · Sharpe -0.81 · 2715 trades · bootstrap 1% · halves -3.8%/y / -7.6%/y
- MSFT: -2.6%/y · Sharpe -0.36 · 2711 trades · bootstrap 14% · halves -0.1%/y / -4.7%/y
- NVDA: -1.8%/y · Sharpe -0.18 · 2715 trades · bootstrap 28% · halves 4.1%/y / -6.8%/y
- AMZN: -1.4%/y · Sharpe -0.21 · 2718 trades · bootstrap 24% · halves 4.8%/y / -6.8%/y
- GOOGL: -3.8%/y · Sharpe -0.56 · 2711 trades · bootstrap 4% · halves -3.7%/y / -3.9%/y
- META: -3.3%/y · Sharpe -0.45 · 2719 trades · bootstrap 6% · halves -3.0%/y / -3.5%/y
- TSLA: 4.2%/y · Sharpe 0.42 · 2715 trades · bootstrap 90% · halves 2.6%/y / 5.6%/y
- AMD: -3.6%/y · Sharpe -0.35 · 2706 trades · bootstrap 14% · halves -1.0%/y / -5.7%/y
- INTC: -8.7%/y · Sharpe -0.92 · 2703 trades · bootstrap 1% · halves -7.2%/y / -10.0%/y
- BA: 0.1%/y · Sharpe 0.02 · 2702 trades · bootstrap 52% · halves 4.4%/y / -3.6%/y
- XOM: -3.6%/y · Sharpe -0.58 · 2695 trades · bootstrap 4% · halves -2.0%/y / -5.0%/y
- PFE: -6.0%/y · Sharpe -1.10 · 2676 trades · bootstrap 0% · halves -8.6%/y / -3.8%/y

## DT7

Original: SPY, QQQ. New instruments together: 14.6%/y, Sharpe 1.06, bootstrap 100%, 2016–2020 19.3%/y, 2021–2026 10.6%/y; positive on 14 of 16. **Holds.**

- SPY (original): 7.6%/y · Sharpe 0.66 · 2722 trades · bootstrap 99% · halves 8.3%/y / 7.0%/y
- QQQ (original): 10.8%/y · Sharpe 0.79 · 2719 trades · bootstrap 100% · halves 13.2%/y / 8.7%/y
- DIA: 6.4%/y · Sharpe 0.57 · 2722 trades · bootstrap 97% · halves 9.9%/y / 3.4%/y
- IWM: 11.8%/y · Sharpe 0.83 · 2722 trades · bootstrap 100% · halves 13.4%/y / 10.4%/y
- GLD: 12.4%/y · Sharpe 0.99 · 2722 trades · bootstrap 100% · halves 11.8%/y / 12.9%/y
- SLV: 10.3%/y · Sharpe 0.42 · 2722 trades · bootstrap 92% · halves 8.7%/y / 11.7%/y
- AAPL: 0.1%/y · Sharpe 0.00 · 2718 trades · bootstrap 51% · halves 10.6%/y / -9.0%/y
- MSFT: 14.5%/y · Sharpe 0.83 · 2719 trades · bootstrap 100% · halves 20.1%/y / 9.7%/y
- NVDA: 44.9%/y · Sharpe 1.50 · 2717 trades · bootstrap 100% · halves 47.7%/y / 42.5%/y · **survives Holm**
- AMZN: 24.9%/y · Sharpe 1.11 · 2718 trades · bootstrap 100% · halves 39.5%/y / 12.3%/y · **survives Holm**
- GOOGL: 8.0%/y · Sharpe 0.41 · 2718 trades · bootstrap 90% · halves 12.6%/y / 4.1%/y
- META: 10.9%/y · Sharpe 0.39 · 2719 trades · bootstrap 91% · halves 11.3%/y / 10.6%/y
- TSLA: 34.8%/y · Sharpe 0.98 · 2717 trades · bootstrap 100% · halves 51.2%/y / 20.7%/y
- AMD: 38.5%/y · Sharpe 1.09 · 2719 trades · bootstrap 100% · halves 47.0%/y / 31.2%/y · **survives Holm**
- INTC: -1.0%/y · Sharpe -0.03 · 2719 trades · bootstrap 46% · halves -8.9%/y / 5.9%/y
- BA: 16.4%/y · Sharpe 0.65 · 2708 trades · bootstrap 98% · halves 27.5%/y / 6.9%/y
- XOM: 4.2%/y · Sharpe 0.23 · 2703 trades · bootstrap 79% · halves 1.5%/y / 6.6%/y
- PFE: -3.1%/y · Sharpe -0.22 · 2696 trades · bootstrap 25% · halves 4.5%/y / -9.7%/y

## DT8

Original: SPY, QQQ. New instruments together: 4.4%/y, Sharpe 0.81, bootstrap 100%, 2016–2020 4.0%/y, 2021–2026 4.7%/y; positive on 12 of 16. **Holds.**

- SPY (original): 4.2%/y · Sharpe 0.70 · 290 trades · bootstrap 99% · halves 1.1%/y / 6.9%/y
- QQQ (original): 5.3%/y · Sharpe 0.68 · 309 trades · bootstrap 100% · halves 2.6%/y / 7.7%/y
- DIA: 3.2%/y · Sharpe 0.54 · 323 trades · bootstrap 97% · halves 0.6%/y / 5.5%/y
- IWM: 1.1%/y · Sharpe 0.15 · 290 trades · bootstrap 72% · halves -1.1%/y / 3.0%/y
- GLD: 1.8%/y · Sharpe 0.30 · 274 trades · bootstrap 85% · halves 1.0%/y / 2.5%/y
- SLV: -1.3%/y · Sharpe -0.12 · 225 trades · bootstrap 32% · halves -1.6%/y / -1.0%/y
- AAPL: 7.3%/y · Sharpe 0.63 · 371 trades · bootstrap 100% · halves 8.5%/y / 6.3%/y
- MSFT: 7.4%/y · Sharpe 0.70 · 249 trades · bootstrap 100% · halves 10.8%/y / 4.5%/y
- NVDA: 16.4%/y · Sharpe 0.81 · 321 trades · bootstrap 100% · halves 12.6%/y / 19.7%/y
- AMZN: 5.8%/y · Sharpe 0.54 · 299 trades · bootstrap 97% · halves 6.7%/y / 5.0%/y
- GOOGL: 6.0%/y · Sharpe 0.63 · 313 trades · bootstrap 98% · halves 3.5%/y / 8.1%/y
- META: 5.6%/y · Sharpe 0.48 · 280 trades · bootstrap 95% · halves 6.8%/y / 4.5%/y
- TSLA: 4.0%/y · Sharpe 0.16 · 268 trades · bootstrap 73% · halves 5.7%/y / 2.5%/y
- AMD: 15.8%/y · Sharpe 0.76 · 305 trades · bootstrap 100% · halves 12.8%/y / 18.3%/y
- INTC: -1.2%/y · Sharpe -0.09 · 264 trades · bootstrap 40% · halves -2.4%/y / -0.1%/y
- BA: -2.9%/y · Sharpe -0.24 · 291 trades · bootstrap 23% · halves -0.6%/y / -4.8%/y
- XOM: 2.2%/y · Sharpe 0.26 · 245 trades · bootstrap 83% · halves 0.7%/y / 3.4%/y
- PFE: -1.5%/y · Sharpe -0.24 · 275 trades · bootstrap 19% · halves -0.6%/y / -2.3%/y

## N1

Original: SPY, QQQ. New instruments together: -0.5%/y, Sharpe -0.12, bootstrap 34%, 2016–2020 1.5%/y, 2021–2026 -2.2%/y; positive on 7 of 16. **Does not hold.**

- SPY (original): 0.8%/y · Sharpe 0.17 · 2719 trades · bootstrap 72% · halves 3.3%/y / -1.3%/y
- QQQ (original): 1.6%/y · Sharpe 0.28 · 2716 trades · bootstrap 83% · halves 3.8%/y / -0.4%/y
- DIA: 0.3%/y · Sharpe 0.07 · 2718 trades · bootstrap 58% · halves 2.7%/y / -1.7%/y
- IWM: -0.0%/y · Sharpe -0.00 · 2719 trades · bootstrap 48% · halves 2.1%/y / -1.9%/y
- GLD: 0.8%/y · Sharpe 0.39 · 2718 trades · bootstrap 91% · halves -1.0%/y / 2.3%/y
- SLV: -11.5%/y · Sharpe -3.14 · 2702 trades · bootstrap 0% · halves -13.4%/y / -9.8%/y
- AAPL: -1.5%/y · Sharpe -0.20 · 2714 trades · bootstrap 25% · halves 4.0%/y / -6.1%/y
- MSFT: -1.2%/y · Sharpe -0.16 · 2717 trades · bootstrap 30% · halves 2.6%/y / -4.4%/y
- NVDA: 6.5%/y · Sharpe 0.67 · 2715 trades · bootstrap 99% · halves 9.6%/y / 3.8%/y
- AMZN: 1.5%/y · Sharpe 0.23 · 2717 trades · bootstrap 77% · halves 6.6%/y / -2.8%/y
- GOOGL: -2.7%/y · Sharpe -0.40 · 2711 trades · bootstrap 10% · halves -2.8%/y / -2.7%/y
- META: 2.1%/y · Sharpe 0.29 · 2716 trades · bootstrap 81% · halves -0.6%/y / 4.4%/y
- TSLA: 10.9%/y · Sharpe 1.10 · 2716 trades · bootstrap 100% · halves 14.4%/y / 8.0%/y · **survives Holm**
- AMD: -5.0%/y · Sharpe -0.50 · 2705 trades · bootstrap 7% · halves -1.1%/y / -8.4%/y
- INTC: -2.6%/y · Sharpe -0.27 · 2712 trades · bootstrap 20% · halves 0.2%/y / -5.0%/y
- BA: 4.4%/y · Sharpe 0.61 · 2711 trades · bootstrap 98% · halves 8.2%/y / 1.0%/y
- XOM: -3.1%/y · Sharpe -0.50 · 2711 trades · bootstrap 5% · halves 3.0%/y / -8.4%/y
- PFE: -5.8%/y · Sharpe -1.06 · 2699 trades · bootstrap 0% · halves -9.4%/y / -2.8%/y

## FFCC

Original: SPY, QQQ. New instruments together: -0.022R, bootstrap 0%, 2016–2020 -0.036R, 2021–2026 -0.011R; positive on 2 of 16. **Does not hold.**

- SPY (original): -0.026R · 4152 trades · bootstrap 7% · halves -0.030R / -0.024R
- QQQ (original): -0.018R · 3774 trades · bootstrap 15% · halves -0.045R / +0.004R
- DIA: -0.022R · 3816 trades · bootstrap 11% · halves -0.042R / -0.006R
- IWM: -0.024R · 3707 trades · bootstrap 9% · halves -0.035R / -0.014R
- GLD: -0.004R · 3643 trades · bootstrap 39% · halves +0.004R / -0.012R
- SLV: -0.143R · 3245 trades · bootstrap 0% · halves -0.209R / -0.087R
- AAPL: -0.003R · 3245 trades · bootstrap 45% · halves +0.009R / -0.012R
- MSFT: -0.005R · 3299 trades · bootstrap 38% · halves -0.011R / -0.001R
- NVDA: -0.028R · 3088 trades · bootstrap 7% · halves -0.025R / -0.030R
- AMZN: -0.001R · 3162 trades · bootstrap 49% · halves -0.021R / +0.016R
- GOOGL: -0.016R · 3281 trades · bootstrap 22% · halves -0.015R / -0.017R
- META: +0.017R · 3220 trades · bootstrap 81% · halves +0.026R / +0.010R
- TSLA: +0.011R · 2985 trades · bootstrap 74% · halves +0.029R / -0.003R
- AMD: -0.006R · 2854 trades · bootstrap 38% · halves -0.072R / +0.044R
- INTC: -0.032R · 3180 trades · bootstrap 5% · halves -0.062R / -0.006R
- BA: -0.001R · 3227 trades · bootstrap 48% · halves -0.023R / +0.019R
- XOM: -0.014R · 3389 trades · bootstrap 23% · halves -0.035R / +0.005R
- PFE: -0.085R · 3269 trades · bootstrap 0% · halves -0.094R / -0.076R

## Range A

Original: QQQ. New instruments together: -0.106R, bootstrap 0%, 2016–2020 -0.142R, 2021–2026 -0.075R; positive on 0 of 17. **Does not hold.**

- SPY: -0.050R · 2708 trades · bootstrap 0% · halves -0.058R / -0.043R
- QQQ (original): -0.044R · 2694 trades · bootstrap 1% · halves -0.066R / -0.025R
- DIA: -0.080R · 2690 trades · bootstrap 0% · halves -0.088R / -0.074R
- IWM: -0.072R · 2679 trades · bootstrap 0% · halves -0.079R / -0.066R
- GLD: -0.162R · 2668 trades · bootstrap 0% · halves -0.225R / -0.108R
- SLV: -0.350R · 2623 trades · bootstrap 0% · halves -0.499R / -0.221R
- AAPL: -0.051R · 2545 trades · bootstrap 0% · halves -0.072R / -0.034R
- MSFT: -0.048R · 2556 trades · bootstrap 0% · halves -0.055R / -0.042R
- NVDA: -0.090R · 2565 trades · bootstrap 0% · halves -0.105R / -0.077R
- AMZN: -0.108R · 2569 trades · bootstrap 0% · halves -0.124R / -0.095R
- GOOGL: -0.060R · 2548 trades · bootstrap 0% · halves -0.081R / -0.042R
- META: -0.077R · 2557 trades · bootstrap 0% · halves -0.125R / -0.036R
- TSLA: -0.107R · 2573 trades · bootstrap 0% · halves -0.147R / -0.075R
- AMD: -0.145R · 2490 trades · bootstrap 0% · halves -0.260R / -0.050R
- INTC: -0.107R · 2557 trades · bootstrap 0% · halves -0.101R / -0.113R
- BA: -0.090R · 2541 trades · bootstrap 0% · halves -0.146R / -0.043R
- XOM: -0.082R · 2572 trades · bootstrap 0% · halves -0.119R / -0.050R
- PFE: -0.126R · 2476 trades · bootstrap 0% · halves -0.139R / -0.114R

## Range B

Original: QQQ. New instruments together: -0.066R, bootstrap 0%, 2016–2020 -0.088R, 2021–2026 -0.047R; positive on 0 of 17. **Does not hold.**

- SPY: -0.038R · 2708 trades · bootstrap 0% · halves -0.050R / -0.029R
- QQQ (original): -0.043R · 2694 trades · bootstrap 0% · halves -0.051R / -0.036R
- DIA: -0.053R · 2690 trades · bootstrap 0% · halves -0.056R / -0.050R
- IWM: -0.048R · 2679 trades · bootstrap 0% · halves -0.051R / -0.046R
- GLD: -0.119R · 2668 trades · bootstrap 0% · halves -0.161R / -0.083R
- SLV: -0.232R · 2623 trades · bootstrap 0% · halves -0.316R / -0.159R
- AAPL: -0.035R · 2545 trades · bootstrap 0% · halves -0.027R / -0.041R
- MSFT: -0.031R · 2556 trades · bootstrap 1% · halves -0.052R / -0.014R
- NVDA: -0.049R · 2565 trades · bootstrap 0% · halves -0.063R / -0.038R
- AMZN: -0.069R · 2569 trades · bootstrap 0% · halves -0.076R / -0.063R
- GOOGL: -0.029R · 2548 trades · bootstrap 0% · halves -0.051R / -0.010R
- META: -0.030R · 2557 trades · bootstrap 0% · halves -0.070R / +0.004R
- TSLA: -0.061R · 2573 trades · bootstrap 0% · halves -0.081R / -0.044R
- AMD: -0.080R · 2490 trades · bootstrap 0% · halves -0.148R / -0.024R
- INTC: -0.064R · 2557 trades · bootstrap 0% · halves -0.053R / -0.074R
- BA: -0.053R · 2541 trades · bootstrap 0% · halves -0.086R / -0.025R
- XOM: -0.049R · 2572 trades · bootstrap 0% · halves -0.059R / -0.040R
- PFE: -0.078R · 2476 trades · bootstrap 0% · halves -0.092R / -0.066R

## Silvio

Original: QQQ, DIA. New instruments together: -0.015R, bootstrap 33%, 2016–2020 +0.008R, 2021–2026 -0.033R; positive on 5 of 16. **Does not hold.**

- SPY: +0.154R · 72 trades · bootstrap 89% · halves +0.315R / +0.046R
- QQQ (original): -0.152R · 78 trades · bootstrap 6% · halves -0.161R / -0.146R
- DIA (original): +0.003R · 75 trades · bootstrap 51% · halves +0.045R / -0.022R
- IWM: -0.068R · 60 trades · bootstrap 25% · halves +0.124R / -0.302R
- GLD: +0.128R · 30 trades · bootstrap 70% · halves +0.323R / -0.165R
- SLV: -0.133R · 28 trades · bootstrap 21% · halves -0.591R / +0.019R
- AAPL: -0.007R · 61 trades · bootstrap 47% · halves -0.126R / +0.064R
- MSFT: -0.066R · 62 trades · bootstrap 26% · halves -0.306R / +0.056R
- NVDA: -0.045R · 60 trades · bootstrap 34% · halves +0.147R / -0.173R
- AMZN: +0.227R · 54 trades · bootstrap 96% · halves -0.020R / +0.372R
- GOOGL: +0.051R · 55 trades · bootstrap 68% · halves -0.051R / +0.156R
- META: -0.066R · 46 trades · bootstrap 28% · halves +0.035R / -0.222R
- TSLA: -0.071R · 40 trades · bootstrap 33% · halves -0.156R / -0.020R
- AMD: -0.000R · 53 trades · bootstrap 50% · halves +0.000R / -0.001R
- INTC: -0.235R · 54 trades · bootstrap 2% · halves -0.026R / -0.379R
- BA: +0.227R · 45 trades · bootstrap 93% · halves +0.134R / +0.301R
- XOM: -0.229R · 54 trades · bootstrap 1% · halves -0.276R / -0.185R
- PFE: -0.115R · 61 trades · bootstrap 15% · halves +0.085R / -0.254R

## Fib

Original: QQQ, GLD. New instruments together: +0.010R, bootstrap 58%, 2016–2020 +0.026R, 2021–2026 -0.004R; positive on 7 of 16. **Does not hold.**

- SPY: -0.152R · 50 trades · bootstrap 13% · halves -0.175R / -0.139R
- QQQ (original): -0.124R · 68 trades · bootstrap 14% · halves -0.034R / -0.172R
- DIA: -0.236R · 54 trades · bootstrap 6% · halves -0.557R / +0.165R
- IWM: -0.031R · 62 trades · bootstrap 39% · halves +0.172R / -0.198R
- GLD (original): +0.015R · 77 trades · bootstrap 54% · halves -0.075R / +0.098R
- SLV: -0.357R · 59 trades · bootstrap 1% · halves -0.368R / -0.349R
- AAPL: -0.151R · 56 trades · bootstrap 17% · halves -0.016R / -0.238R
- MSFT: -0.141R · 56 trades · bootstrap 11% · halves -0.326R / +0.020R
- NVDA: +0.250R · 62 trades · bootstrap 90% · halves +0.319R / +0.201R
- AMZN: +0.170R · 65 trades · bootstrap 86% · halves -0.049R / +0.308R
- GOOGL: +0.050R · 64 trades · bootstrap 62% · halves +0.423R / -0.240R
- META: +0.204R · 64 trades · bootstrap 90% · halves +0.415R / +0.051R
- TSLA: -0.051R · 79 trades · bootstrap 34% · halves -0.051R / -0.050R
- AMD: -0.096R · 75 trades · bootstrap 19% · halves -0.061R / -0.133R
- INTC: +0.300R · 63 trades · bootstrap 96% · halves -0.021R / +0.540R
- BA: +0.191R · 69 trades · bootstrap 86% · halves +0.163R / +0.228R
- XOM: +0.168R · 61 trades · bootstrap 92% · halves +0.339R / -0.034R
- PFE: -0.069R · 64 trades · bootstrap 26% · halves +0.098R / -0.192R

## First candle

Original: SPY, QQQ, IWM, GLD. New instruments together: -0.126R, bootstrap 0%, 2016–2020 -0.167R, 2021–2026 -0.089R; positive on 5 of 14. **Does not hold.**

- SPY (original): -0.003R · 1831 trades · bootstrap 48% · halves -0.069R / +0.056R
- QQQ (original): +0.019R · 1754 trades · bootstrap 68% · halves +0.018R / +0.019R
- DIA: -0.018R · 1661 trades · bootstrap 32% · halves -0.037R / -0.001R
- IWM (original): -0.010R · 1747 trades · bootstrap 41% · halves -0.081R / +0.058R
- GLD (original): -0.120R · 1896 trades · bootstrap 0% · halves -0.220R / -0.030R
- SLV: -0.789R · 1790 trades · bootstrap 0% · halves -1.203R / -0.442R
- AAPL: -0.075R · 1553 trades · bootstrap 3% · halves -0.072R / -0.078R
- MSFT: +0.004R · 1582 trades · bootstrap 55% · halves +0.003R / +0.006R
- NVDA: +0.014R · 1481 trades · bootstrap 60% · halves +0.077R / -0.038R
- AMZN: +0.085R · 1461 trades · bootstrap 96% · halves +0.176R / +0.016R
- GOOGL: +0.064R · 1388 trades · bootstrap 91% · halves +0.153R / -0.004R
- META: -0.100R · 1500 trades · bootstrap 1% · halves -0.096R / -0.103R
- TSLA: +0.018R · 1457 trades · bootstrap 67% · halves -0.021R / +0.050R
- AMD: -0.217R · 1540 trades · bootstrap 0% · halves -0.406R / -0.044R
- INTC: -0.170R · 1593 trades · bootstrap 0% · halves -0.215R / -0.131R
- BA: -0.027R · 1414 trades · bootstrap 26% · halves +0.084R / -0.123R
- XOM: -0.148R · 1626 trades · bootstrap 0% · halves -0.230R / -0.074R
- PFE: -0.247R · 1581 trades · bootstrap 0% · halves -0.281R / -0.217R

## Verdict

- **DT1**: YES, holds on other markets — new instruments together 3.0%/y (bootstrap 98%; 2016–2020 3.6%/y, 2021–2026 2.4%/y); positive on 11 of 16
- **DT2**: NO — new instruments together -32.1%/y (bootstrap 0%; 2016–2020 -48.3%/y, 2021–2026 -18.2%/y); positive on 4 of 17
- **DT3**: NO — new instruments together 5.0%/y (bootstrap 96%; 2016–2020 6.1%/y, 2021–2026 4.1%/y); positive on 10 of 17
- **DT3-bot**: NO — new instruments together 2.0%/y (bootstrap 90%; 2016–2020 1.0%/y, 2021–2026 2.8%/y); positive on 12 of 17
- **DT4**: NO — new instruments together -3.2%/y (bootstrap 1%; 2016–2020 -1.7%/y, 2021–2026 -4.5%/y); positive on 3 of 17
- **DT7**: YES, holds on other markets — new instruments together 14.6%/y (bootstrap 100%; 2016–2020 19.3%/y, 2021–2026 10.6%/y); positive on 14 of 16
- **DT8**: YES, holds on other markets — new instruments together 4.4%/y (bootstrap 100%; 2016–2020 4.0%/y, 2021–2026 4.7%/y); positive on 12 of 16
- **N1**: NO — new instruments together -0.5%/y (bootstrap 34%; 2016–2020 1.5%/y, 2021–2026 -2.2%/y); positive on 7 of 16
- **FFCC**: NO — new instruments together -0.022R (bootstrap 0%; 2016–2020 -0.036R, 2021–2026 -0.011R); positive on 2 of 16
- **Range A**: NO — new instruments together -0.106R (bootstrap 0%; 2016–2020 -0.142R, 2021–2026 -0.075R); positive on 0 of 17
- **Range B**: NO — new instruments together -0.066R (bootstrap 0%; 2016–2020 -0.088R, 2021–2026 -0.047R); positive on 0 of 17
- **Silvio**: NO — new instruments together -0.015R (bootstrap 33%; 2016–2020 +0.008R, 2021–2026 -0.033R); positive on 5 of 16
- **Fib**: NO — new instruments together +0.010R (bootstrap 58%; 2016–2020 +0.026R, 2021–2026 -0.004R); positive on 7 of 16
- **First candle**: NO — new instruments together -0.126R (bootstrap 0%; 2016–2020 -0.167R, 2021–2026 -0.089R); positive on 5 of 14

Single results that survive the Holm correction and are positive in both halves:
- DT1 on SPY (original): 10.6%/y
- DT1 on QQQ (original): 18.6%/y
- DT1 on NVDA: 13.0%/y
- DT1 on AMZN: 11.5%/y
- DT1 on TSLA: 21.3%/y
- DT2 on NVDA: 41.6%/y
- DT2 on TSLA: 75.5%/y
- DT3 on AMZN: 35.5%/y
- DT3 on TSLA: 33.9%/y
- DT3-bot on TSLA: 16.9%/y
- DT7 on NVDA: 44.9%/y
- DT7 on AMZN: 24.9%/y
- DT7 on AMD: 38.5%/y
- N1 on TSLA: 10.9%/y

## Data notes

- SPY: 2723 sessions 2016-01-04..2026-10-30; split days: none
- QQQ: 2721 sessions 2016-01-04..2026-10-30; split days: none
- DIA: 2723 sessions 2016-01-04..2026-10-30; split days: none
- IWM: 2723 sessions 2016-01-04..2026-10-30; split days: none
- GLD: 2723 sessions 2016-01-04..2026-10-30; split days: none
- SLV: 2723 sessions 2016-01-04..2026-10-30; split days: none
- AAPL: 2721 sessions 2016-01-04..2026-10-30; split days: 2020-08-31
- MSFT: 2721 sessions 2016-01-04..2026-10-30; split days: none
- NVDA: 2721 sessions 2016-01-04..2026-10-30; split days: 2021-07-20, 2024-06-10
- AMZN: 2721 sessions 2016-01-04..2026-10-30; split days: 2022-06-06
- GOOGL: 2721 sessions 2016-01-04..2026-10-30; split days: 2022-07-18
- META: 2721 sessions 2016-01-04..2026-10-30; split days: none
- TSLA: 2721 sessions 2016-01-04..2026-10-30; split days: 2020-08-31, 2022-08-25
- AMD: 2721 sessions 2016-01-04..2026-10-30; split days: none
- INTC: 2721 sessions 2016-01-04..2026-10-30; split days: none
- BA: 2719 sessions 2016-01-04..2026-10-30; split days: none
- XOM: 2719 sessions 2016-01-04..2026-10-30; split days: none
- PFE: 2719 sessions 2016-01-04..2026-10-30; split days: none

## Checks of the harness
The same code reproduces the earlier single-instrument results: DT3 QQQ Sharpe 0.82 (earlier 0.82), DT8 SPY 4.2%/y,
Sharpe 0.70 (earlier 4.2%, 0.70), DT7 SPY Sharpe 0.66 (earlier 0.67), FFCC SPY -0.026R (earlier -0.025R), Silvio QQQ
-0.152R (earlier -0.157R), range bot A QQQ -0.044R (earlier -0.046R). Small differences = one more month of data.

## Caveats
- The 18 instruments include the decade's biggest winners (NVDA, TSLA, AMD, AMZN), chosen with hindsight. That flatters
  every long-biased or trend-following idea (DT7, DT8, DT1, DT3). Single-stock leads need a fresh test on stocks picked
  without hindsight before they mean anything.
- DT2 is very cost-sensitive: cheap stocks (INTC, PFE, XOM) pay far more per trade in % than NVDA or TSLA.
- 23.11.2026: for per-trade (R) strategies the bootstrap now counts each day with the sum of its trades
  (bootstrapTotal). Before, it averaged within each day first, which could show ~100% for a negative mean (FFCC GLD
  -0.004R). No verdict changed; Fib's pooled bootstrap moved 39%→58%, Silvio's 38%→33%.
