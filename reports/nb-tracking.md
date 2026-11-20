# Noise band: live bot vs backtest replay

Days: 2026-11-12, 2026-11-13, 2026-11-16, 2026-11-17, 2026-11-18, 2026-11-19, 2026-11-20 (SIP minute bars available up to 2026-11-18).

| Day | Checks | Same decision | Live trades | Live $ | Live % of NB capital | Backtest % (same rules, no costs) | Backtest – live |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-12 | 12 | 12/12 | 0 | 0 | 0.00% | 0.00% | 0.00 pts |
| 2026-11-13 | 12 | 12/12 | 1 | 106 | 0.41% | 0.39% | -0.02 pts |
| 2026-11-16 | 11 | 10/11 | 3 | -160 | -0.62% | -0.59% | 0.04 pts |
| 2026-11-17 | 12 | 12/12 | 3 | -203 | -0.79% | -0.64% | 0.15 pts |
| 2026-11-18 | 12 | 12/12 | 0 | 0 | 0.00% | 0.00% | 0.00 pts |
| 2026-11-19 | no minute data yet | | | | | | |
| 2026-11-20 | no minute data yet | | | | | | |

Total: live -1.01% of NB capital, backtest replay -0.84% (before costs).
Timing: the bot's decision price (QQQ last trade at HH:MM:00) vs the backtest's execution price (open of minute HH:MM), signed so that positive = worse for the bot: average -0.4 bp over 11 orders.

Notes (20.11.2026):
- 58 of 59 checks gave the same decision. The one difference (16.11 15:00): the bot saw QQQ at 664.08 at 15:00:02, 4 cents above the
  lower band 664.04; the minute bar closed at 663.99 (below). A tick-level coin flip, not a bug.
- 16.11 14:30: the bot's run started 45 minutes late (GitHub delay) and skipped that check.
- Live minus backtest over 12-18.11: -0.17 points of the noise-band capital, i.e. costs and timing are small. The losses of
  16-17.11 are what the rules themselves produce on those days ("whipsaw" days), not an execution problem.
- 19-20.11: minute bars are not on the data branch yet; rerun this script next week.
