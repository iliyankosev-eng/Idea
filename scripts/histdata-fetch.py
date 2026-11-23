#!/usr/bin/env python3
"""HistData.com free 1-minute BID bars -> <out>/<SYMBOL>/<YYYY>.csv.gz with header t,o,h,l,c,ask_c (ask_c empty: HistData has
no ask; no volume either). HistData time stamps are New York standard time WITHOUT daylight saving (always UTC-5); they are
converted to UTC here. Runs in GitHub Actions (the sandbox cannot reach histdata.com). Stdlib only.
Usage: histdata-fetch.py OUT FIRST_YEAR LAST_FULL_YEAR CURRENT_YEAR LAST_MONTH SYMBOL[,SYMBOL...]
Full years are one zip each; the current year is one zip per month (that is how the site serves them).
"""
import datetime as dt, gzip, io, os, re, sys, time, urllib.parse, urllib.request, zipfile

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}

def get_zip(sym, year, month=None):
    ref = f"https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/{sym.lower()}/{year}" + (f"/{month}" if month else "")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(ref, headers=UA), timeout=60) as r:
                page = r.read().decode("utf8", "replace")
            m = re.search(r'id="tk"[^>]*value="([^"]+)"', page) or re.search(r'value="([^"]+)"[^>]*id="tk"', page)
            if not m:
                return None, "no token on page"
            form = {"tk": m.group(1), "date": str(year), "datemonth": f"{year}{month:02d}" if month else str(year),
                    "platform": "ASCII", "timeframe": "M1", "fxpair": sym.upper()}
            req = urllib.request.Request("https://www.histdata.com/get.php", data=urllib.parse.urlencode(form).encode(),
                                         headers={**UA, "Referer": ref, "Origin": "https://www.histdata.com",
                                                  "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = r.read()
            z = zipfile.ZipFile(io.BytesIO(raw))
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            return z.read(name).decode("ascii", "replace"), None
        except Exception as e:  # retry slowly; the site is a single small server
            err = f"{type(e).__name__} {e}"
            time.sleep(10 * (attempt + 1))
    return None, err

def rows_of(text):
    out = []
    for ln in text.splitlines():
        p = ln.strip().split(";")
        if len(p) < 5 or len(p[0]) != 15:
            continue
        t = dt.datetime.strptime(p[0], "%Y%m%d %H%M%S") + dt.timedelta(hours=5)  # fixed UTC-5 -> UTC
        out.append(f"{t:%Y-%m-%dT%H:%M},{p[1]},{p[2]},{p[3]},{p[4]},")
    return out

def main():
    out, y0, y1, ycur, mlast, syms = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6].split(",")
    log = []
    for sym in syms:
        os.makedirs(f"{out}/{sym}", exist_ok=True)
        jobs = [(y, None) for y in range(y0, y1 + 1)] + [(ycur, m) for m in range(1, mlast + 1)]
        cur = {}
        for y, m in jobs:
            text, err = get_zip(sym, y, m)
            time.sleep(2)
            if text is None:
                log.append(f"{sym} {y}{'' if m is None else f'-{m:02d}'}: FAILED {err}")
                print(log[-1], flush=True)
                continue
            rows = rows_of(text)
            log.append(f"{sym} {y}{'' if m is None else f'-{m:02d}'}: {len(rows)} minutes; first {rows[0] if rows else '-'}; last {rows[-1] if rows else '-'}")
            print(log[-1], flush=True)
            for r in rows:  # file by UTC year (the +5h shift moves the last evening of a year into the next one)
                cur.setdefault(r[:4], []).append(r)
        for yy, rows in cur.items():
            rows = sorted(set(rows))
            with gzip.open(f"{out}/{sym}/{yy}.csv.gz", "wt") as f:
                f.write("t,o,h,l,c,ask_c\n" + "\n".join(rows) + "\n")
    with open(f"{out}/LOG.txt", "a") as f:
        f.write("\n".join(log) + "\n")

main()
