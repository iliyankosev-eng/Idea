# Independent re-implementation of experiments/trend-preregistration.md (set A, main variant) from the raw CSVs.
import csv, json, math, sys
import numpy as np
root = sys.argv[1]
def load(s):
    with open(f"{root}/data/etf/alpaca/{s}.csv") as f:
        return {r["d"]: float(r["c"]) for r in csv.DictReader(f)}
keys = ["SPY", "TLT", "GLD"]
raw = {s: load(s) for s in keys + ["BIL"]}
dates = sorted(set.intersection(*[set(v) for v in raw.values()]))
P = np.array([[raw[s][d] for d in dates] for s in keys])  # assets x days
C = np.array([raw["BIL"][d] for d in dates])
ends = [i for i in range(len(dates) - 1) if dates[i][:7] != dates[i + 1][:7]]
out, prev = [], np.zeros(len(keys))
for k in range(len(ends) - 1):
    e = ends[k]
    if k < 12 or e - 252 < 0: continue
    a, b = e + 1, ends[k + 1] + 1
    if b >= len(dates): break
    s = np.zeros(len(keys))
    for j in range(len(keys)):
        sig = [np.sign(P[j, e] / P[j, ends[k - m]] - C[e] / C[ends[k - m]]) for m in (1, 3, 12)]
        s[j] = sum(sig) / 3
    R = P[:, e - 251:e + 1] / P[:, e - 252:e] - C[e - 251:e + 1] / C[e - 252:e]
    cov = np.cov(R) * 252
    raw_w = np.where(s == 0, 0, s / np.sqrt(np.diag(cov)))
    pv = math.sqrt(raw_w @ cov @ raw_w)
    w = raw_w * 0.10 / pv if pv > 0 else raw_w * 0
    if np.abs(w).sum() > 2: w = w * 2 / np.abs(w).sum()
    rc = C[b] / C[a] - 1
    r = rc + float(w @ (P[:, b] / P[:, a] - 1 - rc))
    cost = 0.0003 * np.abs(w - prev).sum() + 0.005 / 12 * np.maximum(0, -w).sum()
    out.append((dates[a], dates[b], r - cost)); prev = w
ts = json.load(open(f"{root}/reports/trend-dump.json"))
assert len(ts) == len(out), (len(ts), len(out))
diff = max(abs(x["r"] - o[2]) for x, o in zip(ts, out))
same = all(x["s"] == o[0] and x["e"] == o[1] for x, o in zip(ts, out))
r = np.array([o[2] for o in out]); cagr = np.prod(1 + r) ** (12 / len(r)) - 1
print(f"months {len(out)} dates identical {same}; max |diff| per month {diff:.2e}; python CAGR {100*cagr:.2f}%")
