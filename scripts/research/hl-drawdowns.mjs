import { readFileSync, readdirSync } from "node:fs";
const n = Number, d = (t) => new Date(t).toISOString().slice(0, 10);
for (const file of readdirSync(`${process.argv[2]}/hl`).sort()) {
  const w = JSON.parse(readFileSync(`${process.argv[2]}/hl/${file}`, "utf8"));
  const out = [];
  for (const per of ["allTime", "perpAllTime"]) {
    const v = w.portfolio.find((p) => p[0] === per)[1];
    const pnl = v.pnlHistory.map(([t, x]) => [t, n(x)]), av = v.accountValueHistory.map(([t, x]) => [t, n(x)]);
    let peak = -Infinity, pt = 0, mdd = 0, from = "", to = "";
    for (const [t, x] of pnl) { if (x > peak) { peak = x; pt = t; } if (x - peak < mdd) { mdd = x - peak; from = d(pt); to = d(t); } }
    const maxAv = Math.max(...av.map((a) => a[1]));
    out.push(`${per}: peak pnl ${Math.round(peak)}, max $ drop ${Math.round(mdd)} (${from} -> ${to}), max account value ${Math.round(maxAv)}`);
  }
  // realized net per fill-month, last fill date
  const f = w.fills; const last = f.length ? d(f.at(-1).time) : "-";
  console.log(file, "last fill", last, "\n  " + out.join("\n  "));
}
