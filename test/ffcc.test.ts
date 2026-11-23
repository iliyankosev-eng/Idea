import { describe, expect, it } from "vitest";
import type { Session } from "../src/intraday/sessions.js";
import { candles, Profile, sessionTrades, type FOpts } from "../src/social/ffcc.js";

type C = [number, number, number, number]; // o h l c of a 5-minute candle; its first minute carries it, the other 4 sit at c
const C0 = 0.0045;
/** 09:30-10:00: 10 minutes at 100.00 (v 80 each), 10 at 100.10 (v 300), 10 at 100.20 (v 100) -> POC 100.10, VAH 100.20, VAL 100.10. */
function session(after: C[], fillTo = 960): Session {
  const minute: number[] = [], o: number[] = [], h: number[] = [], l: number[] = [], c: number[] = [], v: number[] = [];
  const push = (m: number, b: C, vol: number) => { minute.push(m); o.push(b[0]); h.push(b[1]); l.push(b[2]); c.push(b[3]); v.push(vol); };
  for (let i = 0; i < 30; i++) { const p = i < 10 ? 100 : i < 20 ? 100.1 : 100.2; push(570 + i, [p, p, p, p], i < 10 ? 80 : i < 20 ? 300 : 100); }
  let m = 600;
  for (const b of after) { push(m, b, 1); for (let j = 1; j < 5; j++) push(m + j, [b[3], b[3], b[3], b[3]], 1); m += 5; }
  const last = after.length ? after[after.length - 1]![3] : 100.1;
  for (; m < fillTo; m++) push(m, [last, last, last, last], 1);
  return { symbol: "T", date: "2026-01-02", minute, o, h, l, c, v };
}
const O: FOpts = { len: 5, target: "1.5R", stop: "extreme", cost: C0 };
// 10:00 push to 100.50; 10:05 fails (high 100.45); 10:10 displacement: red 100.42 -> 100.15, below the 10:05 low 100.38 and the VAH
const setup: C[] = [[100.2, 100.5, 100.2, 100.4], [100.4, 100.45, 100.38, 100.42], [100.42, 100.44, 100.14, 100.15]];

describe("FFCC failed auction: profile", () => {
  it("POC, value area (70%, the bigger neighbour first) on known volumes", () => {
    const p = new Profile();
    p.add(100, 100, 800); p.add(100.1, 100.1, 3000); p.add(100.2, 100.2, 1000);
    expect(p.levels()).toEqual({ poc: 100.1, vah: 100.2, val: 100.1 });
    const q = new Profile();
    q.add(100, 100.04, 500); // spread over 5 rows: 100 each
    expect(q.levels()!.poc).toBe(100); // tie -> lowest price
  });
  it("5-minute candles", () => {
    const cs = candles(session(setup), 5);
    expect(cs[6]).toMatchObject({ start: 600, o: 100.2, h: 100.5, l: 100.2, c: 100.4 });
  });
});

describe("FFCC failed auction: trades", () => {
  it("short: entry at the displacement close, stop above the extreme, target 1.5R", () => {
    const t = sessionTrades(session([...setup, [100.15, 100.16, 99.6, 99.62]]), O);
    expect(t.length).toBe(1);
    const x = t[0]!;
    expect([x.dir, x.entry, x.entryMin]).toEqual([-1, 100.15, 615]);
    expect(x.stop).toBeCloseTo(100.51, 10);
    expect(x.target).toBeCloseTo(100.15 - 1.5 * 0.36, 10);
    expect(x.r).toBeCloseTo((1.5 * 0.36 - 2 * C0) / 0.36, 10);
  });
  it("long at the VAL (mirror rules): push below, fail, green displacement above the previous high and the VAL", () => {
    const x = sessionTrades(session([[100.1, 100.12, 99.7, 99.8], [99.8, 99.82, 99.75, 99.78], [99.78, 100.12, 99.76, 100.11], [100.11, 100.8, 100.1, 100.78]]), O)[0]!;
    expect([x.dir, x.entry]).toEqual([1, 100.11]);
    expect(x.stop).toBeCloseTo(99.69, 10);
    expect(x.target).toBeCloseTo(100.11 + 1.5 * 0.42, 10);
    expect(x.r).toBeCloseTo((1.5 * 0.42 - 2 * C0) / 0.42, 10);
  });
  it("stop: -1R minus costs; the stop is checked before the target in the same candle", () => {
    const x = sessionTrades(session([...setup, [100.15, 100.6, 99.5, 99.6]]), O)[0]!;
    expect(x.exit).toBeCloseTo(100.51, 10);
    expect(x.r).toBeCloseTo(-1 - (2 * C0) / 0.36, 10);
  });
  it("time exit at the 15:55 open", () => {
    const s0 = session(setup), late = (a: number[]) => a.map((p, i) => (s0.minute[i]! > 955 ? 100.3 : p));
    const x = sessionTrades({ ...s0, o: late(s0.o), h: late(s0.h), l: late(s0.l), c: late(s0.c) }, O)[0]!;
    expect(x.exitMin).toBe(955);
    expect(x.exit).toBe(100.15);
  });
  it("no trade: the displacement does not close below the previous low, or comes after 6 candles, or price makes a new high", () => {
    expect(sessionTrades(session([setup[0]!, setup[1]!, [100.42, 100.44, 100.39, 100.39]]), O).length).toBe(0);
    const late: C[] = [setup[0]!, ...Array.from({ length: 6 }, (): C => [100.4, 100.45, 100.38, 100.42]), setup[2]!];
    expect(sessionTrades(session(late), O).length).toBe(0);
    const newHigh: C[] = [setup[0]!, setup[1]!, [100.42, 100.55, 100.14, 100.15]]; // the "displacement" makes a new high: restart
    expect(sessionTrades(session(newHigh), O).length).toBe(0);
  });
  it("displacement needs a big body (>= 1.5 x the average) and a close beyond the previous candle", () => {
    expect(sessionTrades(session([setup[0]!, setup[1]!, [100.18, 100.19, 100.14, 100.15]]), O).length).toBe(0); // body 0.03 < 1.5 x 0.0275
    expect(sessionTrades(session([setup[0]!, [100.4, 100.45, 100.1, 100.42], setup[2]!]), O).length).toBe(0); // previous low 100.10
    expect(sessionTrades(session([[100.1, 100.12, 99.7, 99.8], [99.8, 100.15, 99.75, 99.78], [99.78, 100.12, 99.76, 100.11]]), O).length).toBe(0); // previous high 100.15
  });
  it("variants: stop = candle range, target = POC", () => {
    const a = sessionTrades(session([...setup, [100.15, 100.16, 99.6, 99.62]]), { ...O, stop: "candle" })[0]!;
    expect(a.stop).toBeCloseTo(100.15 + 0.3, 10);
    const b = sessionTrades(session([...setup, [100.15, 100.16, 100.05, 100.06]]), { ...O, target: "POC" })[0]!;
    expect(b.target).toBeCloseTo(100.1, 10);
    expect(b.exit).toBeCloseTo(100.1, 10);
  });
  it("random direction: same entry, stop and target mirrored", () => {
    const x = sessionTrades(session([...setup, [100.15, 100.16, 99.6, 99.62]]), { ...O, flip: () => true })[0]!;
    expect(x.dir).toBe(1);
    expect(x.stop).toBeCloseTo(100.15 - 0.36, 10);
    expect(x.r).toBeCloseTo(-1 - (2 * C0) / 0.36, 10);
  });
  it("no new entries after 15:00", () => {
    const pre: C[] = Array.from({ length: 60 }, (): C => [100.1, 100.12, 100.08, 100.1]); // 10:00 .. 14:55
    expect(sessionTrades(session([...pre, ...setup]), O).length).toBe(0); // push at 15:00
  });
});
