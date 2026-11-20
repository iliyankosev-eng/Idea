# Independent cross-check of the S1 / S2 SIGNALS of src/investclub/core.ts, written from the pre-registration text
# with pandas (no shared code). Usage: python3 -I scripts/research/xcheck_investclub.py <signals.json from the TS dumper>
import gzip, io, json, os, sys
import numpy as np, pandas as pd

U = "data/universe/daily"
spy = pd.read_csv("data/branch/daily/alpaca/SPY.csv", parse_dates=["date"]).set_index("date")["c"]
days = spy.index
ts = json.load(open(sys.argv[1]))
want_syms = set(ts["syms"])

# calendar weeks: Monday-based, last trading day of each week in the SPY calendar
wk_key = days - pd.to_timedelta(days.dayofweek, unit="D")
week_last = pd.Series(days, index=days).groupby(wk_key.values).max()
spy_w = pd.Series(spy.loc[week_last.values].values, index=week_last.index)
spy_ma = spy_w.rolling(30).mean()

s1, s2_rows, allr = [], [], {}
for f in sorted(os.listdir(U)):
    sym = f[:-7]
    d = pd.read_csv(io.BytesIO(gzip.decompress(open(f"{U}/{f}", "rb").read())), parse_dates=["d"]).set_index("d")
    d = d[d.index.isin(days) & (d.c > 0) & (d.l > 0)]
    if len(d) < 2:
        continue
    dv = (d.c * d.v).rolling(50).mean()
    allr[sym] = (d.c / d.c.shift(63) - 1).where(dv >= 20e6)
    if sym not in want_syms:
        continue
    # ---- S1
    key = d.index - pd.to_timedelta(d.index.dayofweek, unit="D")
    g = d.groupby(key.values)
    w = pd.DataFrame({"c": g.c.last(), "h": g.h.max(), "v": g.v.sum(), "end": g.apply(lambda x: x.index.max(), include_groups=False)})
    ma = w.c.rolling(30).mean()
    spyc = spy.loc[w.end.values].values
    rs = w.c.values / spyc
    rsma = pd.Series(rs).rolling(52).mean().values
    vma = w.v.rolling(10).mean()
    for k in range(52, len(w)):
        wkey = w.index[k]
        if week_last.get(wkey) != w.end.iloc[k]:
            continue
        if not dv.loc[w.end.iloc[k]] >= 20e6:
            continue
        hi = w.h.iloc[k - 26:k].max(); hip = w.h.iloc[k - 27:k - 1].max()
        mrs = rs[k] / rsma[k] - 1
        if (w.c.iloc[k] > ma.iloc[k] and ma.iloc[k] > ma.iloc[k - 1] and w.c.iloc[k] > hi and w.c.iloc[k - 1] <= hip
                and w.v.iloc[k] >= 2 * vma.iloc[k - 1] and mrs > 0 and spy_w.loc[wkey] > spy_ma.loc[wkey]):
            s1.append([sym, str(w.end.iloc[k].date())])
    # ---- S2 (per-stock part; the top-3% cut needs all stocks: done below with ts's thresholds)
    adr = (d.h / d.l - 1).rolling(20).mean()
    s10, s20 = d.c.rolling(10).mean(), d.c.rolling(20).mean()
    r63 = d.c / d.c.shift(63) - 1
    hi10, lo10 = d.h.rolling(10).max(), d.l.rolling(10).min()
    ok = (dv >= 20e6) & (adr >= 0.04) & (r63 >= 0.3) & (d.c > s10) & (s10 > s20) & ((hi10 - lo10) / d.c <= 3 * adr)
    for t in d.index[ok.values]:
        s2_rows.append([sym, str(t.date()), float(r63.loc[t]), float(hi10.loc[t])])

R = pd.DataFrame(allr)
thr = {}
for t, row in R.iterrows():
    x = np.sort(row.dropna().values)
    if len(x):
        thr[str(t.date())] = x[min(len(x) - 1, int(np.floor(0.97 * len(x))))]
s2 = sorted([r[0], r[1]] for r in s2_rows if r[1] in thr and r[2] >= thr[r[1]])
a1, b1 = set(map(tuple, s1)), set(map(tuple, ts["s1"]))
a2, b2 = set(map(tuple, s2)), set(map(tuple, ts["s2"]))
print(f"S1: python {len(a1)}, ts {len(b1)}, both {len(a1 & b1)}; only python {sorted(a1 - b1)[:5]}; only ts {sorted(b1 - a1)[:5]}")
print(f"S2: python {len(a2)}, ts {len(b2)}, both {len(a2 & b2)}; only python {sorted(a2 - b2)[:5]}; only ts {sorted(b2 - a2)[:5]}")
lv = {(r[0], r[1]): r[3] for r in s2_rows}
bad = [k for k, v in ts["lvl"].items() if abs(lv.get(tuple(k.split("|")), -1) - v) > 1e-9]
print(f"S2 breakout levels differing: {len(bad)} {bad[:3]}")
