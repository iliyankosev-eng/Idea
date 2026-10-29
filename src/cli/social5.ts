/**
 * Five social-media strategies (experiments/social5-preregistration.md): S1 VWAP/EMA9, S2 noise band (= DT1), S3 gold 06:30 UK.
 * Run: npx tsx src/cli/social5.ts   Writes reports/social5.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { dt1, perf, type DayRet } from "../daytrade/dt.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";
import { bootstrapByDay } from "../pm/common.js";
import { s1, toKBars } from "../social/vwapEma.js";
import { gold630, type GoldDay } from "../social/gold630.js";

const D = "data/branch", C = 0.0045;
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const S: Record<string, Session[]> = { SPY: sessions("SPY"), QQQ: sessions("QQQ") };
const boot = (rs: DayRet[]) => bootstrapByDay(rs.map((x) => ({ day: x.day, r: x.r })));
const within = (rs: DayRet[], a: string, b = "9999") => rs.filter((x) => x.day >= a && x.day < b);
const verdict = (rs: DayRet[], late: string) => { const p = perf(rs), q = perf(within(rs, late)); const c2 = p.meanDaily > 0 && boot(rs) >= 0.95, c3 = q.meanDaily > 0 && q.sharpe >= 0.5; return c2 && c3 ? "GO (на хартия)" : c2 ? "слабо" : "STOP"; };
const row = (name: string, rs: DayRet[], late: string) => { const p = perf(rs), q = perf(within(rs, late)); return `| ${name} | ${p.trades} | ${fmt(100 * p.cagr, 1)}% | ${fmt(p.sharpe, 2)} | ${fmt(100 * p.mdd, 1)}% | ${fmt(100 * boot(rs), 1)}% | ${fmt(q.sharpe, 2)} · ${fmt(100 * q.cagr, 1)}% | ${verdict(rs, late)} |`; };
const head = (late: string) => [`| Вариант | Сделки | Год. доходност | Sharpe | Макс. спад | Bootstrap > 0 | ${late}: Sharpe · год. | Решение |`, "| --- | --- | --- | --- | --- | --- | --- | --- |"];
const avg = (a: DayRet[], b: DayRet[]): DayRet[] => { const m = new Map(b.map((x) => [x.day, x])); return a.filter((x) => m.has(x.day)).map((x) => ({ day: x.day, r: (x.r + m.get(x.day)!.r) / 2, trades: x.trades + m.get(x.day)!.trades })); };
const out: string[] = ["# Пет стратегии от социалните мрежи: резултати", "", "Правила: `experiments/social5-preregistration.md`.", ""];

// ---------- S1 ----------
const kb = (sym: string, k: number) => S[sym]!.map((s) => toKBars(s, k));
const s1r = (sym: string, k: number, o: Parameters<typeof s1>[1]) => s1(kb(sym, k), o).filter((x) => x.day >= "2016-01-04");
const main1 = avg(s1r("SPY", 5, { cost: C }), s1r("QQQ", 5, { cost: C }));
out.push("## S1: VWAP / EMA 9 (SPY + QQQ)", "", "Нетно, $0.0045 на акция и страна, 100% от капитала, без ливъридж.", "", ...head("2021–2026"),
  row("**P1: 5 минути, SPY + QQQ**", main1, "2021-01-01"),
  row("5 минути, без разходи", avg(s1r("SPY", 5, { cost: 0 }), s1r("QQQ", 5, { cost: 0 })), "2021-01-01"),
  row("5 минути, обратна посока", avg(s1r("SPY", 5, { cost: C, invert: true }), s1r("QQQ", 5, { cost: C, invert: true })), "2021-01-01"),
  row("1 минута", avg(s1r("SPY", 1, { cost: C }), s1r("QQQ", 1, { cost: C })), "2021-01-01"),
  row("1 минута, без разходи", avg(s1r("SPY", 1, { cost: 0 }), s1r("QQQ", 1, { cost: 0 })), "2021-01-01"),
  row("SPY, 5 минути", s1r("SPY", 5, { cost: C }), "2021-01-01"), row("QQQ, 5 минути", s1r("QQQ", 5, { cost: C }), "2021-01-01"), "",
  `Средно сделки на ден (5 мин., SPY): ${fmt(s1r("SPY", 5, { cost: C }).reduce((a, x) => a + x.trades, 0) / S.SPY!.length, 1)}; (1 мин.): ${fmt(s1r("SPY", 1, { cost: C }).reduce((a, x) => a + x.trades, 0) / S.SPY!.length, 1)}.`, "");

// ---------- S2 ----------
const n = (sym: string) => dt1(S[sym]!, { dynamic: true, execNextOpen: true, cost: C });
out.push("## S2: Noise band (= DT1, Zarattini, Aziz, Barbon 2024)", "", "Същият код като в `reports/daytrade5.md`, нетно.", "", ...head("след статията (2024-05 –)"),
  row("SPY, 2016–2026", n("SPY"), "2024-05-01"), row("SPY, от 2018 (както във видеото)", within(n("SPY"), "2018-01-01"), "2024-05-01"),
  row("QQQ, 2016–2026", n("QQQ"), "2024-05-01"), row("QQQ, от 2018", within(n("QQQ"), "2018-01-01"), "2024-05-01"),
  row("SPY + QQQ, от 2018", within(avg(n("SPY"), n("QQQ")), "2018-01-01"), "2024-05-01"), "");

// ---------- S3 ----------
const pax = loadMinuteBars(D, "PAXGUSDT", "2020-09", "2026-09", "binance");
const fmtL = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const off = new Map<number, number>();
const lon = (ms: number) => { const hk = Math.floor(ms / 3600_000); let v = off.get(hk); if (v === undefined) { const p = Object.fromEntries(fmtL.formatToParts(new Date(hk * 3600_000)).map((x) => [x.type, x.value])); v = (Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) - hk * 3600_000) / 60000; off.set(hk, v); } return new Date(ms + v * 60000).toISOString(); };
const gd = new Map<string, { m: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }>();
const absMove = new Array(1440).fill(0), vol = new Array(1440).fill(0), cnt = new Array(1440).fill(0);
for (let i = 0; i < pax.t.length; i++) {
  const iso = lon(pax.t[i]!), m = +iso.slice(11, 13) * 60 + +iso.slice(14, 16), date = iso.slice(0, 10);
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (wd >= 1 && wd <= 5) { absMove[m] += Math.abs(pax.c[i]! / pax.o[i]! - 1); vol[m] += pax.v[i]! * pax.c[i]!; cnt[m]++; }
  if (m < 390 || m > 570) continue; // 06:30 .. 09:30 London
  let d = gd.get(date); if (!d) { d = { m: [], o: [], h: [], l: [], c: [], v: [] }; gd.set(date, d); }
  d.m.push(m); d.o.push(pax.o[i]!); d.h.push(pax.h[i]!); d.l.push(pax.l[i]!); d.c.push(pax.c[i]!); d.v.push(pax.v[i]!);
}
const days3: GoldDay[] = [...gd.entries()].filter(([date]) => { const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); return wd >= 1 && wd <= 5; }).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, d]) => ({ date, ...d }));
const prof = (a: number, b: number) => { let s = 0, v = 0, k = 0; for (let m = a; m < b; m++) { s += absMove[m]; v += vol[m]; k += cnt[m]; } return { mv: (1e4 * s) / k, vol: v / k }; };
const base = prof(330, 390);
out.push("## S3: злато в 06:30 UK (PAXG, Binance)", "", "**(a) Има ли „впръскване“ в 06:30?** Среден абсолютен ход на 1-минутна свещ (bp) и среден оборот ($) на минута, работни дни, час по Лондон:", "",
  "| Прозорец (UK) | Ход, bp/мин | Оборот, $/мин | Спрямо 05:30–06:29 |", "| --- | --- | --- | --- |",
  ...[[330, 390, "05:30–06:29"], [390, 405, "06:30–06:44"], [405, 480, "06:45–07:59"], [480, 495, "08:00–08:14 (Лондон отваря)"], [810, 825, "13:30–13:44 (данни от САЩ)"], [870, 885, "14:30–14:44 (Ню Йорк отваря)"]].map(([a, b, name]) => { const p = prof(a as number, b as number); return `| ${name} | ${fmt(p.mv, 2)} | ${fmt(p.vol, 0)} | ход ×${fmt(p.mv / base.mv, 2)}, оборот ×${fmt(p.vol / base.vol, 2)} |`; }), "");
const r3 = (fee: number, inv = false) => gold630(days3, { fee, invert: inv }).filter((x) => x.day >= "2020-09-01");
const row3 = (name: string, rs: DayRet[]) => { const tr = rs.filter((x) => x.trades), m = tr.reduce((a, x) => a + x.r, 0) / tr.length; return `| ${name} | ${tr.length} | ${fmt(100 * tr.filter((x) => x.r > 0).length / tr.length, 0)}% | ${fmt(m, 3)} R | ${fmt(100 * boot(rs), 1)}% | ${fmt(perf(within(rs, "2023-09-01")).sharpe, 2)} | ${verdict(rs, "2023-09-01")} |`; };
out.push("**(b) Механична версия** (пробив на диапазона 06:30–06:44 UK, стоп от другата страна, изход 09:30 UK). Резултат в R = печалба / риск; дневният ред е R на ден (0 без сделка).", "",
  "| Вариант | Сделки | Печеливши | Средно на сделка | Bootstrap > 0 | 2023-09 –: Sharpe | Решение |", "| --- | --- | --- | --- | --- | --- | --- |",
  row3("**P3: такса 0.05% на страна**", r3(0.0005)), row3("такса 0.02% на страна", r3(0.0002)), row3("без такси", r3(0)), row3("обратна посока, 0.05%", r3(0.0005, true)), "");
out.push("Проверка: независим Python код (`scripts/research/xcheck_gold630.py`) дава същото: 1453 сделки, −0.319 R без такси, −1.356 R с 0.05%.", "",
  "Защо губи и в двете посоки преди такси: диапазонът 06:30–06:44 е тесен (медиана 13 bp), а при PAXG върховете и дъната на минутните свещи често са от единични сделки по ръба на тънка книга. Стопът се докосва от „шум“, който после се връща. Това е вероятно обяснение, не е доказано.", "",
  "## S4: копиране на „китове“ от Polymarket в Kalshi", "",
  "Видеото няма правила, които могат да се тестват с история. Проверих фактите:", "",
  "- **Kalshi от България:** според две независими обобщения на Member Agreement на Kalshi (Coinperps, 19.10.2026; Datawallet, 14.10.2026) България е в списъка със забранени държави. Официалната помощна страница препраща към Member Agreement и не изброява държави.",
  "- **Polymarket:** в официалния списък (docs.polymarket.com, geoblock) България не е ограничена. „Само за гледане“ (close-only) важи за САЩ, Обединеното кралство, Германия, Франция, Италия, Полша и др., не за всички извън САЩ.",
  "- **Кодът STATDEV:** Kalshi има реферална програма, при която и този, който кани, получава бонус. Не мога да проверя конкретния код, но по форма прилича на личен реферален код: авторът печели от всяка регистрация.",
  "- **„Китовете печелят“:** анализ на 2.5 млн. адреса в Polymarket (A. Sergeenkov, до 01.04.2026): 84% губят; от ~6600 адреса с над $5000 на месец 53% изчезват след месец и само 2.6% търгуват повече от година. Класацията показва оцелелите.",
  "- **Наши тестове:** копиране на портфейли в Hyperliquid (`reports/copytrade-wallets.md`): модел „много малки печалби, после огромна загуба“; китът оцелява с резерв, копиращият с малка сметка не.", "",
  "**Присъда:** STOP. Не може да се тества като правило, Kalshi вероятно не е достъпен от България, а изборът на „печеливш кит“ от класацията е изборът на оцелелия.", "");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/social5.md", text + "\n");
