import { afterEach, describe, expect, it, vi } from "vitest";
import { Alpaca } from "../src/bot/alpaca.js";

function stub(deleteStatus: number) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { method?: string }) => {
    calls.push(`${init.method} ${url.replace("https://paper-api.alpaca.markets", "")}`);
    if (init.method === "GET") return new Response(JSON.stringify([{ id: "a", side: "buy", type: "limit", status: "new" }, { id: "b", side: "buy", type: "stop", status: "pending_cancel" }]), { status: 200 });
    return new Response(deleteStatus === 204 ? "" : '{"code":42210000,"message":"order pending cancel"}', { status: deleteStatus });
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("Alpaca.cancelOpenOrders", () => {
  it("skips orders already pending cancel and tolerates HTTP 422 on DELETE", async () => {
    const calls = stub(422), logs: string[] = [];
    await expect(new Alpaca("k", "s", false, (x) => logs.push(x)).cancelOpenOrders("QQQ")).resolves.toBeUndefined();
    expect(calls).toEqual(["GET /v2/orders?status=open&symbols=QQQ&nested=true", "DELETE /v2/orders/a"]);
    expect(logs.some((l) => l.startsWith("CANCEL already pending: b"))).toBe(true);
    expect(logs.some((l) => l.startsWith("CANCEL skipped"))).toBe(true);
  });
  it("other errors still throw", async () => {
    stub(500);
    await expect(new Alpaca("k", "s", false, () => {}).cancelOpenOrders("QQQ")).rejects.toThrow("HTTP 500");
  });
});
