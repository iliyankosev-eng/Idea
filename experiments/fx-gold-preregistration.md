# Pre-registration: every earlier strategy on gold and the dollar (23.11.2026)

Iliyan: most of these strategies are used by people on gold (XAUUSD) or on dollar pairs. Same 14 strategies and
main versions as experiments/cross-instrument-preregistration.md. Written before running and before the data exists.

## Data
Dukascopy 1-minute BID candles with the ASK close and tick volume (fxdata branch, scripts/dukascopy-fetch.py):
XAUUSD, EURUSD, GBPUSD, USDJPY, 2016-01 .. 2026-11 (whatever years download completely; reported).
Second gold source if XAUUSD fails: Binance PAXGUSDT (2020-09 onwards, cost 0.05% per side).

## Sessions
- New York: 09:30-16:00 New York time (the same clock as the stock tests).
- London: 08:00-14:30 London time (the first 6.5 hours, where London-open setups live).
Each session is fed to the strategies as a "day"; DT7 (overnight) = from one session's close to the next session's
open of the same kind. Weekend/holiday gaps are normal sessions in a row. DT8 uses the New York session closes.

## Costs
Per side: half the median spread (ASK close - BID close) of that symbol's New York-session minutes over the whole
period, plus 0.001% of the price for slippage. Round trip = one full median spread + 0.002%.

## Measures and verdict
As in the cross-instrument test: per (strategy, symbol, session) one test, Holm correction over all of them.
Per strategy, all gold/FX tests together (daily-return strategies: equal-weight average per day; R strategies: all
trades): "works on gold/FX" only if pooled mean > 0 with bootstrap >= 95%, positive in 2016-2020 and 2021-2026,
and positive in at least 2/3 of the symbol-session pairs. Gold alone is reported separately (XAUUSD NY + London);
for gold alone the same rule with "both sessions positive" instead of 2/3.
