# Pre-registration: every earlier strategy on 18 instruments (23.11.2026)

Question (Iliyan): do the strategies we tested on SPY/QQQ (and a few others) work on other instruments too?
Purpose: an out-of-sample check. A real edge should show up on similar markets; one that exists on a single
instrument is most likely luck. Written BEFORE running.

## Instruments and data
SPY, QQQ, DIA, IWM, GLD, SLV, AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, INTC, BA, XOM, PFE.
Alpaca SIP one-minute bars 2016-01 .. 2026-10 (raw prices), full regular sessions; daily bars (adjusted) for DT8.
Splits: a session whose close-to-close move differs from the adjusted daily move by more than 1.4x is a split day.
- every strategy runs on raw prices (so the $ cost per share stays realistic), separately on each split-free piece of
  history (a new piece starts on a split day); intraday-only strategies are not affected at all;
- DT8 runs on adjusted daily closes with cost 2 x $0.0045 / raw close per round trip.

## Strategies (each in its own pre-registered MAIN version, cost $0.0045 per share and side unless noted)
Daily-return strategies: DT1 noise band (bot version: dynamic size, cap 2x, exit 15:55, next-open execution),
DT2 VWAP, DT3 opening range 5 min (published), DT3-bot (entry 09:50, cap 2x), DT4 first half hour -> last half hour,
DT7 overnight, DT8 RSI(2), N1 last 30 minutes.
Per-trade (R) strategies: FFCC failed auction (5-min, 1.5R), range bot A (1:1) and B (high win rate),
Silvio supply/demand (v2, 2R, trend filter), Fib confluence (S/R + 0.618/0.786 + RSI, hourly bars, hold 14),
First candle rule (New York).
Not included: H4 (needs pre-market levels, only SPY/QQQ), FVG/BOS, H1/H2, DT6, Investclub, QuantLab — already run on
many instruments in their own tests; DT5 and the crypto/Polymarket/weather tests do not apply to these markets.

## Measures
- Daily-return strategies: annual return, Sharpe, block bootstrap P(mean > 0) (bootstrapByDay); per-trade
  strategies: mean R, bootstrap P(mean > 0). Both halves: 2016-2020 and 2021-2026-10.
- Each (strategy, instrument) is one test; p = 1 - P(mean > 0). Holm correction over ALL tests at 5%.
- Per strategy, the instruments NOT used in its original test are "new". Pooled over the new instruments
  (daily-return: equal-weight average across instruments per day; R: all trades together).

## Verdict per strategy ("holds on other markets")
YES only if ALL hold on the NEW instruments: pooled mean > 0 with bootstrap >= 95%; pooled mean > 0 in both halves;
mean > 0 on at least 2/3 of the new instruments. Otherwise NO. A single instrument counts as an edge only if it
survives the Holm correction AND is positive in both halves; even then it is reported as a lead to test further,
not as a strategy for the bot.

## Original instruments (everything else is "new")
DT1: SPY, QQQ · DT2: QQQ · DT3, DT3-bot: QQQ (DT3-bot skips FOMC days, as the bot does) · DT4: SPY · DT7, DT8, N1: SPY, QQQ ·
FFCC: SPY, QQQ · range bot: QQQ · Silvio: QQQ, DIA · Fib: QQQ, GLD · First candle: SPY, QQQ, IWM, GLD.
