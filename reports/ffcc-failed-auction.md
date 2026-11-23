# FFCC Failed Auction Model — test on QQQ and SPY (New York session, 2016-01 .. 2026-11)

Rules: experiments/ffcc-failed-auction-preregistration.md. Sessions: QQQ 2736, SPY 2738. Cost $0.0045000000000000005 per share and side.

| Version | Trades | Winners | Mean R | 2016–2020 | 2021–2026 | Sum R |
| --- | --- | --- | --- | --- | --- | --- |
| **Main: 5-min, stop above the extreme, 1.5R — QQQ** | 3792 | 43% | -0.016 | -0.045 | 0.007 | -62 |
| **Main — SPY** | 4173 | 42% | -0.025 | -0.030 | -0.021 | -105 |
| **Main — both** | 7965 | 43% | -0.021 | -0.037 | -0.008 | -168 |
| Target = POC — both | 5011 | 65% | -0.023 | -0.051 | 0.002 | -114 |
| Stop = displacement candle range — both | 9700 | 41% | -0.030 | -0.038 | -0.022 | -286 |
| 1-minute candles — both | 21306 | 39% | -0.069 | -0.087 | -0.054 | -1461 |
| 15-minute candles — both | 3427 | 45% | -0.011 | -0.027 | 0.002 | -39 |
| Main without costs — both | 7965 | 43% | -0.004 | -0.010 | 0.001 | -31 |

- Bootstrap 95% interval of the mean R (both): -0.046 … 0.003
- Random direction (100 repeats, same entries/stops/targets mirrored): median mean R -0.007; the model is better in **13 of 100**.
- Trades per session: 1.46; average risk (entry to stop): QQQ $1.16, SPY $1.06; exits: target 2429, stop 3998, 15:55 1538.
- Checks: QQQ > 0 ✗; SPY > 0 ✗; bootstrap low > 0 ✗; beats random >= 95/100 ✗; 2016–2020 > 0 ✗; 2021–2026 > 0 ✗ → **STOP** (mean -0.021R)

Checks of the code: 11 unit tests (every rule; mutation check - each rule change breaks a test); an independent Python
re-implementation written from the pre-registration (scripts/research/xcheck_ffcc.py) gives identical trades on
40 random QQQ sessions (51 trades). Not tested: the Asia (Globex) session (needs futures data) and the course's
"full rules" (paid).

## Other symbols (main version, same rules)

| Symbol | Trades | Winners | Mean R | 95% interval | 2016–2020 | 2021–2026 | Better than random direction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DIA | 3816 | 42% | -0.022 | -0.058 … 0.013 | -0.042 | -0.006 | 15/100 |
| IWM | 3707 | 43% | -0.024 | -0.059 … 0.011 | -0.035 | -0.014 | 26/100 |
| GLD | 3643 | 45% | -0.004 | -0.038 … 0.029 | 0.004 | -0.012 | 80/100 |
| SLV | 3245 | 41% | -0.143 | -0.178 … -0.108 | -0.209 | -0.087 | 16/100 |
| AAPL | 3245 | 44% | -0.003 | -0.040 … 0.035 | 0.009 | -0.012 | 47/100 |
| MSFT | 3299 | 44% | -0.005 | -0.043 … 0.032 | -0.011 | -0.001 | 84/100 |
| NVDA | 3088 | 43% | -0.028 | -0.067 … 0.011 | -0.025 | -0.030 | 28/100 |
| TSLA | 2985 | 44% | 0.011 | -0.028 … 0.050 | 0.029 | -0.003 | 46/100 |
