# "Sniper range bot" method check (18.11.2026)

Pre-registration: experiments/range-bot-preregistration.md. Script: scripts/research/range-bot-check.ts.

```

=== A 1:1: 2672 trades on 2699 days, win rate 48.6%, average -0.046R, total -122.3R
best 3-month window from 2025-10-14: 63 trades, win rate 63.5%, 15.6R = $6249 at $400 risk, Monte Carlo pass 81.3%
  the next 3 months traded for real: FAIL, -5.6R
windows with Monte Carlo pass >= 90%: 0 of 123; average MC 0.0%; next 3 months for real: 0 pass, 0 fail, 0 undecided -> real pass rate 0.0%
all windows: real pass rate when starting the eval at a random month 18.7%

=== B high win rate: 2672 trades on 2699 days, win rate 71.7%, average -0.044R, total -116.6R
best 3-month window from 2018-03-06: 63 trades, win rate 82.5%, 6.3R = $2515 at $400 risk, Monte Carlo pass 90.8%
  the next 3 months traded for real: undecided, -4.9R
windows with Monte Carlo pass >= 90%: 1 of 123; average MC 92.0%; next 3 months for real: 0 pass, 0 fail, 1 undecided -> real pass rate 0.0%
all windows: real pass rate when starting the eval at a random month 0.8%
```
