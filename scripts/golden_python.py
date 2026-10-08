"""Independent reference implementation (plain Python, no shared code with the TypeScript engine).

Produces test/fixtures/golden.json. The TypeScript engine must reproduce these numbers.
The logic mirrors the scripts whose results are quoted in the plan document:
- S&P 500: Shiller monthly averages, decision on month k-2 for month k (lag 1), 0.1% cost per switch.
- Crypto: CoinMetrics daily, decision on day t-2 for day t (lag 1), 0.2% cost per switch, cash 0%.
Usage: python3 -I scripts/golden_python.py data/sp500.csv data/btc.csv data/eth.csv > test/fixtures/golden.json
"""
import csv, json, math, sys


def stats(rs, ppy):
    eq = pk = 1.0; md = 0.0
    for x in rs:
        eq *= 1 + x; pk = max(pk, eq); md = min(md, eq / pk - 1)
    yrs = len(rs) / ppy
    m = sum(rs) / len(rs)
    sd = math.sqrt(sum((x - m) ** 2 for x in rs) / (len(rs) - 1))
    return {"cagr": (eq ** (1 / yrs) - 1) * 100, "vol": sd * math.sqrt(ppy) * 100,
            "maxDrawdown": md * 100, "sharpe": m / sd * math.sqrt(ppy) if sd else 0.0, "periods": len(rs)}


def sp500_case(path, n, cash_mode, start="1881-01", end="2023-06", cost=0.001):
    rows = []
    for r in csv.DictReader(open(path)):
        if r["Date"] >= "2023-07-01":
            break
        rows.append((r["Date"][:7], float(r["SP500"]), float(r["Dividend"]), float(r["Long Interest Rate"])))
    bh, tf = [], []; prev = None
    for k in range(1, len(rows)):
        if not (start <= rows[k][0] <= end) or k - 2 < n:
            continue
        sr = rows[k][1] / rows[k - 1][1] - 1 + rows[k][2] / 12 / rows[k - 1][1]
        sma = sum(rows[j][1] for j in range(k - 1 - n, k - 1)) / n      # n months ending k-2
        inv = rows[k - 2][1] > sma
        cash = 0.0 if cash_mode == "zero" else rows[k - 1][3] / 100 / 12
        r = sr if inv else cash
        if prev is not None and inv != prev:
            r -= cost
        prev = inv
        bh.append(sr); tf.append(r)
    return {"bh": stats(bh, 12), "tf": stats(tf, 12)}


def crypto_case(path, n, start, end, cost=0.002):
    d = [(r["time"], float(r["PriceUSD"])) for r in csv.DictReader(open(path)) if r.get("PriceUSD")]
    dates = [a for a, _ in d]; px = [b for _, b in d]
    pos = [0] * len(px)
    for i in range(n - 1, len(px)):
        pos[i] = 1 if px[i] > sum(px[i - n + 1:i + 1]) / n else 0          # SMA incl. day i
    bh, tf = [], []; prev = None
    for t in range(2, len(px)):
        if not (start <= dates[t] <= end):
            continue
        p = pos[t - 2]
        r = px[t] / px[t - 1] - 1
        rt = r * p
        if prev is not None and p != prev:
            rt -= cost
        prev = p
        bh.append(r); tf.append(rt)
    return {"bh": stats(bh, 365), "tf": stats(tf, 365)}


sp, btc, eth = sys.argv[1], sys.argv[2], sys.argv[3]
out = {
    "sp500_sma10_long10y": sp500_case(sp, 10, "long"),
    "sp500_sma10_zero": sp500_case(sp, 10, "zero"),
    "sp500_sma12_long10y": sp500_case(sp, 12, "long"),
    "sp500_sma10_long10y_2010": sp500_case(sp, 10, "long", start="2010-01"),
    "btc_sma100_2015_2020": crypto_case(btc, 100, "2015-01-01", "2020-12-31"),
    "btc_sma100_2021_end": crypto_case(btc, 100, "2021-01-01", "9999-12-31"),
    "btc_sma50_2021_end": crypto_case(btc, 50, "2021-01-01", "9999-12-31"),
    "eth_sma200_2021_end": crypto_case(eth, 200, "2021-01-01", "9999-12-31"),
}
json.dump(out, sys.stdout, indent=1)
