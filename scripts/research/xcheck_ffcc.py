# independent re-implementation from the pre-registration text
import json, sys, math
from collections import defaultdict
data = json.load(open(sys.argv[1])); bad = 0; n = 0
for case in data:
    s = case["s"]; M = s["minute"]
    cs = []
    for i, m in enumerate(M):
        if m < 570 or m >= 960: continue
        st = 570 + (m - 570) // 5 * 5
        if cs and cs[-1]["start"] == st:
            c = cs[-1]; c["h"] = max(c["h"], s["h"][i]); c["l"] = min(c["l"], s["l"][i]); c["c"] = s["c"][i]; c["idx"].append(i)
        else: cs.append({"start": st, "o": s["o"][i], "h": s["h"][i], "l": s["l"][i], "c": s["c"][i], "idx": [i]})
    vol = defaultdict(float); tot = 0.0
    def levels():
        if tot == 0: return None
        lo, hi = min(vol), max(vol)
        poc = max(sorted(vol), key=lambda r: (vol[r], -r))
        a = b = poc; inside = vol[poc]
        while inside < 0.7 * tot - 1e-9 and (a > lo or b < hi):
            up = vol.get(b + 1, 0.0) if b < hi else -1; dn = vol.get(a - 1, 0.0) if a > lo else -1
            if up >= dn: b += 1; inside += up
            else: a -= 1; inside += dn
        return poc / 100, b / 100, a / 100
    trades = []; op = None; bodies = []
    sh = {"on": False, "ext": 0, "k": 0}; lg = {"on": False, "ext": 0, "k": 0}
    for k, c in enumerate(cs):
        lv = levels()
        if op:
            ex = None
            if c["start"] >= 955: ex = c["o"]
            elif (c["h"] >= op["stop"] if op["d"] == -1 else c["l"] <= op["stop"]): ex = op["stop"]
            elif (c["l"] <= op["tg"] if op["d"] == -1 else c["h"] >= op["tg"]): ex = op["tg"]
            if ex is not None:
                trades.append([op["d"], op["e"], round(ex, 6)]); op = None
        rec = bodies[-20:]; avg = sum(rec) / len(rec) if len(rec) >= 6 else float("nan")
        if lv and c["start"] >= 600 and c["start"] + 5 <= 900:
            poc, vah, val = lv; p = cs[k - 1]
            if c["h"] > vah and (not sh["on"] or c["h"] > sh["ext"]): sh.update(on=True, ext=c["h"], k=k)
            elif sh["on"] and k - sh["k"] <= 6:
                if c["c"] < c["o"] and c["o"] - c["c"] >= 1.5 * avg and c["c"] < p["l"] and c["c"] < vah and op is None:
                    e = c["c"]; stp = sh["ext"] + 0.01; tg = e - 1.5 * (stp - e)
                    if stp > e and tg < e: op = {"d": -1, "e": e, "stop": stp, "tg": tg}
                    sh["on"] = False
            elif sh["on"]: sh["on"] = False
            if c["l"] < val and (not lg["on"] or c["l"] < lg["ext"]): lg.update(on=True, ext=c["l"], k=k)
            elif lg["on"] and k - lg["k"] <= 6:
                if c["c"] > c["o"] and c["c"] - c["o"] >= 1.5 * avg and c["c"] > p["h"] and c["c"] > val and op is None:
                    e = c["c"]; stp = lg["ext"] - 0.01; tg = e + 1.5 * (e - stp)
                    if stp < e and tg > e: op = {"d": 1, "e": e, "stop": stp, "tg": tg}
                    lg["on"] = False
            elif lg["on"]: lg["on"] = False
        bodies.append(abs(c["c"] - c["o"]))
        for i in c["idx"]:
            v = (s["v"][i] or 0)
            if v > 0:
                a_, b_ = round(s["l"][i] * 100), round(s["h"][i] * 100)
                for r in range(a_, b_ + 1): vol[r] += v / (b_ - a_ + 1)
                tot += v
    if op: trades.append([op["d"], op["e"], cs[-1]["c"], None])
    ts = [[t["dir"], t["entry"], round(t["exit"], 6)] for t in case["t"]]
    py = [t[:3] for t in trades]
    n += 1
    if ts != py: bad += 1; print("DIFF", ts[:3], py[:3])
print(f"sessions {n}, differing {bad}, trades ts {sum(len(c['t']) for c in data)}")
