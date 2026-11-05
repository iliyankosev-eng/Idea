// Close a position safely. Cancelling one leg of a bracket (OCO) order cancels the other leg asynchronously; until it
// is gone the shares stay "held_for_orders" and DELETE /v2/positions answers HTTP 403 "insufficient qty available"
// (happened on 2026-11-03: 167 QQQ stayed overnight). So: cancel, wait, try to close, and retry with longer waits.
// A second cancel of the same order can fail with HTTP 422 "order pending cancel" (2026-11-05): logged, not fatal.
export interface FlattenApi {
  cancelOpenOrders(sym: string): Promise<void>;
  position(sym: string): Promise<{ qty: string } | null>;
  closePosition(sym: string): Promise<void>;
}

/** Returns "closed" | "none" (no position). Throws after `tries` failed attempts or on any other error. */
export async function flatten(api: FlattenApi, sym: string, sleep: (ms: number) => Promise<unknown>, log: (s: string) => void, tries = 6): Promise<"closed" | "none"> {
  for (let k = 1; k <= tries; k++) {
    try { await api.cancelOpenOrders(sym); } // a failed cancel must not stop the close (2026-11-05: HTTP 422 "order pending cancel")
    catch (e) { log(`${sym}: cancel failed (${String(e).slice(0, 120)}), continuing`); }
    await sleep(2000 * k);
    const p = await api.position(sym);
    if (!p || Number(p.qty) === 0) { log(`${sym}: no position${k > 1 ? " left" : ""}`); return "none"; }
    try {
      await api.closePosition(sym);
      return "closed";
    } catch (e) {
      if (!String(e).includes("insufficient qty")) throw e;
      log(`${sym}: shares still held for orders (attempt ${k} of ${tries}), retrying`);
    }
  }
  throw new Error(`${sym}: position could not be closed after ${tries} attempts`);
}
