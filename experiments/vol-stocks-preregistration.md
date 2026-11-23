# Pre-registration: intraday momentum on volatile stocks picked WITHOUT hindsight (23.11.2026)

Follow-up of reports/cross-instrument.md: DT1/DT3/DT7 looked strong on NVDA, TSLA, AMD, AMZN, but those were chosen
because we know they went up. Here the stocks are chosen by a rule that uses only the previous year. Written before
running; the picks were computed before any minute data was downloaded.

## Picks (scripts/research/vol-picks.ts -> scripts/vol-picks.json)
For each year Y = 2017 .. 2026: from the `universe` daily data (all NYSE/NASDAQ/AMEX stocks incl. delisted, ETF-like
names removed), stocks with >= 200 daily bars in Y-1 and a 50-day average dollar volume >= $100M at the end of Y-1;
the 20 with the highest average daily range (high/low - 1) in Y-1. (2016 cannot be picked: the data starts in 2016.)
The stock is traded only during year Y. Ticker reuse can mix two companies; accepted and reported.

## Data
Alpaca SIP 1-minute bars, raw prices, regular session, from December of Y-1 (warm-up) to the end of Y.
Every strategy runs on split-free pieces (src/intraday/splits.ts) — the split check uses the `universe` daily data.

## Strategies (main versions, cost $0.0045 per share and side; sensitivity $0.01)
Primary: DT1 noise band (bot version: dynamic size, cap 2x, exit 15:55) and DT3-bot (opening range 5 min, entry 09:50,
cap 2x, FOMC days skipped). Secondary: DT3 (published version) and DT7 (overnight).

## Portfolio and measures
Each day, the average of the daily returns of that year's picks that have a session (equal weight). Annual return,
Sharpe, max drawdown, block bootstrap P(mean > 0); 2017-2020 and 2021-2026; every year separately.
Context: the same picks held from close to close (buy and hold, equal weight).

## Verdict (per strategy)
Candidate for a paper test only if ALL hold at $0.0045: Sharpe >= 0.5; bootstrap >= 95%; positive in both periods;
positive in at least 6 of the 10 years; still positive at $0.01 per share. Otherwise STOP.
