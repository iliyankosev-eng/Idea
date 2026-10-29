"""Independent cross-check of S3 (gold 06:30 UK breakout, PAXG) for reports/social5.md.
Usage: python3 scripts/research/xcheck_gold630.py <data_dir>"""
import csv, gzip, os, sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

LON = ZoneInfo("Europe/London")
root = os.path.join(sys.argv[1], "intraday", "binance", "PAXGUSDT", "1m")
days = {}
for f in sorted(os.listdir(root)):
    if not ("2020-09" <= f[:7] <= "2026-09"):
        continue
    with gzip.open(os.path.join(root, f), "rt") as fh:
        for row in csv.DictReader(fh):
            dt = datetime.fromtimestamp(int(row["t"]) / 1000, timezone.utc).astimezone(LON)
            if dt.weekday() > 4:
                continue
            m = dt.hour * 60 + dt.minute
            if 390 <= m <= 570:
                days.setdefault(dt.date().isoformat(), []).append((m, float(row["o"]), float(row["h"]), float(row["l"]), float(row["c"])))

def run(fee):
    res = []
    for d, bars in sorted(days.items()):
        rng = [b for b in bars if 390 <= b[0] < 405]
        if len(rng) < 15:
            continue
        H = max(b[2] for b in rng); L = min(b[3] for b in rng)
        if not H > L:
            continue
        idx_last = max(i for i, b in enumerate(bars) if b[0] < 570)
        start = max(i for i, b in enumerate(bars) if b[0] < 405) + 1
        for i in range(start, len(bars)):
            if bars[i][0] >= 480:
                break
            c = bars[i][4]
            brk = 1 if c > H else -1 if c < L else 0
            if not brk or i + 1 > idx_last:
                continue
            k = i + 1; entry = bars[k][1]; stop = L if brk == 1 else H
            risk = brk * (entry - stop)
            if risk <= 0:
                break
            exitp = bars[idx_last][4]
            for j in range(k, idx_last + 1):
                o, h, l = bars[j][1], bars[j][2], bars[j][3]
                if j > k and brk * (o - stop) <= 0:
                    exitp = o; break
                if (l <= stop) if brk == 1 else (h >= stop):
                    exitp = stop; break
            res.append((brk * (exitp - entry) - fee * (entry + exitp)) / risk)
            break
    return res

for fee in (0.0, 0.0005):
    r = run(fee)
    print(f"fee {fee}: trades {len(r)}, win {sum(x > 0 for x in r) / len(r):.3f}, mean R {sum(r) / len(r):.4f}")
