/**
 * Paper-trading bot v2 (reports/bot-v2.md): DT3 (opening-range breakout on QQQ, skipped on FOMC days) on 25% of equity,
 * noise band (signal on QQQ, traded in QQQM so that it never mixes with DT3's QQQ position) on 25%, DT8 (RSI(2) on SPY) on 50%,
 * whose idle cash sits in BIL. Each intraday strategy is capped at 2x its capital; no new trades after a 15% drawdown.
 * Usage: npx tsx src/bot/run.ts open|nb|close|check   (GitHub Actions: .github/workflows/bot.yml)
 *  nb   : noise band check at every :00 and :30 from 10:00 to 15:30 New York. Start the job 2 minutes early (09:58, 10:28, ...):
 *         it waits for the exact minute, because a 2-minute delay costs a third of the edge in the backtest.
 *  open : DT3 as tested in reports/bot-reality.md: the 09:30-09:34 opening range from SIP (the free plan gets SIP with a
 *         15-minute delay, so it is known at 09:50), entry at ~09:50 with a bracket order (stop at the range extreme, 10R target),
 *         no trade if the stop was already touched 09:35-09:50 (IEX real-time bars). Also logs, without trading, what the
 *         09:35 plan from the real-time IEX feed would have been (shadow, for comparison).
 *  close: 5 minutes before the close: cancels the QQQ orders and closes the QQQ position (DT3 never holds overnight);
 *         then the DT8 decision with a plain market order, followed until it is filled (paper fills market-on-close orders
 *         only partly or not at all, see followDt8).
 *  check: no waiting and no orders: fetches the data both jobs need and prints the decisions they would take now (smoke test).
 * Safety: the trading endpoint is fixed to PAPER; without keys (or with DRY_RUN=1, or in check mode)
 * nothing is sent, orders are only logged; no new trades after a 20% drawdown from the equity high-water mark;
 * one order per strategy per day (client_order_id). News headlines are logged for context only: in the tests (reports/dt6.md)
 * news did not improve the opening-range breakout, so they do not change any decision.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Alpaca } from "./alpaca.js";
import { flatten } from "./flatten.js";
import { bilTarget, dt8Leftover, fillAction, halted, nbLeverage, nbOrders, noiseBand, orbPlan, rsiDecision, stopTouched, type Bar } from "./logic.js";

const CAP_DT3 = 0.25, CAP_NB = 0.25, MAX_LEV = 2, MAX_DD = 0.15, NB_SYM = "QQQM", CASH_SYM = "BIL";

const mode = process.argv[2] ?? "";
const LOGDIR = process.env.BOT_LOG_DIR ?? "botlog";
mkdirSync(LOGDIR, { recursive: true });
const ny = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour! * 60 + +p.minute!, sec: +p.second! };
};
const today = ny().date;
const log = (s: string) => { const line = `${new Date().toISOString()} [${mode}] ${s}`; console.log(line); appendFileSync(`${LOGDIR}/${today}.log`, line + "\n"); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Sleep until New York minute m (+ s seconds); false if it is already more than `grace` seconds past that moment. */
async function waitUntil(m: number, s = 0, grace = 600): Promise<boolean> {
  for (;;) {
    const t = ny(), now = t.min * 60 + t.sec, target = m * 60 + s;
    if (now > target + grace) return false;
    if (now >= target) return true;
    await sleep(Math.min(30_000, (target - now) * 1000));
  }
}
const toMin = (x: string) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
type RawBar = { t: string; o: number; h: number; l: number; c: number; v?: number };
const nyMin = (b: RawBar) => ny(new Date(b.t)).min;
const bar = (b: RawBar): Bar => ({ o: b.o, h: b.h, l: b.l, c: b.c });

// Keys: ALPACA_PAPER_KEY_ID / ALPACA_PAPER_SECRET_KEY if set, otherwise the repository's ALPACA_KEY_ID / ALPACA_SECRET_KEY.
// Either way the trading endpoint is the PAPER one: live keys do not authenticate there, so no real money can move.
const key = process.env.ALPACA_PAPER_KEY_ID || process.env.ALPACA_KEY_ID || "", secret = process.env.ALPACA_PAPER_SECRET_KEY || process.env.ALPACA_SECRET_KEY || "";
const paper = !!key && !!secret && process.env.DRY_RUN !== "1" && mode !== "check";
const api = new Alpaca(key, secret, !paper, log);
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const STATE = `${LOGDIR}/state.json`;
const state: { highWater: number } = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { highWater: 0 };

/** DT3 plan from the delayed SIP opening range + the real-time IEX bars after 09:35. */
async function dt3Plan(openMin: number, cap: number) {
  const sip = (await api.bars("QQQ", "1Min", `${today}T12:00:00Z`, new Date(Date.now() - 15.5 * 60_000).toISOString(), "sip")) as RawBar[];
  const first5 = sip.filter((b) => { const m = nyMin(b); return m >= openMin && m < openMin + 5; }).map(bar);
  const iex = (await api.bars("QQQ", "1Min", `${today}T12:00:00Z`, new Date().toISOString(), "iex")) as RawBar[];
  const after = iex.filter((b) => { const m = nyMin(b); return m >= openMin + 5 && m < ny().min; }).map(bar); // completed bars since 09:35
  const px = Number((await api.latestTrade("QQQ")).p);
  log(`DT3 data: SIP 09:30-09:34 ${JSON.stringify(first5.map((b) => [b.o, b.h, b.l, b.c]))}; IEX bars since 09:35: ${after.length}; QQQ now ${px}`);
  if (first5.length !== 5) return { plan: null, why: `only ${first5.length} SIP opening bars` };
  const plan = orbPlan(first5, px, cap, MAX_LEV);
  if (!plan) return { plan: null, why: "doji first 5 minutes or the price is already beyond the stop" };
  if (stopTouched(after, plan.side, plan.stop)) return { plan: null, why: `stop ${plan.stop} already touched after 09:35` };
  return { plan, why: "" };
}

async function main() {
  log(`start, ${paper ? "PAPER trading" : "DRY RUN (no orders are sent)"}`);
  const cal = (await api.calendar(today))?.[0];
  if (!cal || cal.date !== today) { log("market closed today, nothing to do"); return; }
  const openMin = toMin(cal.open), closeMin = toMin(cal.close);
  let equity = 100_000;
  if (paper) equity = Number((await api.account()).equity);
  state.highWater = Math.max(state.highWater, equity);
  if (paper) writeFileSync(STATE, JSON.stringify(state));
  const stop = halted(equity, state.highWater, MAX_DD);
  log(`session ${cal.open}-${cal.close}; equity ${equity.toFixed(2)}, high-water ${state.highWater.toFixed(2)}${stop ? " -> HALTED (drawdown > 15%): no new trades" : ""}`);

  if (mode === "check") {
    // read-only look at the paper account the bot will trade in (no account number is logged)
    try {
      const a = await api.account();
      log(`paper account: status ${a.status}, equity ${a.equity}, cash ${a.cash}, buying power ${a.buying_power}, multiplier ${a.multiplier}, shorting ${a.shorting_enabled}, pattern day trader ${a.pattern_day_trader}, trading blocked ${a.trading_blocked}`);
      const ps = (await api.positions()) as { symbol: string; qty: string }[];
      log(`open positions: ${ps.length ? ps.map((x) => `${x.symbol} ${x.qty}`).join(", ") : "none"}`);
      type O = { symbol: string; side: string; type: string; filled_qty: string; filled_avg_price: string | null; filled_at: string | null; client_order_id: string; legs?: O[] };
      const flat = (os: O[]): O[] => os.flatMap((o) => [o, ...flat(o.legs ?? [])]);
      const fills = flat((await api.closedOrders(new Date(Date.now() - 30 * 86400_000).toISOString())) as O[]).filter((o) => Number(o.filled_qty) > 0).sort((a, b) => (a.filled_at! < b.filled_at! ? -1 : 1));
      for (const o of fills) log(`fill ${o.filled_at} ${o.symbol} ${o.side} ${o.filled_qty} @ ${o.filled_avg_price} (${o.type}${o.client_order_id.startsWith("dt") ? ", " + o.client_order_id : ""})`);
      const allClosed = flat((await api.closedOrders(new Date(Date.now() - 7 * 86400_000).toISOString())) as (O & { status: string; submitted_at: string })[]) as (O & { status: string; submitted_at: string })[];
      for (const o of allClosed.filter((x) => Number(x.filled_qty) === 0)) log(`order not filled ${o.submitted_at} ${o.symbol} ${o.side} ${o.type} status ${o.status} (${o.client_order_id})`);
      const open = (await api.openOrders()) as { symbol: string; side: string; type: string; qty: string; status: string; time_in_force: string; client_order_id: string }[];
      log(`open orders: ${open.length ? open.map((o) => `${o.symbol} ${o.side} ${o.qty} ${o.type}/${o.time_in_force} ${o.status} (${o.client_order_id})`).join(", ") : "none"}`);
      type A = { activity_type: string; date?: string; transaction_time?: string; net_amount?: string; description?: string; symbol?: string };
      const acts = ((await api.activities(new Date(Date.now() - 30 * 86400_000).toISOString())) as A[]).filter((x) => x.activity_type !== "FILL");
      for (const x of acts) log(`activity ${x.date ?? x.transaction_time} ${x.activity_type} ${x.net_amount ?? ""}${x.symbol ? " " + x.symbol : ""}${x.description ? " (" + x.description.replace(/ by \S+$/, "") + ")" : ""}`);
      if (!acts.length) log("activity: no non-trade activities in the last 30 days");
    } catch (e) { log(`paper account not readable with these keys: ${e}`); }
    const t = ny();
    if (t.min >= openMin + 21) { const r = await dt3Plan(openMin, CAP_DT3 * equity); log(`DT3 now: ${r.plan ? JSON.stringify(r.plan) : "no trade, " + r.why}${fomc.has(today) ? " (FOMC day: would be skipped)" : ""}`); }
    else log("DT3 check needs the time after 09:51 New York");
    await dt8(equity, stop, false);
    for (const sym of [NB_SYM, CASH_SYM]) try { const a = await api.asset(sym); log(`asset ${sym}: tradable ${a.tradable}, shortable ${a.shortable}, easy to borrow ${a.easy_to_borrow}, marginable ${a.marginable}`); } catch (e) { log(`asset ${sym} not readable: ${e}`); }
    if (t.min >= 600 && closeMin === 960) { const m = Math.min(930, Math.floor(t.min / 30) * 30); try { const d = await nbDecision(m, await nbHistory(), equity); log(`NB now (check ${hhmm(m)}): ${d ? JSON.stringify(d) : "no decision (not enough data)"}`); } catch (e) { log(`NB check failed: ${e}`); } }
    return;
  }

  if (mode === "open") {
    const t = ny();
    if (t.min < openMin - 60 || t.min > openMin + 19) { log(`not the open window (New York ${hhmm(t.min)}), exit`); return; }
    if (paper) for (const sym of ["QQQ", NB_SYM]) { const left = await api.position(sym); if (left) { log(`WARNING: ${sym} position left from before (${left.qty}), closing it`); await flatten(api, sym, sleep, log); } }
    if (paper) { // DT8: the last DT8 order was a sell but SPY shares are still held (partial fill of the close order) -> sell the rest now
      const spy = await api.position("SPY");
      const last = ((await api.closedOrders(new Date(Date.now() - 60 * 86400_000).toISOString())) as { client_order_id: string; filled_qty: string }[]).filter((o) => o.client_order_id.startsWith("dt8-") && Number(o.filled_qty) > 0).at(-1);
      const q = dt8Leftover(last?.client_order_id, spy ? Number(spy.qty) : 0);
      if (q > 0) { log(`WARNING: ${q} SPY left after ${last!.client_order_id} (partial fill), selling them now`); await api.order({ symbol: "SPY", qty: String(q), side: "sell", type: "market", time_in_force: "day", client_order_id: `dt8-fix-${today}` }); }
    }
    try { for (const n of (await api.news("QQQ", new Date(Date.now() - 18 * 3600_000).toISOString())).slice(0, 5)) log(`news ${n.created_at} ${n.headline}`); } catch (e) { log(`news unavailable: ${e}`); }
    if (fomc.has(today)) { log("FOMC statement day -> DT3 skipped (rule from reports/dt6.md)"); return; }
    if (closeMin !== 16 * 60) { log(`early close at ${cal.close} -> DT3 skipped (the close job runs at 15:25 and could not flatten QQQ)`); return; }
    if (stop) return;
    // shadow: the original 09:35 plan from the real-time IEX feed (logged only)
    if (await waitUntil(openMin + 5, 5, 120)) {
      try {
        const iex = (await api.bars("QQQ", "1Min", `${today}T12:00:00Z`, new Date().toISOString(), "iex")) as RawBar[];
        const f5 = iex.filter((b) => { const m = nyMin(b); return m >= openMin && m < openMin + 5; }).map(bar);
        const px = Number((await api.latestTrade("QQQ")).p);
        log(`shadow DT3 09:35 from IEX (not traded): ${f5.length === 5 ? JSON.stringify(orbPlan(f5, px, CAP_DT3 * equity, MAX_LEV)) : `only ${f5.length} bars`}`);
      } catch (e) { log(`shadow failed: ${e}`); }
    }
    if (!(await waitUntil(openMin + 20, 35, 240))) { log("too late for the 09:50 entry, DT3 skipped today"); return; }
    const r = await dt3Plan(openMin, CAP_DT3 * equity);
    if (!r.plan) { log(`DT3: no trade, ${r.why}`); return; }
    log(`DT3 plan ${JSON.stringify(r.plan)}`);
    await api.order({ symbol: "QQQ", qty: String(r.plan.qty), side: r.plan.side, type: "market", time_in_force: "day", order_class: "bracket",
      take_profit: { limit_price: r.plan.target.toFixed(2) }, stop_loss: { stop_price: r.plan.stop.toFixed(2) }, client_order_id: `dt3-${today}` });
    return;
  }

  if (mode === "nb") {
    const t = ny(), sec = t.min * 60 + t.sec, m = Math.round(sec / 1800) * 30;
    if (m < 600 || m > 930 || Math.abs(sec - m * 60) > 240) { log(`not a noise-band check time (New York ${hhmm(t.min)}), exit`); return; }
    if (closeMin !== 16 * 60) { log(`early close at ${cal.close} -> noise band skipped`); return; }
    const hist = await nbHistory(); // before the wait: the slow part
    if (!(await waitUntil(m, 1, 200))) { log(`too late for the ${hhmm(m)} check, skipped`); return; }
    const d = await nbDecision(m, hist, equity);
    if (!d) { log(`NB ${hhmm(m)}: no decision (not enough data)`); return; }
    const cur = paper ? Number((await api.position(NB_SYM))?.qty ?? 0) : 0;
    const want = stop && Math.sign(cur) !== d.want ? 0 : d.want; // halted: exits only
    const orders = nbOrders(cur, want, d.qty);
    log(`NB ${hhmm(m)}: ${JSON.stringify(d)}; ${NB_SYM} position ${cur}${stop ? " (halted: exits only)" : ""} -> orders ${JSON.stringify(orders)}`);
    for (let k = 0; k < orders.length; k++) {
      const q = orders[k]!;
      await api.order({ symbol: NB_SYM, qty: String(Math.abs(q)), side: q > 0 ? "buy" : "sell", type: "market", time_in_force: "day", client_order_id: `nb-${today}-${hhmm(m).replace(":", "")}-${k}` });
      if (paper && k < orders.length - 1) { // wait until the closing order is filled before opening the other side
        let flat = false;
        for (let i = 0; i < 20 && !flat; i++) { await sleep(1500); flat = Number((await api.position(NB_SYM))?.qty ?? 0) === 0; }
        if (!flat) { log(`ERROR: ${NB_SYM} not flat after the closing order, the new side is not opened`); process.exitCode = 1; return; }
      }
    }
    return;
  }

  if (mode === "close") {
    const t = ny();
    // a backup start at 15:55 (cron-job.org) must still flatten and run DT8, so the job may start until close - 4
    if (t.min < closeMin - 50 || t.min > closeMin - 4) { log(`not the close window (New York ${hhmm(t.min)}, close ${cal.close}), exit`); return; }
    // DT3 never holds overnight: flatten QQQ 5 minutes before the close
    if (await waitUntil(closeMin - 5, 0, 240)) {
      try { // an error here must not stop DT8 below (2026-11-03: the close failed and DT8 never ran)
        const q = paper ? await api.position("QQQ") : null;
        if (q) await flatten(api, "QQQ", sleep, log);
        else { await api.cancelOpenOrders("QQQ"); log("no QQQ position to close"); }
      } catch (e) { log(`QQQ flatten ERROR ${e}`); process.exitCode = 1; }
      try { // noise band: also flat overnight
        const q = paper ? await api.position(NB_SYM) : null;
        if (q) await flatten(api, NB_SYM, sleep, log); else log(`no ${NB_SYM} position to close`);
      } catch (e) { log(`${NB_SYM} flatten ERROR ${e}`); process.exitCode = 1; }
    } else { log("missed the QQQ flatten window"); process.exitCode = 1; }
    // DT8 right after, with a plain market order (paper fills market-on-close orders only partly or not at all:
    // 20.10 26 of 65, 30.10 0 of 66 expired); partial fills are followed up until 45 s before the close
    const t2 = ny();
    if (t2.min * 60 + t2.sec <= (closeMin - 2) * 60) {
      try {
        const r = await dt8(equity, stop, true);
        if (r.order && paper) await followDt8(r.order, closeMin);
        try { // idle DT8 cash -> BIL
          const px = Number((await api.latestTrade(CASH_SYM)).p), held = paper ? Number((await api.position(CASH_SYM))?.qty ?? 0) : 0;
          const b = bilTarget(r.inSpy, equity, px, held);
          log(`${CASH_SYM}: price ${px}, held ${held}, target ${b.target}, order ${b.delta}`);
          if (b.delta !== 0) await api.order({ symbol: CASH_SYM, qty: String(Math.abs(b.delta)), side: b.delta > 0 ? "buy" : "sell", type: "market", time_in_force: "day", client_order_id: `bil-${today}` });
        } catch (e) { log(`${CASH_SYM} ERROR ${e}`); process.exitCode = 1; }
      } catch (e) { log(`DT8 ERROR ${e}`); process.exitCode = 1; }
    } else log("missed the DT8 decision window");
    if (paper) { // alarm: nothing intraday may stay open (a failed run opens a GitHub issue, see bot.yml)
      await sleep(5000);
      for (const sym of ["QQQ", NB_SYM]) { const left = await api.position(sym); if (left && Number(left.qty) !== 0) { log(`ALARM: ${sym} ${left.qty} still open after the close job`); process.exitCode = 1; } }
    }
    return;
  }
  log(`unknown mode "${mode}" (use open, close or check)`);
  process.exitCode = 1;
}

/** DT8: RSI(2) < 10 and above SMA(200) -> buy at the close; in position and above SMA(5) -> sell at the close. */
async function dt8(equity: number, stop: boolean, trade: boolean): Promise<{ order: { id: string; side: "buy" | "sell"; qty: number } | null; inSpy: boolean }> {
  const hist = (await api.bars("SPY", "1Day", new Date(Date.now() - 420 * 86400_000).toISOString().slice(0, 10), `${today}T00:00:00Z`, "sip", "all")) as RawBar[];
  const closes = hist.filter((b) => b.t.slice(0, 10) < today).map((b) => b.c);
  const px = Number((await api.latestTrade("SPY")).p);
  const pos = key && secret ? await api.position("SPY") : null; // read-only, also in check mode
  const inPos = !!pos && Number(pos.qty) > 0;
  const d = rsiDecision([...closes, px], inPos);
  log(`DT8: ${closes.length} daily closes (last ${hist.at(-1)?.t?.slice(0, 10)}), SPY now ${px}, in position ${inPos}, decision ${d}`);
  if (!trade) return { order: null, inSpy: inPos };
  const o = d === "buy" && !stop ? { id: `dt8-buy-${today}`, side: "buy" as const, qty: Math.floor((0.5 * equity) / px) }
    : d === "sell" && pos ? { id: `dt8-sell-${today}`, side: "sell" as const, qty: Number(pos.qty) } : null;
  if (!o || !(o.qty > 0)) return { order: null, inSpy: inPos };
  await api.order({ symbol: "SPY", qty: String(o.qty), side: o.side, type: "market", time_in_force: "day", client_order_id: o.id });
  return { order: o, inSpy: o.side === "buy" };
}

// ---------------- noise band ----------------
type MinBar = { min: number; o: number; h: number; l: number; c: number; v: number };
/** SIP minute bars of the last weeks (regular session), by New York date. SIP is delayed 15 minutes on the free plan. */
async function nbHistory(): Promise<Map<string, MinBar[]>> {
  const raw = (await api.bars("QQQ", "1Min", new Date(Date.now() - 32 * 86400_000).toISOString(), new Date(Date.now() - 15.5 * 60_000).toISOString(), "sip")) as RawBar[];
  const by = new Map<string, MinBar[]>();
  for (const b of raw) { const t = ny(new Date(b.t)); if (t.min < 570 || t.min >= 960) continue; if (!by.has(t.date)) by.set(t.date, []); by.get(t.date)!.push({ min: t.min, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 }); }
  return by;
}
/** The decision of the check at minute m: bands from the last 14 sessions, today's open from SIP, VWAP from SIP + (scaled) IEX bars, price = latest trade. */
async function nbDecision(m: number, hist: Map<string, MinBar[]>, equity: number) {
  const past = [...hist.entries()].filter(([d, bs]) => d < today && bs[0]!.min === 570).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-15);
  const sipToday = hist.get(today) ?? [];
  if (past.length < 15 || sipToday[0]?.min !== 570) return null;
  const closes = past.map(([, bs]) => bs[bs.length - 1]!.c);
  const pastMoves = past.slice(1).flatMap(([, bs]) => { const b = bs.find((x) => x.min === m - 1); return b ? [Math.abs(b.c / bs[0]!.o - 1)] : []; });
  const iex = ((await api.bars("QQQ", "1Min", `${today}T12:00:00Z`, new Date().toISOString(), "iex")) as RawBar[]).map((b) => ({ min: ny(new Date(b.t)).min, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 })).filter((b) => b.min >= 570 && b.min < m);
  const sipMin = new Set(sipToday.map((b) => b.min));
  const overlapIex = iex.filter((b) => sipMin.has(b.min)).reduce((a, b) => a + b.v, 0), overlapSip = sipToday.filter((b) => b.min < m).reduce((a, b) => a + b.v, 0);
  const scale = overlapIex > 0 ? overlapSip / overlapIex : 1; // IEX carries a few percent of the volume
  let pv = 0, v = 0;
  for (const b of sipToday) if (b.min < m) { pv += ((b.h + b.l + b.c) / 3) * b.v; v += b.v; }
  for (const b of iex) if (!sipMin.has(b.min)) { pv += ((b.h + b.l + b.c) / 3) * b.v * scale; v += b.v * scale; }
  const price = Number((await api.latestTrade("QQQ")).p), px = Number((await api.latestTrade(NB_SYM)).p);
  const nb = noiseBand({ open: sipToday[0]!.o, prevClose: closes[closes.length - 1]!, pastMoves, price, vwap: v > 0 ? pv / v : NaN });
  if (!nb) return null;
  const lev = nbLeverage(closes, MAX_LEV);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { want: nb.want, price, ub: r2(nb.ub), lb: r2(nb.lb), vwap: r2(pv / v), lev: r2(lev), qty: px > 0 ? Math.floor((lev * CAP_NB * equity) / px) : 0, days: pastMoves.length };
}

/** Follow a DT8 order until it is filled; send the rest again if paper cancels/expires it partly filled (see fillAction). */
async function followDt8(first: { id: string; side: "buy" | "sell"; qty: number }, closeMin: number) {
  let cur = first, resends = 0;
  for (;;) {
    await sleep(15_000);
    const o = await api.orderByClientId(cur.id);
    const t = ny(), a = fillAction({ status: o.status, qty: cur.qty, filled: Number(o.filled_qty) }, closeMin * 60 - (t.min * 60 + t.sec), resends);
    if (a.act === "done") { log(`DT8 ${cur.id}: ${o.status} ${o.filled_qty} @ ${o.filled_avg_price}`); return; }
    if (a.act === "give-up") { log(`WARNING: DT8 ${cur.id} ${o.status}: ${a.missing} of ${cur.qty} not filled${first.side === "sell" ? " (the open job sells the rest)" : ""}`); return; }
    if (a.act === "resend") {
      resends++;
      const id = `${first.id}-r${resends}`;
      log(`DT8 ${cur.id} ${o.status} with ${a.qty} unfilled -> sending the rest again`);
      await api.order({ symbol: "SPY", qty: String(a.qty), side: first.side, type: "market", time_in_force: "day", client_order_id: id });
      cur = { id, side: first.side, qty: a.qty };
    }
  }
}

main().catch((e) => { log(`ERROR ${e?.message ?? e}`); process.exitCode = 1; });
