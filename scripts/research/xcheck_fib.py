"""Independent cross-check of the S/R + Fibonacci + confirmation rules (experiments/fib-confluence-preregistration.md).
Written from the pre-registration text, not from the TypeScript. Input: hourly bars CSV (day,o,h,l,c).
Usage: python3 -I scripts/research/xcheck_fib.py bars.csv rsi|none [ts_trades.json]
"""
import csv, json, sys

K, LOOK, TOUCH, ENTRY, HOLD, COST = 5, 200, 50, 10, 14, 0.009

def load(path):
    with open(path) as f:
        rd = csv.DictReader(f)
        rows = list(rd)
    return [r["day"] for r in rows], [float(r["o"]) for r in rows], [float(r["h"]) for r in rows], [float(r["l"]) for r in rows], [float(r["c"]) for r in rows]

def wilder_atr(h, l, c, n=14):
    tr = [h[0] - l[0]] + [max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])) for i in range(1, len(c))]
    out = [float("nan")] * len(c)
    a = sum(tr[:n]) / n
    out[n - 1] = a
    for i in range(n, len(c)):
        a = (a * (n - 1) + tr[i]) / n
        out[i] = a
    return out

def wilder_rsi(c, n=14):
    out = [float("nan")] * len(c)
    ch = [c[i] - c[i - 1] for i in range(1, len(c))]
    g = sum(max(x, 0) for x in ch[:n]) / n
    d = sum(max(-x, 0) for x in ch[:n]) / n
    out[n] = 100 if d == 0 else 100 - 100 / (1 + g / d)
    for i in range(n + 1, len(c)):
        x = c[i] - c[i - 1]
        g = (g * (n - 1) + max(x, 0)) / n
        d = (d * (n - 1) + max(-x, 0)) / n
        out[i] = 100 if d == 0 else 100 - 100 / (1 + g / d)
    return out

def candidates(o, h, l, c, confirm):
    n = len(c)
    A, R = wilder_atr(h, l, c), wilder_rsi(c)
    # pivots with the bar index at which they become known
    hi = [i for i in range(K, n - K) if all(h[i] > h[j] for j in range(i - K, i + K + 1) if j != i)]
    lo = [i for i in range(K, n - K) if all(l[i] < l[j] for j in range(i - K, i + K + 1) if j != i)]
    lo_set = set(lo)
    piv = sorted([(i, h[i]) for i in hi] + [(i, l[i]) for i in lo])
    out = []
    for iH in hi:
        t = iH + K
        if not (A[t] > 0):
            continue
        lows_before = [i for i in lo if i < iH]  # all confirmed by t since i + K < iH + K
        if not lows_before:
            continue
        iL = lows_before[-1]
        Hp, Lp = h[iH], l[iL]
        if max(h[iL:iH + 1]) > Hp or min(l[iL:t + 1]) < Lp:
            continue
        span = Hp - Lp
        if span < 2 * A[t]:
            continue
        f618, f786 = Hp - 0.618 * span, Hp - 0.786 * span
        if not any(i < iL and i >= t - LOOK and (abs(p - f618) <= 0.5 * A[t] or abs(p - f786) <= 0.5 * A[t]) for i, p in piv):
            continue
        u0 = None
        for u in range(t + 1, min(n, t + TOUCH + 1)):
            if l[u] < Lp:
                break
            if l[u] <= f618:
                u0 = u
                break
            if h[u] > Hp:
                break
        if u0 is None:
            continue
        seen_rsi = False
        for e in range(u0, min(n - 1, u0 + ENTRY + 1)):
            if l[e] < Lp:
                break
            seen_rsi = seen_rsi or R[e] <= 35
            if c[e] > o[e] and c[e] > f786 and (confirm == "none" or seen_rsi):
                stop, target, entry = Lp - 0.1 * A[e], Hp - 0.1 * A[e], o[e + 1]
                if stop < entry < target:
                    out.append((e + 1, stop, target))
                break
    return out

def sim(o, h, l, c, k, stop, target):
    last = min(len(c) - 1, k + HOLD - 1)
    for j in range(k, last + 1):
        if j > k and o[j] <= stop: return o[j], j
        if j > k and o[j] >= target: return o[j], j
        if l[j] <= stop: return stop, j
        if h[j] >= target: return target, j
    return c[last], last

def trades(day, o, h, l, c, confirm):
    mo, mh, ml, mc = [-x for x in o], [-x for x in l], [-x for x in h], [-x for x in c]
    cs = [(k, 1, s, g) for k, s, g in candidates(o, h, l, c, confirm)] + [(k, -1, s, g) for k, s, g in candidates(mo, mh, ml, mc, confirm)]
    cs.sort(key=lambda x: (x[0], x[1]))
    res, busy = [], -1
    for k, d, s, g in cs:
        if k <= busy:
            continue
        fo, fh, fl, fc = (o, h, l, c) if d == 1 else (mo, mh, ml, mc)
        e = fo[k]
        x, j = sim(fo, fh, fl, fc, k, s, g)
        res.append((k, d, j, (x - e - COST) / (e - s)))
        busy = j
    return res

if __name__ == "__main__":
    day, o, h, l, c = load(sys.argv[1])
    py = trades(day, o, h, l, c, sys.argv[2])
    print("python trades", len(py), "mean R %.6f" % (sum(t[3] for t in py) / len(py)))
    if len(sys.argv) > 3:
        ts = json.load(open(sys.argv[3]))
        print("typescript trades", len(ts), "mean R %.6f" % (sum(t[3] for t in ts) / len(ts)))
        same = sum(1 for a, b in zip(py, ts) if a[0] == b[0] and a[1] == b[1] and a[2] == b[2] and abs(a[3] - b[3]) < 1e-8)
        print("identical trades:", same, "of", max(len(py), len(ts)))
        for a, b in zip(py, ts):
            if not (a[0] == b[0] and a[1] == b[1] and a[2] == b[2] and abs(a[3] - b[3]) < 1e-8):
                print("first difference:", a, b)
                break
