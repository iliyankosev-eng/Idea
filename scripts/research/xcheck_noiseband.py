"""Independent cross-check of the noise-band strategy as the bot runs it (experiments/bot-v2-preregistration.md):
QQQ, checks 10:00..15:30 every 30 min, band = max/min(open, prev close) * (1 +/- avg |move from open| at that time over 14 days),
trailing stop at VWAP, size min(2, 2% / 14-day daily vol), execution at the next minute's open, flat at 15:55, $0.0045/share/side.
Usage: python3 -I scripts/research/xcheck_noiseband.py sessions.csv [ts.json]   (sessions.csv: date,m,o,h,l,c,v)"""
import csv, json, math, sys
from collections import OrderedDict

COST, MAXLEV, EXIT = 0.0045, 2.0, 955
days = OrderedDict()
with open(sys.argv[1]) as f:
    for r in csv.DictReader(f):
        days.setdefault(r["date"], []).append((int(r["m"]), float(r["o"]), float(r["h"]), float(r["l"]), float(r["c"]), float(r["v"])))
dates, S = list(days), list(days.values())
close = [s[-1][4] for s in S]
res = []
for d in range(15, len(S)):
    s = S[d]
    if s[0][0] != 570:
        res.append((dates[d], 0.0, 0)); continue
    opn, prev = s[0][1], close[d - 1]
    rets = [close[k] / close[k - 1] - 1 for k in range(d - 14, d)]
    mu = sum(rets) / 14
    vol = math.sqrt(sum((x - mu) ** 2 for x in rets) / 13)
    q = min(MAXLEV, 0.02 / vol) / opn
    last = s[-1][0]
    pos, entry, pnl, n = 0, 0.0, 0.0, 0
    m = 600
    while m <= 930 and m < last:
        vals = []
        for k in range(d - 14, d):
            sk = S[k]
            if sk[0][0] != 570: continue
            b = [x for x in sk if x[0] == m - 1]
            if b: vals.append(abs(b[0][4] / sk[0][1] - 1))
        before = [x for x in s if x[0] < m]
        if len(vals) >= 10 and before:
            sig = sum(vals) / len(vals)
            ub, lb = max(opn, prev) * (1 + sig), min(opn, prev) * (1 - sig)
            p = before[-1][4]
            tv = sum(x[5] for x in before)
            vw = sum((x[2] + x[3] + x[4]) / 3 * x[5] for x in before) / tv if tv > 0 else float("nan")
            nxt = [x for x in s if x[0] >= m]
            ex = nxt[0][1] if nxt else p
            want = 1 if p > max(ub, vw) else -1 if p < min(lb, vw) else 0
            if want != pos:
                if pos != 0: pnl += pos * (ex - entry) * q - COST * q; n += 1
                if want != 0: entry = ex; pnl -= COST * q
                pos = want
        m += 30
    if pos != 0:
        e = [x for x in s if x[0] == EXIT]
        ex = e[0][1] if e else s[-1][4]
        pnl += pos * (ex - entry) * q - COST * q; n += 1
    res.append((dates[d], pnl, n))
tot = sum(r[1] for r in res)
print("python: days", len(res), "trades", sum(r[2] for r in res), "sum of daily returns %.6f" % tot)
if len(sys.argv) > 2:
    ts = json.load(open(sys.argv[2]))
    print("typescript: days", len(ts), "trades", sum(t[2] for t in ts), "sum %.6f" % sum(t[1] for t in ts))
    diff = [(a, b) for a, b in zip(res, ts) if a[0] != b[0] or abs(a[1] - b[1]) > 1e-9]
    print("days that differ:", len(diff)); print(diff[:3])
