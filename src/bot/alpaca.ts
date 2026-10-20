// Minimal Alpaca REST client for the bot. The trading endpoint is FIXED to paper trading.
// Keys come from the environment (GitHub secrets ALPACA_PAPER_KEY_ID / ALPACA_PAPER_SECRET_KEY); they are never printed.
export const PAPER = "https://paper-api.alpaca.markets";
const DATA = "https://data.alpaca.markets";

export class Alpaca {
  constructor(private readonly key: string, private readonly secret: string, private readonly dryRun: boolean, private readonly log: (s: string) => void) {}
  private async req(base: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
    const r = await fetch(base + path, {
      method: init.method ?? "GET",
      headers: { "APCA-API-KEY-ID": this.key, "APCA-API-SECRET-KEY": this.secret, "content-type": "application/json" },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${r.status} ${t.slice(0, 200)}`);
    return t ? JSON.parse(t) : null;
  }
  // ----- market data -----
  /** Bars with pagination. feed "iex" = real time (free plan); "sip" = all exchanges, the free plan only allows end >= 15 minutes ago. */
  async bars(sym: string, timeframe: string, start: string, end: string, feed: "iex" | "sip", adjustment = "raw"): Promise<unknown[]> {
    const out: unknown[] = [];
    let token = "";
    do {
      const j = await this.req(DATA, `/v2/stocks/${sym}/bars?timeframe=${timeframe}&start=${start}&end=${end}&feed=${feed}&adjustment=${adjustment}&limit=10000${token ? `&page_token=${token}` : ""}`);
      out.push(...(j.bars ?? []));
      token = j.next_page_token ?? "";
    } while (token);
    return out;
  }
  /** Latest trade on IEX (real time on the free plan). */
  latestTrade(sym: string) { return this.req(DATA, `/v2/stocks/${sym}/trades/latest?feed=iex`).then((j) => j.trade); }
  news(sym: string, startIso: string) { return this.req(DATA, `/v1beta1/news?symbols=${sym}&start=${startIso}&limit=20&sort=desc`).then((j) => j.news ?? []); }
  // ----- trading (paper) -----
  clock() { return this.req(PAPER, "/v2/clock"); }
  calendar(date: string) { return this.req(PAPER, `/v2/calendar?start=${date}&end=${date}`); }
  account() { return this.req(PAPER, "/v2/account"); }
  positions() { return this.req(PAPER, "/v2/positions"); }
  /** Closed orders since `afterIso` (oldest first), legs nested. Read-only. */
  closedOrders(afterIso: string) { return this.req(PAPER, `/v2/orders?status=closed&after=${afterIso}&limit=500&direction=asc&nested=true`); }
  async position(sym: string): Promise<{ qty: string; side: string } | null> {
    try { return await this.req(PAPER, `/v2/positions/${sym}`); } catch (e) { if (String(e).includes("HTTP 404")) return null; throw e; }
  }
  async order(body: Record<string, unknown>) {
    this.log(`ORDER ${this.dryRun ? "(dry run, not sent) " : ""}${JSON.stringify(body)}`);
    return this.dryRun ? null : this.req(PAPER, "/v2/orders", { method: "POST", body });
  }
  async cancelOpenOrders(sym: string) {
    const open = await this.req(PAPER, `/v2/orders?status=open&symbols=${sym}&nested=true`);
    for (const o of open ?? []) { this.log(`CANCEL ${this.dryRun ? "(dry run) " : ""}${o.id} ${o.side} ${o.type}`); if (!this.dryRun) await this.req(PAPER, `/v2/orders/${o.id}`, { method: "DELETE" }); }
  }
  async closePosition(sym: string) {
    this.log(`CLOSE ${this.dryRun ? "(dry run) " : ""}${sym}`);
    if (!this.dryRun) await this.req(PAPER, `/v2/positions/${sym}`, { method: "DELETE" });
  }
}
