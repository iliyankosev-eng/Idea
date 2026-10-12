// Raw data for checking Telegram memecoin signals (Solana). Runs in GitHub Actions (the sandbox cannot reach these APIs).
// Usage: node scripts/probe-memecoins.mjs <outDir>. Signals are listed in scripts/memecoin-signals.json.
// Per token: DexScreener pairs, GeckoTerminal pools + 1-minute OHLCV (from 2 days before the signal to now), RugCheck summary.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "out";
mkdirSync(OUT, { recursive: true });
const signals = JSON.parse(readFileSync(new URL("./memecoin-signals.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { log.push(s); console.log(s); };

async function get(url, gap = 2500) {
  for (let a = 0; a < 5; a++) {
    await sleep(gap);
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 429) { await sleep(20_000 * (a + 1)); continue; }
      const t = await r.text();
      if (!r.ok) return { status: r.status, json: null, text: t.slice(0, 200) };
      return { status: r.status, json: JSON.parse(t) };
    } catch (e) { await sleep(5000); }
  }
  return { status: -1, json: null, text: "gave up" };
}

for (const s of signals) {
  const o = { ...s };
  const ds = await get(`https://api.dexscreener.com/latest/dex/tokens/${s.address}`, 500);
  o.dexscreener = ds.json?.pairs ?? null;
  if (!o.dexscreener?.length) {
    const q = await get(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(s.symbol)}`, 500);
    o.search = (q.json?.pairs ?? []).filter((p) => p.chainId === "solana").map((p) => ({ base: p.baseToken, pair: p.pairAddress, fdv: p.fdv, created: p.pairCreatedAt }));
  }
  const pools = await get(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${s.address}/pools?page=1`);
  o.gtPools = (pools.json?.data ?? []).map((p) => ({ address: p.attributes.address, name: p.attributes.name, dex: p.relationships?.dex?.data?.id, created: p.attributes.pool_created_at, reserveUsd: p.attributes.reserve_in_usd, volume24: p.attributes.volume_usd?.h24, base: p.relationships?.base_token?.data?.id }));
  const info = await get(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${s.address}/info`);
  o.gtInfo = info.json?.data?.attributes ?? null;
  const rug = await get(`https://api.rugcheck.xyz/v1/tokens/${s.address}/report/summary`, 500);
  o.rugcheck = rug.json ?? { status: rug.status, text: rug.text };
  // 1-minute candles of the pool with the most liquidity, paging backwards from now to 2 days before the signal
  const top = [...o.gtPools].sort((a, b) => Number(b.reserveUsd) - Number(a.reserveUsd))[0];
  o.candles = {};
  for (const p of [...o.gtPools].sort((a, b) => Number(b.reserveUsd) - Number(a.reserveUsd)).slice(0, 2)) {
    const from = Math.floor(Date.parse(s.postedUtc) / 1000) - 2 * 86400;
    let before = Math.floor(Date.now() / 1000), rows = [];
    for (let k = 0; k < 6 && before > from; k++) {
      const r = await get(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${p.address}/ohlcv/minute?aggregate=1&limit=1000&before_timestamp=${before}&currency=usd&token=${s.address}`); // price of THIS token (in some pools it is the quote token)
      const list = r.json?.data?.attributes?.ohlcv_list ?? [];
      if (!list.length) { if (!r.json) say(`${s.symbol} ${p.address} ohlcv HTTP ${r.status} ${r.text ?? ""}`); break; }
      rows = rows.concat(list);
      before = Math.min(...list.map((x) => x[0]));
    }
    o.candles[p.address] = rows.sort((a, b) => a[0] - b[0]);
  }
  writeFileSync(`${OUT}/${s.symbol}.json`, JSON.stringify(o));
  say(`${s.symbol}: dexscreener pairs ${o.dexscreener?.length ?? 0}, gt pools ${o.gtPools.length}, candles ${Object.values(o.candles).map((c) => c.length).join("/")}, top pool ${top?.address ?? "-"} (${top?.dex ?? ""})`);
}
writeFileSync(`${OUT}/LOG.txt`, log.join("\n") + "\n");
