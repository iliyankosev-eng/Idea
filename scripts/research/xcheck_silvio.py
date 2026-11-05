"""Independent cross-check of the silviotrades supply/demand model, v2 thresholds (experiments/silvio-sd-preregistration.md).
Written from the pre-registration text. Input: regular-session minute bars CSV (date,m,o,h,l,c) of the kept sessions.
Usage: python3 -I scripts/research/xcheck_silvio.py sessions.csv [ts_trades.json]
"""
import csv, json, sys
from collections import OrderedDict

BIG, RNGB, BODYB, RR, COST = 0.5, 0.3, 0.5, 2.0, 0.0045

def load(path):
    days = OrderedDict()
    with open(path) as f:
        for r in csv.DictReader(f):
            days.setdefault(r["date"], []).append((int(r["m"]), float(r["o"]), float(r["h"]), float(r["l"]), float(r["c"])))
    return list(days.keys()), list(days.values())

def agg(rows, width):
    out, cur = [], None
    for m, o, h, l, c in rows:
        if not (570 <= m < 960):
            continue
        k = (m - 570) // width
        if k != cur:
            cur = k
            out.append([570 + width * k, o, h, l, c])
        else:
            b = out[-1]; b[2] = max(b[2], h); b[3] = min(b[3], l); b[4] = c
    return out

def neg(rows):
    return [(m, -o, -l, -h, -c) for m, o, h, l, c in rows]

def setup(days_rows):
    closes = [r[-1][4] for r in days_rows]
    sma = [sum(closes[i - 19:i + 1]) / 20 if i >= 19 else None for i in range(len(closes))]
    hours, last_hour = [], []
    for si, rows in enumerate(days_rows):
        for b in agg(rows, 60):
            hours.append((si, b[1], b[2], b[3], b[4]))
        last_hour.append(len(hours) - 1)
    # Wilder ATR(14)
    tr = []
    for i, (_, o, h, l, c) in enumerate(hours):
        tr.append(h - l if i == 0 else max(h - l, abs(h - hours[i - 1][4]), abs(l - hours[i - 1][4])))
    atr = [None] * len(hours)
    a = sum(tr[:14]) / 14; atr[13] = a
    for i in range(14, len(hours)):
        a = (a * 13 + tr[i]) / 14; atr[i] = a
    zones = []
    for j in range(2, len(hours)):
        if atr[j] is None or atr[j] <= 0:
            continue
        A, B, Cb = hours[j - 2], hours[j - 1], hours[j]
        bodyA, rngB, bodyB = abs(A[4] - A[1]), B[2] - B[3], abs(B[4] - B[1])
        if bodyA >= BIG * atr[j] and rngB >= RNGB * atr[j] and bodyB <= BODYB * rngB and bodyB <= 0.5 * bodyA and Cb[4] - Cb[1] >= BIG * atr[j]:
            lo, hi = B[3], B[2]
            touch = next((k for k in range(j + 1, len(hours)) if hours[k][3] <= hi), len(hours))
            zones.append((j, Cb[0], lo, hi, touch))
    return closes, sma, last_hour, zones

def long_trade(rows5, z):
    lo, hi = z
    n = len(rows5)
    if n == 0 or rows5[0][1] < lo:
        return None
    tap = next((k for k in range(n) if rows5[k][3] <= hi), None)
    if tap is None:
        return None
    H = [b[2] for b in rows5]
    def pivot(i):
        return i >= 2 and i + 2 < n and all(H[i] > H[j] for j in (i - 2, i - 1, i + 1, i + 2))
    for e in range(tap, n - 1):
        if rows5[e][4] < lo:
            return None
        piv = [i for i in range(2, e - 2) if pivot(i)]
        if not piv or not rows5[e][4] > H[piv[-1]]:
            continue
        k = e + 1
        if rows5[k][0] >= 900:
            return None
        entry = rows5[k][1]
        stop = min(b[3] for b in rows5[tap:e + 1]) - 0.01
        risk = entry - stop
        if risk <= 0:
            return None
        target = entry + RR * risk
        ex, xi = rows5[-1][4], n - 1
        for j in range(k, n):
            o, h, l = rows5[j][1], rows5[j][2], rows5[j][3]
            if j > k and o <= stop: ex, xi = o, j; break
            if j > k and o >= target: ex, xi = o, j; break
            if l <= stop: ex, xi = stop, j; break
            if h >= target: ex, xi = target, j; break
        return (k, xi, (ex - entry - 2 * COST) / risk)
    return None

def run(dates, days_rows):
    frames = []
    for sign, dr in ((1, days_rows), (-1, [neg(r) for r in days_rows])):
        closes, sma, last_hour, zones = setup(dr)
        frames.append((sign, dr, closes, sma, last_hour, zones))
    out = []
    for s in range(25, len(dates)):
        cands = []
        for sign, dr, closes, sma, last_hour, zones in frames:
            if not (closes[s - 1] > sma[s - 1] and sma[s - 1] > sma[s - 6]):
                continue
            z = None
            for j, zs, lo, hi, touch in reversed(zones):
                if zs >= s:
                    continue
                if zs < s - 60:
                    break
                if hi < closes[s - 1] and touch > last_hour[s - 1]:
                    z = (lo, hi); break
            if z is None:
                continue
            t = long_trade(agg(dr[s], 5), z)
            if t:
                cands.append((t[0], sign, t))
        if cands:
            cands.sort(key=lambda x: (x[0], x[1]))
            k, sign, t = cands[0]
            out.append((dates[s], sign, t[0], t[1], t[2]))
    return out

if __name__ == "__main__":
    dates, rows = load(sys.argv[1])
    py = run(dates, rows)
    print("python trades", len(py), "mean R %.6f" % (sum(t[4] for t in py) / len(py)))
    if len(sys.argv) > 2:
        ts = json.load(open(sys.argv[2]))
        print("typescript trades", len(ts), "mean R %.6f" % (sum(t[4] for t in ts) / len(ts)))
        same = sum(1 for a, b in zip(py, ts) if list(a[:4]) == b[:4] and abs(a[4] - b[4]) < 1e-8)
        print("identical:", same, "of", max(len(py), len(ts)))
        for a, b in zip(py, ts):
            if not (list(a[:4]) == b[:4] and abs(a[4] - b[4]) < 1e-8):
                print("first difference:", a, b); break
