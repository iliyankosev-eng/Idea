# Independent re-implementation (Python) of S1 VWAP/EMA9 on 5-minute SPY bars (experiments/social5-preregistration.md).
import gzip, csv, datetime as dt
from zoneinfo import ZoneInfo
NY = ZoneInfo("America/New_York"); D = "data/branch"
cal = {r["date"]: (int(r["open"][:2]) * 60 + int(r["open"][3:5]), int(r["close"][:2]) * 60 + int(r["close"][3:5])) for r in csv.DictReader(open(f"{D}/daily/alpaca/calendar.csv"))}
days = {}
y, m = 2016, 1
while (y, m) <= (2026, 9):
    with gzip.open(f"{D}/intraday/alpaca/SPY/1m/{y}-{m:02d}.csv.gz", "rt") as f:
        next(f)
        for line in f:
            t, o, h, l, c, v = line.split(",")
            ts = dt.datetime.fromtimestamp(int(t) / 1000, NY); d = ts.strftime("%Y-%m-%d"); mi = ts.hour * 60 + ts.minute
            if d in cal and cal[d][0] <= mi < cal[d][1]: days.setdefault(d, []).append((mi, float(o), float(h), float(l), float(c), float(v)))
    m += 1
    if m == 13: m, y = 1, y + 1
keep = sorted(d for d in days if len(days[d]) >= 0.5 * (cal[d][1] - cal[d][0]))
ema = None; tot = 0.0; n = 0; nd = 0
for d in keep:
    bars = []
    for mi, o, h, l, c, v in days[d]:
        st = 570 + (mi - 570) // 5 * 5
        if bars and bars[-1][0] == st:
            b = bars[-1]; bars[-1] = (st, b[1], max(b[2], h), min(b[3], l), c, b[5] + v)
        else: bars.append((st, o, h, l, c, v))
    pv = vv = 0.0; pos = 0; entry = 0.0; r = 0.0; prev = None; pend = None
    for t, (st, o, h, l, c, v) in enumerate(bars):
        if pend is not None:
            if pos != 0 and pend != pos: r += pos * (o / entry - 1) - 0.0045 / entry - 0.0045 / o; pos = 0
            if pend != 0 and pos == 0: pos = pend; entry = o; n += 1
            pend = None
        pv += (o + h + l + c) / 4 * v; vv += v
        ema = c if ema is None else ema + 0.2 * (c - ema)
        if vv == 0: prev = None; continue
        diff = ema - pv / vv; want = None
        if pos == 1 and c < ema: want = 0
        if pos == -1 and c > ema: want = 0
        if prev is not None:
            if prev <= 0 and diff > 0: want = 1
            if prev >= 0 and diff < 0: want = -1
        prev = diff
        if want is not None and t + 1 < len(bars):
            nm = bars[t + 1][0]
            if want == 0 or 575 <= nm <= 930: pend = want
            elif pos != 0 and want != pos: pend = 0
    if pos != 0: c = bars[-1][4]; r += pos * (c / entry - 1) - 0.0045 / entry - 0.0045 / c
    if d >= "2016-01-04": tot += r; nd += 1
print("S1 SPY 5m: days", nd, "trades", n, "mean daily bp", round(1e4 * tot / nd, 4))
