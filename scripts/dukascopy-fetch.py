#!/usr/bin/env python3
"""Dukascopy 1-minute candles (BID and ASK) -> <out>/<SYMBOL>/<YYYY>.csv.gz with rows: utc_minute_iso,o,h,l,c (BID) + ask close.
Runs in GitHub Actions (the sandbox cannot reach datafeed.dukascopy.com). Stdlib only.
Usage: dukascopy-fetch.py OUT START(YYYY-MM-DD) END(YYYY-MM-DD) SYMBOL[,SYMBOL...]   or   dukascopy-fetch.py OUT probe
Format of BID_candles_min_1.bi5 (LZMA): 24-byte records, big-endian: int32 seconds from day start (UTC), int32 open, close, low, high
(in points), float32 volume. Days are folders /YYYY/MM-1/DD/.
"""
import concurrent.futures as cf, datetime as dt, gzip, io, lzma, os, struct, sys, time, urllib.request, urllib.error

POINT = {"XAUUSD": 1e-3, "EURUSD": 1e-5, "GBPUSD": 1e-5, "USDJPY": 1e-3,
         "USA500IDXUSD": 1e-3, "USATECHIDXUSD": 1e-3, "DEUIDXEUR": 1e-3, "GBRIDXGBP": 1e-3}

ERRORS = []

def fetch(sym, day, side, tries=6):
    url = f"https://datafeed.dukascopy.com/datafeed/{sym}/{day.year}/{day.month - 1:02d}/{day.day:02d}/{side}_candles_min_1.bi5"
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
                raw = r.read()
            if not raw:
                return []
            data = lzma.decompress(raw)
            out = []
            for k in range(0, len(data) - 23, 24):
                t, o, c, lo, hi, v = struct.unpack(">5if", data[k:k + 24])
                out.append((t, o, hi, lo, c, v))
            return out
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            ERRORS.append(f"{url}: HTTP {e.code}")
            time.sleep(2 + attempt * 3)
        except Exception as e:
            ERRORS.append(f"{url}: {type(e).__name__} {e}")
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"failed {url}")

def day_rows(sym, day):
    tries = 2 if sys.argv[2] == "probe" else 6
    bid, ask = fetch(sym, day, "BID", tries), fetch(sym, day, "ASK", tries)
    if not bid:
        return day, [], bid is None
    p = POINT[sym]
    askc = {r[0]: r[4] for r in (ask or [])}
    base = dt.datetime(day.year, day.month, day.day, tzinfo=dt.timezone.utc)
    rows = []
    for t, o, h, l, c, v in bid:
        if v <= 0:  # Dukascopy fills closed minutes with flat zero-volume candles: skip them
            continue
        a = askc.get(t)
        ts = (base + dt.timedelta(seconds=t)).strftime("%Y-%m-%dT%H:%M")
        rows.append(f"{ts},{o * p:.6g},{h * p:.6g},{l * p:.6g},{c * p:.6g},{'' if a is None else f'{a * p:.6g}'}")
    return day, rows, False

def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    log = []
    if sys.argv[2] == "probe":
        for sym in POINT:
            try:
                d, rows, missing = day_rows(sym, dt.date(2024, 3, 5))
                log.append(f"{sym}: {'404' if missing else len(rows)} minutes; first {rows[:2]}; at 14:30 UTC {[r for r in rows if r.startswith('2024-03-05T14:30')]}")
            except Exception as e:
                log.append(f"{sym}: FAILED {e}")
        log.extend(sorted(set(ERRORS))[:20])
    else:
        a, b = dt.date.fromisoformat(sys.argv[2]), dt.date.fromisoformat(sys.argv[3])
        for sym in sys.argv[4].split(","):
            for year in range(a.year, b.year + 1):
                path = f"{out}/{sym}/{year}.csv.gz"
                if os.path.exists(path):
                    continue
                days = [d for d in (dt.date(year, 1, 1) + dt.timedelta(n) for n in range(366)) if d.year == year and a <= d <= b and d.weekday() != 5]
                res = {}
                with cf.ThreadPoolExecutor(8) as ex:
                    for d, rows, _ in ex.map(lambda d: day_rows(sym, d), days):
                        res[d] = rows
                rows = [r for d in sorted(res) for r in res[d]]
                os.makedirs(f"{out}/{sym}", exist_ok=True)
                with gzip.open(path, "wt") as f:
                    f.write("t,o,h,l,c,ask_c\n" + "\n".join(rows) + "\n")
                log.append(f"{sym} {year}: {len(rows)} minutes, {sum(1 for d in res if res[d])} days with data; first {rows[0] if rows else '-'}; last {rows[-1] if rows else '-'}")
                print(log[-1], flush=True)
    with open(f"{out}/LOG.txt", "a") as f:
        f.write("\n".join(log) + "\n")
    print("\n".join(log))

main()
