# Independent re-implementation (Python) of N1 (SPY) and N2 from experiments/new3-preregistration.md.
import gzip, csv, json, datetime as dt
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
            if d in cal and cal[d][0] <= mi < cal[d][1]: days.setdefault(d, []).append((mi, float(o), float(c)))
    m += 1
    if m == 13: m, y = 1, y + 1
dates = sorted(d for d in days if len(days[d]) >= 0.5 * (cal[d][1] - cal[d][0]))
caldates = sorted(cal)
prev_official = {caldates[i]: caldates[i - 1] for i in range(1, len(caldates))}
fomc = set(json.load(open("scripts/fomc-dates.json"))["dates"])
n1 = []; n2 = []
for i in range(1, len(dates)):
    d, p = dates[i], dates[i - 1]
    if prev_official.get(d) != p or d < "2016-01-04": continue
    B, pc = days[d], days[p][-1][2]
    t30 = B[-1][0] + 1 - 30
    before = [b for b in B if b[0] < t30]; at = [b for b in B if b[0] == t30]
    if before and at:
        sig = before[-1][2] / pc - 1
        if sig != 0:
            e, x = at[0][1], B[-1][2]
            n1.append((1 if sig > 0 else -1) * (x / e - 1) - 0.009 / e)
    if d in fomc:
        b = [x for x in B if x[0] == 839]
        if b: n2.append(b[0][2] / pc - 1 - 0.009 / pc)
print("N1 SPY trades", len(n1), "mean bp", round(1e4 * sum(n1) / len(n1), 4))
print("N2 events", len(n2), "mean %", round(100 * sum(n2) / len(n2), 4))
