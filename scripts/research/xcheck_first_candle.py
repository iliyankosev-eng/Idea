# Independent re-implementation (Python, written from experiments/first-candle-preregistration.md) of the
# first candle rule on Alpaca SPY/QQQ, to cross-check src/ict/firstCandle.ts. Prints per-day trades as JSON lines.
import gzip, csv, sys, json, datetime as dt
from zoneinfo import ZoneInfo
NY = ZoneInfo("America/New_York")
D = "data/branch"
cal = {r["date"]: (int(r["open"][:2]) * 60 + int(r["open"][3:5]), int(r["close"][:2]) * 60 + int(r["close"][3:5])) for r in csv.DictReader(open(f"{D}/daily/alpaca/calendar.csv"))}

def days(sym):
    out = {}
    y, m = 2016, 1
    while (y, m) <= (2026, 9):
        with gzip.open(f"{D}/intraday/alpaca/{sym}/1m/{y}-{m:02d}.csv.gz", "rt") as f:
            next(f)
            for line in f:
                t, o, h, l, c, v = line.split(",")
                ts = dt.datetime.fromtimestamp(int(t) / 1000, NY)
                d = ts.strftime("%Y-%m-%d"); mi = ts.hour * 60 + ts.minute
                if d in cal and cal[d][0] <= mi < cal[d][1]:
                    out.setdefault(d, []).append((mi, float(o), float(h), float(l), float(c)))
        m += 1
        if m == 13: m, y = 1, y + 1
    return out

def setup(bars, H, i0, last, sign):
    # bars as (m, o, h, l, c) in "long space" (sign=-1: mirrored)
    def g(k): m, o, h, l, c = bars[k]; return (m, sign * o, sign * h if sign > 0 else -l, sign * l if sign > 0 else -h, sign * c)
    B = [g(k) for k in range(len(bars))]
    Hs = H if sign > 0 else -H
    c_idx = i0 + 6
    while c_idx <= last:
        if B[c_idx][0] >= 720: return None
        a, b = B[c_idx - 2], B[c_idx - 1]
        cc = B[c_idx]
        if cc[3] > a[2] and b[4] > Hs and cc[3] > Hs:
            top, bot = cc[3], a[2]
            r = next((k for k in range(c_idx + 1, last + 1) if B[k][3] <= top), None)
            if r is None: return None
            resume = min(r + 15, last) + 1
            for e in range(r, min(r + 15, last) + 1):
                if B[e][4] < bot: resume = e + 1; break
                pe = B[e - 1]
                if B[e][4] > B[e][1] and pe[4] < pe[1] and B[e][1] <= pe[4] and B[e][4] >= pe[1]:
                    k = e + 1
                    if k > last or B[k][0] >= 720: return None
                    stop = min(B[j][3] for j in range(r, e + 1)); entry = B[k][1]
                    if entry - stop <= 0: resume = e + 1; break
                    return (k, entry, stop, B)
            c_idx = max(resume, c_idx + 1) + 2
            continue
        c_idx += 1
    return None

def trade(bars):
    ms = [b[0] for b in bars]
    if 570 not in ms: return None
    i0 = ms.index(570)
    if any(i0 + k >= len(ms) or ms[i0 + k] != 570 + k for k in range(5)): return None
    last = max(k for k in range(len(ms)) if ms[k] <= 959)
    if last < i0 + 7: return None
    H = max(b[2] for b in bars[i0:i0 + 5]); L = min(b[3] for b in bars[i0:i0 + 5])
    s1, s2 = setup(bars, H, i0, last, 1), setup(bars, L, i0, last, -1)
    s = s1 if s1 and (not s2 or s1[0] <= s2[0]) else s2
    if not s: return None
    k, entry, stop, B = s
    risk = entry - stop; tgt = entry + 3 * risk; ex = B[last][4]
    for j in range(k, last + 1):
        if j > k and B[j][1] <= stop: ex = B[j][1]; break
        if B[j][3] <= stop: ex = stop; break
        if B[j][2] >= tgt: ex = tgt; break
    return (1 if s is s1 else -1, (ex - entry) / risk)

for sym in sys.argv[1:]:
    for d, bars in sorted(days(sym).items()):
        t = trade(bars)
        if t: print(json.dumps([sym, d, t[0], round(t[1], 9)]))
