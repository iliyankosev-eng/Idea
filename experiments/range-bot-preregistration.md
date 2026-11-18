# Pre-registration: "sniper range bot" claim check (18.11.2026)

Claim (Instagram ad, rules not published): a TradingView range bot, 3 months, +$26K on a 50K eval, 75% win rate,
141 trades, $300 expectancy per trade, Monte Carlo says 94% chance to pass a 50K eval.

The bot's rules are secret, so this test checks the METHOD (3-month backtest + Monte Carlo of the same trades),
on a generic range strategy with real data. Written before running.

Strategy (QQQ minute bars 2016-01..2026-09, proxy for NQ):
- opening range = 09:30-10:00 high H, low L, width W = H - L
- 10:00-15:00: the first minute that trades through H (high >= H + 0.01) -> short at H; through L -> long at L.
  One trade per day. If both are crossed in the same minute: no trade.
- variant A: target 0.5 W toward the middle, stop 0.5 W beyond the range (1:1)
- variant B ("high win rate"): target 0.25 W, stop 0.75 W
- stop is checked before the target inside a minute (conservative); the entry minute can already stop out; exit 15:55 at the close
- cost: COST_PER_SHARE each way (same as all other tests)
- result per trade in R (1R = entry-to-stop distance)

Prop eval (Topstep 50K-like): risk $400 per trade, profit target +$3,000, trailing max loss $2,000 from the
highest balance, the floor stops rising at the start balance. No consistency rule.

Measures:
1. full period: trades, win rate, average R
2. every 63-trading-day window ("3 months"): sum R; the best window
3. Monte Carlo (10,000 bootstrap runs) of the best window's trades -> "pass chance"
4. what really happened next: the eval traded in order over the following 3 months
5. over all windows whose Monte Carlo pass chance >= 90%: the real pass rate of the next 3 months
Verdict rule: the method is trustworthy only if (5) is close to the Monte Carlo number (within 15 points).
