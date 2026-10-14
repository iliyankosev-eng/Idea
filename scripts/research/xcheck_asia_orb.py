# Independent re-implementation (Python, from experiments/asia-orb-preregistration.md) for one Binance symbol.
import gzip, sys, datetime as dt
from zoneinfo import ZoneInfo
NY = ZoneInfo("America/New_York")
sym, start = sys.argv[1], sys.argv[2]
days = {}
y, m = int(start[:4]), int(start[5:7])
while (y, m) <= (2026, 9):
    with gzip.open(f"data/branch/intraday/binance/{sym}/1m/{y}-{m:02d}.csv.gz", "rt") as f:
        next(f)
        for line in f:
            t, o, h, l, c, v = line.split(",")
            ts = dt.datetime.fromtimestamp(int(t) / 1000, NY)
            mi = ts.hour * 60 + ts.minute
            if mi < 1080: continue
            days.setdefault(ts.strftime("%Y-%m-%d"), []).append((mi - 1080, float(o), float(h), float(l), float(c), float(v)))
    m += 1
    if m == 13: m, y = 1, y + 1
n, tot = 0, 0.0
for d in sorted(days):
    B = days[d]
    if [b[0] for b in B[:15]] != list(range(15)): continue
    H = max(b[2] for b in B[:15]); L = min(b[3] for b in B[:15]); R = H - L; M = (H + L) / 2
    va = sum(b[5] for b in B[:15]) / 15
    br = next(((i, 1 if B[i][4] > H else -1) for i in range(15, len(B)) if B[i][0] < 120 and B[i][5] >= 1.5 * va and (B[i][4] > H or B[i][4] < L)), None)
    if br is None: continue
    i, s = br
    res = None
    for r in range(i + 1, len(B)):
        cl = B[r][4]
        if (s == 1 and cl < H) or (s == -1 and cl > L): break
        if (s == 1 and B[r][3] <= H + 0.25 * R) or (s == -1 and B[r][2] >= L - 0.25 * R):
            k = r + 1
            if k >= len(B) or B[k][0] >= 120: break
            e = B[k][1]; risk = s * (e - M)
            if risk <= 0: break
            ex = None
            last = max(j for j in range(k, len(B)) if B[j][0] < B[k][0] + 120)
            for j in range(k, last + 1):
                if j > k and s * (B[j][1] - M) <= 0: ex = B[j][1]; break
                if (s == 1 and B[j][3] <= M) or (s == -1 and B[j][2] >= M): ex = M; break
            if ex is None: ex = B[last][4]
            res = s * (ex - e) / risk
            break
    if res is not None: n += 1; tot += res
print(sym, "trades", n, "mean gross R", round(tot / n, 4))
