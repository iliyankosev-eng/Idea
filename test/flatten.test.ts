import { describe, expect, it } from "vitest";
import { flatten, type FlattenApi } from "../src/bot/flatten.js";

function fake(closeErrors: string[], pos: { qty: string } | null = { qty: "167" }) {
  const calls: string[] = [];
  const api: FlattenApi = {
    async cancelOpenOrders(s) { calls.push(`cancel ${s}`); },
    async position(s) { calls.push(`position ${s}`); return pos; },
    async closePosition(s) { calls.push(`close ${s}`); const e = closeErrors.shift(); if (e) throw new Error(e); },
  };
  const sleeps: number[] = [];
  const logs: string[] = [];
  return { api, calls, sleeps, logs, sleep: async (ms: number) => { sleeps.push(ms); }, log: (s: string) => { logs.push(s); } };
}
const HELD = 'DELETE /v2/positions/QQQ: HTTP 403 {"message":"insufficient qty available for order (requested: 167, available: 0)"}';

describe("flatten", () => {
  it("retries after 'insufficient qty' (the 2026-11-03 failure) and then closes", async () => {
    const f = fake([HELD]);
    await expect(flatten(f.api, "QQQ", f.sleep, f.log)).resolves.toBe("closed");
    expect(f.calls).toEqual(["cancel QQQ", "position QQQ", "close QQQ", "cancel QQQ", "position QQQ", "close QQQ"]);
    expect(f.sleeps).toEqual([2000, 4000]);
    expect(f.logs).toEqual(["QQQ: shares still held for orders (attempt 1 of 6), retrying"]);
  });
  it("a failing cancel on the retry (HTTP 422 pending cancel, the 2026-11-05 failure) does not stop the close", async () => {
    const f = fake([HELD]);
    let n = 0;
    const api: FlattenApi = { ...f.api, async cancelOpenOrders(s) { n++; f.calls.push(`cancel ${s}`); if (n === 2) throw new Error('DELETE /v2/orders/x: HTTP 422 {"code":42210000,"message":"order pending cancel"}'); } };
    await expect(flatten(api, "QQQ", f.sleep, f.log)).resolves.toBe("closed");
    expect(f.calls.filter((c) => c.startsWith("close"))).toHaveLength(2);
    expect(f.logs.some((l) => l.includes("cancel failed"))).toBe(true);
  });
  it("closes at once when nothing is held", async () => {
    const f = fake([]);
    await expect(flatten(f.api, "QQQ", f.sleep, f.log)).resolves.toBe("closed");
    expect(f.calls.filter((c) => c.startsWith("close"))).toHaveLength(1);
  });
  it("gives up with an error after the last attempt", async () => {
    const f = fake([HELD, HELD, HELD]);
    await expect(flatten(f.api, "QQQ", f.sleep, f.log, 3)).rejects.toThrow("could not be closed after 3 attempts");
    expect(f.sleeps).toEqual([2000, 4000, 6000]);
  });
  it("does not retry other errors", async () => {
    const f = fake(["HTTP 500 server error"]);
    await expect(flatten(f.api, "QQQ", f.sleep, f.log)).rejects.toThrow("HTTP 500");
    expect(f.calls.filter((c) => c.startsWith("close"))).toHaveLength(1);
  });
  it("no position: nothing to close", async () => {
    const f = fake([], null);
    await expect(flatten(f.api, "QQQ", f.sleep, f.log)).resolves.toBe("none");
    expect(f.calls).toEqual(["cancel QQQ", "position QQQ"]);
    const z = fake([], { qty: "0" });
    await expect(flatten(z.api, "QQQ", z.sleep, z.log)).resolves.toBe("none");
    expect(z.calls).toEqual(["cancel QQQ", "position QQQ"]);
  });
});
