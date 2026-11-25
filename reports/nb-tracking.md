# Noise band: live bot vs backtest replay

Days: 2026-11-12, 2026-11-13, 2026-11-16, 2026-11-17, 2026-11-18, 2026-11-19, 2026-11-20, 2026-11-23, 2026-11-24 (SIP minute bars available up to 2026-11-24).

| Day | Checks | Same decision | Live trades | Live $ | Live % of NB capital | Backtest % (same rules, no costs) | Backtest – live |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-12 | 12 | 12/12 | 0 | 0 | 0.00% | 0.00% | 0.00 pts |
| 2026-11-13 | 12 | 12/12 | 1 | 106 | 0.41% | 0.39% | -0.02 pts |
| 2026-11-16 | 11 | 10/11 | 3 | -160 | -0.62% | -0.59% | 0.04 pts |
| 2026-11-17 | 12 | 12/12 | 3 | -203 | -0.79% | -0.64% | 0.15 pts |
| 2026-11-18 | 12 | 12/12 | 0 | 0 | 0.00% | 0.00% | 0.00 pts |
| 2026-11-19 | 12 | 11/12 | 2 | 78 | 0.31% | 0.33% | 0.03 pts |
| 2026-11-20 | 12 | 12/12 | 1 | 797 | 3.19% | 2.91% | -0.28 pts |
| 2026-11-23 | 4 | 4/4 | 0 | 0 | 0.00% | 0.00% | 0.00 pts |
| 2026-11-24 | 11 | 11/11 | 0 | 0 | 0.00% | 0.00% | 0.00 pts |

Total: live 2.49% of NB capital, backtest replay 2.41% (before costs).
Timing: the bot's decision price (QQQ last trade at HH:MM:00) vs the backtest's execution price (open of minute HH:MM), signed so that positive = worse for the bot: average -0.1 bp over 13 orders.

Notes (20.11.2026):
- 58 of 59 checks gave the same decision. The one difference (16.11 15:00): the bot saw QQQ at 664.08 at 15:00:02, 4 cents above the
  lower band 664.04; the minute bar closed at 663.99 (below). A tick-level coin flip, not a bug.
- 16.11 14:30: the bot's run started 45 minutes late (GitHub delay) and skipped that check.
- Live minus backtest over 12-18.11: -0.17 points of the noise-band capital, i.e. costs and timing are small. The losses of
  16-17.11 are what the rules themselves produce on those days ("whipsaw" days), not an execution problem.

Notes (23.11.2026, rerun with 19-20.11):
- 19.11 13:00: the second coin-flip difference. The bot saw QQQ at 651.37, 10 cents under the lower band 651.47, and went
  short; the minute bar closed at 651.89 (above), so the replay stayed flat. Same kind as 16.11, not a bug.
- 20.11: live +$797 (+3.19% of NB capital) vs replay +2.91%; the bot's fills were slightly better than minute opens.
- 12-20.11 together: 72 of 74 checks identical; live +2.49% vs replay +2.41% of the NB capital, i.e. live is 0.08 points
  ahead. Execution and costs are not eating the strategy.
- 23.11: GitHub stopped starting runs from 10:28 to 13:58 New York time (the account's free Actions minutes ran out; the
  repository was made public at ~14:15). 8 noise-band checks were skipped; the checks that ran (10:00, 14:30, 15:00, 15:30)
  all said "no position". Rerun with 23.11 once its minute bars are on the data branch.

Notes (24.11.2026, rerun with 23.11):
- 23.11: the replay walks all 12 checks of the day, including the 8 that GitHub skipped, and stays flat all day (0.00%).
  So the outage did not cost a noise-band trade. The 4 checks that ran match 4/4.
- 24.11: the 15:00 check ran and decided "flat", but GitHub refused the log push (Internal Server Error), so that line
  is missing from botlog; issue #3 was opened by the alarm. Harmless.

Notes (25.11.2026, rerun with 24.11):
- 24.11: 11/11 checks identical (the 15:00 log line is missing, see above); flat all day, replay flat too.
- 12-24.11: 87 of 89 checks identical.
- 25.11: no bot run was created for the 11:00 check at all (cron-job.org -> GitHub dispatch, 15:58 UTC); the noise band
  stayed short from 10:30 to 11:30. GitHub also rejected that day's data-branch push once ("fatal error in
  commit_refs_rules"); the data job was re-run. Replay 25.11 when its minute bars arrive.
