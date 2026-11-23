// experiments/vol-stocks-preregistration.md - each year's 20 most volatile liquid US stocks, chosen from the PREVIOUS year only.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const U = "data/universe/daily";
const picks: Record<string, string[]> = {};
const stats: Record<string, { sym: string; adr: number; dv: number; n: number }[]> = {};
for (const f of readdirSync(U)) {
  const rows = gunzipSync(readFileSync(`${U}/${f}`)).toString().trim().split("\n").slice(1).map((l) => l.split(","));
  const sym = f.replace(".csv.gz", "");
  const by = new Map<string, string[][]>();
  for (const r of rows) { const y = r[0]!.slice(0, 4); (by.get(y) ?? by.set(y, []).get(y)!).push(r); }
  for (const [y, rs] of by) {
    if (rs.length < (y === "2015" ? 100 : 200)) continue;
    const last50 = rs.slice(-50), dv = last50.reduce((a, r) => a + +r[4]! * +r[5]!, 0) / last50.length;
    if (dv < 100e6) continue;
    const adr = rs.reduce((a, r) => a + (+r[2]! / +r[3]! - 1), 0) / rs.length;
    (stats[y] ??= []).push({ sym, adr, dv, n: rs.length });
  }
}
for (let Y = 2016; Y <= 2026; Y++) picks[Y] = (stats[Y - 1] ?? []).sort((a, b) => b.adr - a.adr).slice(0, 20).map((x) => x.sym);
writeFileSync("scripts/vol-picks.json", JSON.stringify(picks, null, 1));
for (const [y, p] of Object.entries(picks)) console.log(y, p.join(" "));
