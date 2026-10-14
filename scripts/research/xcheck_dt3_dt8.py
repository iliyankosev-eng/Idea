# Independent re-implementation (Python) of DT3 (ORB 5 min, QQQ) and DT8 (RSI(2), SPY) to cross-check the TypeScript numbers.
import gzip, csv, math, json, datetime as dt
from zoneinfo import ZoneInfo
NY = ZoneInfo("America/New_York")
D = "data/branch"
cal = {}
for r in csv.DictReader(open(f"{D}/daily/alpaca/calendar.csv")):
    o, c = r["open"], r["close"]
    cal[r["date"]] = (int(o[:2]) * 60 + int(o[3:5]), int(c[:2]) * 60 + int(c[3:5]))
def sessions(sym):
    days = {}
    y, m = 2016, 1
    while (y, m) <= (2026, 9):
        with gzip.open(f"{D}/intraday/alpaca/{sym}/1m/{y}-{m:02d}.csv.gz", "rt") as f:
            next(f)
            for line in f:
                t, o, h, l, c, v = line.split(",")
                ts = dt.datetime.fromtimestamp(int(t) / 1000, NY)
                d = ts.strftime("%Y-%m-%d"); mi = ts.hour * 60 + ts.minute
                if d not in cal or mi < cal[d][0] or mi >= cal[d][1] or ts.weekday() >= 5: continue
                days.setdefault(d, []).append((mi, float(o), float(h), float(l), float(c)))
        m += 1
        if m == 13: m, y = 1, y + 1
    out = []
    for d in sorted(days):
        bars = days[d]
        o_, c_ = cal[d]
        if len(bars) >= 0.5 * (c_ - o_): out.append((d, bars))
    return out
def stats(rs, ppy=252):
    n = len(rs); mean = sum(rs) / n; sd = math.sqrt(sum((x - mean) ** 2 for x in rs) / (n - 1))
    eq = 1
    for x in rs: eq *= 1 + x
    return eq ** (ppy / n) - 1, mean / sd * math.sqrt(ppy)
fomc = set(json.load(open("scripts/fomc-dates.json"))["dates"])
q = sessions("QQQ")
COST = 0.0045
r3, r3f = [], []
for d, b in q:
    r = 0.0
    if len(b) > 5 and b[0][0] == 570 and b[4][0] == 574 and b[5][0] == 575 and b[4][4] != b[0][1]:
        dirn = 1 if b[4][4] > b[0][1] else -1
        hi = max(x[2] for x in b[:5]); lo = min(x[3] for x in b[:5])
        e = b[5][1]; stop = lo if dirn == 1 else hi; risk = dirn * (e - stop)
        if risk > 0:
            tgt = e + dirn * 10 * risk; qn = min(0.01 / risk, 4 / e); ex = b[-1][4]
            for i in range(5, len(b)):
                if i > 5 and dirn * (b[i][1] - stop) <= 0: ex = b[i][1]; break
                if (b[i][3] <= stop) if dirn == 1 else (b[i][2] >= stop): ex = stop; break
                if (b[i][2] >= tgt) if dirn == 1 else (b[i][3] <= tgt): ex = tgt; break
            r = dirn * (ex - e) * qn - 2 * COST * qn
    r3.append(r); r3f.append(0.0 if d in fomc else r)
print("Python DT3 QQQ: CAGR %.1f%%, Sharpe %.2f, days %d" % (*[100 * stats(r3)[0], stats(r3)[1]], len(r3)))
print("Python DT3 QQQ, skip FOMC: CAGR %.1f%%, Sharpe %.2f" % (100 * stats(r3f)[0], stats(r3f)[1]))
rows = [r for r in csv.DictReader(open(f"{D}/daily/alpaca/SPY.csv")) if r["date"] <= "2026-09-30"]
c = [float(r["c"]) for r in rows]
up = dn = 0.0; rsi = [float("nan")] * len(c)
for i in range(1, len(c)):
    ch = c[i] - c[i - 1]; u, d_ = max(ch, 0), max(-ch, 0)
    if i <= 2:
        up += u / 2; dn += d_ / 2
        if i == 2: rsi[i] = 100 if dn == 0 else 100 - 100 / (1 + up / dn)
        continue
    up = (up + u) / 2; dn = (dn + d_) / 2
    rsi[i] = 100 if dn == 0 else 100 - 100 / (1 + up / dn)
pos = False; r8 = []
for i in range(1, len(c)):
    r = c[i] / c[i - 1] - 1 if pos else 0.0
    sma5 = sum(c[i - 4:i + 1]) / 5 if i >= 4 else float("nan"); sma200 = sum(c[i - 199:i + 1]) / 200 if i >= 199 else float("nan")
    if pos and c[i] > sma5: pos = False; r -= COST / c[i]
    elif not pos and rsi[i] < 10 and c[i] > sma200: pos = True; r -= COST / c[i]
    r8.append(r)
print("Python DT8 SPY: CAGR %.1f%%, Sharpe %.2f, days %d" % (100 * stats(r8)[0], stats(r8)[1], len(r8)))
