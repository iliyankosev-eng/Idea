# Pre-registration: FFCC "Failed Auction Model" (23.11.2026)

Source: "The Failed Auction Model · FFCC Free Strategy Guide" (financialfreedomcountryclub.com/playbook/guide, PDF
sent by Iliyan). Claim: a repeatable reversal model at the value-area edges, "ideal for prop firms", "$10K+ per month
in payouts". Written BEFORE running on data.

## Data and session
QQQ and SPY one-minute SIP bars (Alpaca), 2016-01 .. 2026-11, regular New York session (09:30-16:00), full sessions
only. The guide's New York profile is anchored at the NYSE open, so this is the New York version. The Asia (Globex)
session needs futures data, which we do not have: not tested.

## Volume profile (developing, anchored at 09:30)
- Each one-minute bar's volume is spread evenly over its [low, high] range in $0.01 rows (the guide's 1,000 rows over
  a session range of $5-15 gives rows of about $0.005-0.015).
- POC = the row with the most volume (lowest price on a tie). Value area (70%): start at the POC row, then repeatedly
  add the neighbouring row (above or below) with more volume (above on a tie) until >= 70% of the volume is inside.
  VAH / VAL = top / bottom of the value area.
- At every candle the levels are those of the profile built from 09:30 up to the end of the PREVIOUS candle.

## Candles and rules (5-minute candles; 1- and 15-minute candles as a robustness check)
Signals from 10:00 (first 30 minutes build the profile) until 15:00; every open trade is closed at 15:55.
Short (mirror image for longs at the VAL):
1. Push: a candle's high goes above the VAH -> the auction "extreme" = highest high since the push began.
2. Failed auction: a later candle does NOT make a new high above the extreme (it "fails to keep going").
3. Displacement, within 6 candles of the push: a red candle (close < open) whose body >= 1.5 x the average body of the
   previous 20 candles, that closes below the low of the candle before it and below the VAH.
   A new high above the extreme before the displacement restarts the setup at step 1.
4. Entry at the displacement candle's close. Stop = the extreme + $0.01 ("stop above the extreme").
   Target = entry - 1.5 x risk (main). Variants: target = POC (skip if the POC is not below the entry);
   stop = entry + the displacement candle's range ("static stop based on the size of the displacement candle").
5. Inside a candle the stop is checked before the target (conservative). One trade at a time per symbol; after an
   exit the next setup needs a new push.
- Cost: COST_PER_SHARE ($0.0045) per share and side, as in every other intraday test. Result per trade in R.

## Controls and verdict
- Random direction: same entries, stops and targets mirrored to the other side (100 repeats, coin flip per trade).
- Bootstrap (10,000) of the mean R per trade.
- GO only if ALL hold for the main version: mean R > 0 on QQQ and on SPY with the bootstrap 95% interval above 0
  (pooled); better than the random direction in >= 95 of 100 repeats; mean R > 0 in 2016-2020 and in 2021-2026.
  Otherwise STOP. Variants and 1/15-minute candles are reported, they cannot turn a STOP into a GO.

## Amendment (23.11.2026, before any run on data)
"Average body of the previous 20 candles" would block every signal before 11:10 on 5-minute candles (and before 14:30 on
15-minute ones). Read as: the average over up to the previous 20 candles of the session, with at least 6.
On 15-minute candles there is no candle starting at 15:55; trades still open then exit at the session's last close.
