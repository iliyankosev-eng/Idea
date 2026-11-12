/**
 * Bot v2 tests (experiments/bot-v2-preregistration.md): noise band next to DT3, leverage cap, DT8 on QQQ, idle cash in BIL,
 * risk scaling ("what do 30% a year cost") and a prop-firm evaluation simulation.
 * Run: npx tsx src/cli/bot-v2.ts   Writes reports/bot-v2.md
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadMinuteBars } from "../data/intraday.js";
import { fmt, mulberry32 } from "../evaluate.js";
import { COST_PER_SHARE as C, dt1, dt3Late, perf, type DayRet } from "../daytrade/dt.js";
import { rsi } from "../daytrade/dt78.js";
import { completeSessions, loadCalendar, toSessions, type Session } from "../intraday/sessions.js";

const D = "data/branch", LATE = "2021-07-01", END = "2026-09-30";
const cal = loadCalendar(`${D}/daily/alpaca/calendar.csv`);
const fomc = new Set((JSON.parse(readFileSync("scripts/fomc-dates.json", "utf8")) as { dates: string[] }).dates);
const sessions = (sym: string) => completeSessions(toSessions(loadMinuteBars(D, sym, "2016-01", "2026-09", "alpaca"), cal), cal).kept;
const qqq = sessions("QQQ"), spy = sessions("SPY");
const daily = (sym: string) => { const rows = readFileSync(`${D}/daily/alpaca/${sym}.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r[0]! <= END); return { date: rows.map((r) => r[0]!), c: rows.map((r) => Number(r[4])) }; };

// ---------- components (maps day -> return on the strategy's own capital) ----------
type Ser = Map<string, number>;
const ser = (rs: DayRet[]): Ser => new Map(rs.map((x) => [x.day, x.r]));
const dt3 = (maxLev: number): Ser => ser(dt3Late(qqq, C, 20, maxLev).map((x) => (fomc.has(x.day) ? { ...x, r: 0 } : x)));
const nb = (maxLev: number): Ser => ser(dt1(qqq, { dynamic: true, execNextOpen: true, cost: C, maxLev, exitMin: 955 }));
/** DT8 decided with the price `cut` minutes before the close. Returns the daily return and whether the day started in position. */
function dt8At(sym: string, ss: Session[], cut: number): { r: Ser; inPos: Map<string, boolean>; trades: number } {
  const { date, c } = daily(sym);
  const ratio = new Map<string, number>();
  for (const s of ss) { const lim = s.minute[s.minute.length - 1]! + 1 - cut; let k = -1; for (let i = 0; i < s.minute.length && s.minute[i]! < lim; i++) k = i; if (k >= 0) ratio.set(s.date, s.c[k]! / s.c[s.c.length - 1]!); }
  const sma = (xs: number[], n: number) => xs.slice(-n).reduce((a, b) => a + b, 0) / n;
  const r: Ser = new Map(), held = new Map<string, boolean>();
  let inPos = false, trades = 0;
  for (let i = 1; i < c.length; i++) {
    held.set(date[i]!, inPos);
    let x = inPos ? c[i]! / c[i - 1]! - 1 : 0;
    const f = ratio.get(date[i]!);
    if (f !== undefined) {
      const s2 = [...c.slice(0, i), c[i]! * f], px = s2[i]!;
      const act = inPos ? px > sma(s2, 5) : i >= 199 && rsi(s2, 2)[i]! < 10 && px > sma(s2, 200);
      if (act) { x -= C / c[i]!; if (inPos) trades++; inPos = !inPos; }
    }
    r.set(date[i]!, x);
  }
  return { r, inPos: held, trades };
}
const spyD = daily("SPY");
const DAYS = spyD.date.slice(1).filter((d) => d >= "2016-01-05");
const mix = (parts: [number, Ser][]): DayRet[] => DAYS.map((day) => ({ day, r: parts.reduce((a, [w, s]) => a + w * (s.get(day) ?? 0), 0), trades: 0 }));
const from = (rs: DayRet[], a: string) => rs.filter((x) => x.day >= a);
const P = (rs: DayRet[]) => perf(rs);
const line = (name: string, rs: DayRet[]) => { const a = P(rs), b = P(from(rs, LATE)); return `| ${name} | ${fmt(100 * a.cagr, 1)}% | ${fmt(a.sharpe, 2)} | ${fmt(100 * a.mdd, 1)}% | ${fmt(100 * b.cagr, 1)}% | ${fmt(b.sharpe, 2)} | ${fmt(100 * b.mdd, 1)}% |`; };
const HEAD = ["| Вариант | Год. доходност | Sharpe | Макс. спад | 2021-07 –: год. | Sharpe | Макс. спад |", "| --- | --- | --- | --- | --- | --- | --- |"];
const out: string[] = ["# Бот v2: тестове на шестте промени", "", "Правила: `experiments/bot-v2-preregistration.md`. Нетно, $0.0045 на акция и страна; 2016-01 – 2026-09. Доходността е върху капитала на съответната част.", ""];

// ---------- T2 + T5: intraday sleeve ----------
const d4 = dt3(4), d2 = dt3(2), n4 = nb(4), n2 = nb(2);
const I0 = mix([[1, d4]]), NB4 = mix([[1, n4]]), I1 = mix([[0.5, d4], [0.5, n4]]), I2 = mix([[0.5, d2], [0.5, n2]]);
const better = (a: DayRet[], b: DayRet[]) => P(a).sharpe > P(b).sharpe && P(a).mdd >= P(b).mdd;
const t2 = better(I1, I0) && better(from(I1, LATE), from(I0, LATE));
const t5 = P(I2).sharpe >= P(I1).sharpe - 0.05;
const corr = (() => { const a = DAYS.map((d) => d4.get(d) ?? 0), b = DAYS.map((d) => n4.get(d) ?? 0), ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i]! - ma) * (b[i]! - mb); saa += (a[i]! - ma) ** 2; sbb += (b[i]! - mb) ** 2; } return sab / Math.sqrt(saa * sbb); })();
out.push("## T2 и T5: дневната част", "", ...HEAD, line("I0: само DT3 (4×)", I0), line("само noise band QQQ (4×, изход 15:55)", NB4), line("**I1: ½ DT3 + ½ noise band (4×)**", I1), line("**I2: същото с таван 2×**", I2), line("само DT3 с таван 2×", mix([[1, d2]])), line("само noise band с таван 2×", mix([[1, n2]])), line("noise band 2×, ботът закъснява с 2 минути (проверка)", mix([[1, ser(dt1(qqq, { dynamic: true, execNextOpen: true, cost: C, maxLev: 2, exitMin: 955, delay: 2 }))]])), line("noise band 2×, разход $0.01 на акция (проверка)", mix([[1, ser(dt1(qqq, { dynamic: true, execNextOpen: true, cost: 0.01, maxLev: 2, exitMin: 955 }))]])), "",
  `Корелация на дневните резултати DT3 / noise band: ${fmt(corr, 2)}.`, "",
  "Проверка: независим Python код (`scripts/research/xcheck_noiseband.py`) за noise band (2×, изход 15:55) съвпада в 2683 от 2684 дни; единственият различен ден (2018-05-04) е след пропусната сесия, която TypeScript версията нарочно не търгува.", "",
  "**Важно:** noise band е чувствителна към закъснение. С 2 минути закъснение доходността пада от 19.2% на 12.8%. Затова ботът трябва да стартира преди кръглия час и да чака точната минута.", "",
  `- **T2 (noise band):** ${t2 ? "ПРИЕТО" : "НЕ Е ПРИЕТО"} (Sharpe по-висок и спад не по-лош в двата периода: ${t2 ? "да" : "не"}).`,
  `- **T5 (таван 2×):** ${t5 ? "ПРИЕТО" : "НЕ Е ПРИЕТО"} (Sharpe ${fmt(P(I2).sharpe, 2)} срещу ${fmt(P(I1).sharpe, 2)}; допустим спад 0.05).`, "");
const INTRA = t2 ? (t5 ? I2 : I1) : (t5 ? mix([[1, d2]]) : I0);

// ---------- T6: DT8 on QQQ ----------
const e5spy = dt8At("SPY", spy, 5), e5qqq = dt8At("QQQ", qqq, 5), e20spy = dt8At("SPY", spy, 20);
const E0 = mix([[1, e5spy.r]]), EQ = mix([[1, e5qqq.r]]), E1 = mix([[0.5, e5spy.r], [0.5, e5qqq.r]]);
const t6 = P(E1).sharpe >= P(E0).sharpe + 0.1 && P(from(E1, LATE)).sharpe >= P(from(E0, LATE)).sharpe + 0.1;
out.push("## T6: DT8 и върху QQQ", "", ...HEAD, line("DT8 SPY, решение 20 мин. преди затварянето (старо)", mix([[1, e20spy.r]])), line("**E0: DT8 SPY, решение 5 мин. преди затварянето**", E0), line("DT8 QQQ", EQ), line("**E1: ½ SPY + ½ QQQ**", E1), "",
  `Сделки: SPY ${e5spy.trades}, QQQ ${e5qqq.trades}. **T6:** ${t6 ? "ПРИЕТО" : "НЕ Е ПРИЕТО"} (нужно: Sharpe ≥ E0 + 0.10 в двата периода).`, "");
const dt8Ser: Ser = t6 ? new Map(DAYS.map((d) => [d, 0.5 * (e5spy.r.get(d) ?? 0) + 0.5 * (e5qqq.r.get(d) ?? 0)])) : e5spy.r;

// ---------- T3: idle cash in BIL ----------
let dt8Cash = dt8Ser, t3 = false;
if (existsSync(`${D}/daily/alpaca/BIL.csv`)) {
  const b = daily("BIL"), br = new Map<string, number>();
  for (let i = 1; i < b.c.length; i++) br.set(b.date[i]!, b.c[i]! / b.c[i - 1]! - 1);
  const idle = (d: string) => (t6 ? 0.5 * (e5spy.inPos.get(d) ? 0 : 1) + 0.5 * (e5qqq.inPos.get(d) ? 0 : 1) : e5spy.inPos.get(d) ? 0 : 1);
  dt8Cash = new Map(DAYS.map((d) => [d, (dt8Ser.get(d) ?? 0) + idle(d) * (br.get(d) ?? 0)]));
  const a = mix([[1, dt8Ser]]), c = mix([[1, dt8Cash]]);
  t3 = P(c).cagr > P(a).cagr && P(c).mdd >= P(a).mdd - 0.005;
  const bil = mix([[1, br]]);
  out.push("## T3: свободните пари в BIL", "", ...HEAD, line("DT8 част без BIL", a), line("**DT8 част + BIL, когато не е в позиция**", c), line("само BIL (справка)", bil), "",
    `Дял на дните без позиция: ${fmt(100 * DAYS.filter((d) => idle(d) > 0).length / DAYS.length, 0)}%. BIL през последните 12 месеца от теста: ${fmt(100 * (P(from(bil, "2025-10-01")).total), 1)}%. **T3:** ${t3 ? "ПРИЕТО" : "НЕ Е ПРИЕТО"}.`, "");
} else out.push("## T3: свободните пари в BIL", "", "Данните за BIL още не са свалени.", "");

// ---------- final portfolio ----------
const OLD = mix([[0.5, d4], [0.5, e20spy.r]]);
const intraSer: Ser = new Map(INTRA.map((x) => [x.day, x.r]));
const V2 = mix([[0.5, intraSer], [0.5, t3 ? dt8Cash : dt8Ser]]);
const spyBH = DAYS.map((day) => { const i = spyD.date.indexOf(day); return { day, r: spyD.c[i]! / spyD.c[i - 1]! - 1, trades: 0 }; });
const halt15 = P(V2).mdd > -0.12;
out.push("## Крайният портфейл", "", ...HEAD, line("Стар бот: ½ DT3 (4×) + ½ DT8 SPY (15:40)", OLD), line("**Бот v2**", V2), line("Купи и дръж SPY", spyBH), "",
  `Спирачка при −15% вместо −20%: ${halt15 ? "ПРИЕТО" : "НЕ Е ПРИЕТО"} (най-голям спад на v2 в теста ${fmt(100 * P(V2).mdd, 1)}%; праг 12%).`, "",
  `**По години (v2 / стар / SPY), %:** ${[...new Set(DAYS.map((d) => d.slice(0, 4)))].map((y) => { const f = (rs: DayRet[]) => fmt(100 * P(rs.filter((x) => x.day.startsWith(y))).total, 1); return `${y}: ${f(V2)} / ${f(OLD)} / ${f(spyBH)}`; }).join("; ")}`, "");

// ---------- scaling: what do 30% a year cost ----------
function boot(rs: DayRet[], k: number) {
  const rnd = mulberry32(777), n = rs.length, B = 20, cag: number[] = [], dd: number[] = [];
  for (let it = 0; it < 2000; it++) {
    let eq = 1, pk = 1, m = 0, cnt = 0;
    while (cnt < n) { const s = Math.floor(rnd() * n); for (let j = 0; j < B && cnt < n; j++, cnt++) { eq *= 1 + k * rs[(s + j) % n]!.r; if (eq > pk) pk = eq; m = Math.min(m, eq / pk - 1); if (eq <= 0) { eq = 1e-9; } } }
    cag.push(eq ** (252 / n) - 1); dd.push(m);
  }
  cag.sort((a, b) => a - b); dd.sort((a, b) => a - b);
  return { med: cag[1000]!, p5: cag[100]!, dd95: dd[100]!, p30: cag.filter((x) => x >= 0.3).length / 2000 };
}
const scaled = (rs: DayRet[], k: number) => rs.map((x) => ({ ...x, r: k * x.r }));
out.push("## Колко струват 30% на година (описателно)", "", "k = мащаб на риска (k = 2 означава двойно по-големи позиции). Bootstrap: 2000 пренареждания на историята на блокове от 20 дни.", "",
  "| Портфейл | k | Год. доходност (история) | Макс. спад (история) | Bootstrap: медиана | 5% най-лоши: доходност | 5% най-лоши: спад | Вероятност ≥ 30% на година |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [name, rs] of [["Бот v2", V2], ["Само дневната част (DT3 + noise band)", INTRA]] as const)
  for (const k of [1, 1.5, 2, 3]) { const p = P(scaled(rs, k)), b = boot(rs, k); out.push(`| ${name} | ${k} | ${fmt(100 * p.cagr, 1)}% | ${fmt(100 * p.mdd, 1)}% | ${fmt(100 * b.med, 1)}% | ${fmt(100 * b.p5, 1)}% | ${fmt(100 * b.dd95, 1)}% | ${fmt(100 * b.p30, 0)}% |`); }
out.push("");

// ---------- prop firm simulation (Topstep $50K rules) ----------
const R = dt3Late(qqq, C, 20, 1e9).map((x) => (fomc.has(x.day) ? 0 : x.r / 0.01)).filter((_, i) => qqq[i]!.date >= "2016-01-05");
function prop(X: number) {
  let pass = 0, fail = 0, n = 0, months = 0; const days: number[] = [], pay: number[] = [];
  let noPay = 0;
  for (let t0 = 0; t0 + 400 < R.length; t0 += 5) {
    let b = 0, floor = -2000, best = 0, t = t0, res = 0;
    for (; t < R.length; t++) {
      const pnl = R[t]! * X; b += pnl; best = Math.max(best, pnl);
      if (b <= floor) { res = -1; break; }
      if (b >= Math.max(3000, best / 0.55)) { res = 1; break; }
      floor = Math.min(0, Math.max(floor, b - 2000));
    }
    if (res === 0) continue;
    n++; months += Math.ceil((t - t0 + 1) / 21);
    if (res === -1) { fail++; continue; }
    pass++; days.push(t - t0 + 1);
    // funded account
    let fb = 0, fl = -2000, wins = 0, total = 0, paid = false;
    for (let u = t + 1; u < R.length && u <= t + 252; u++) {
      const pnl = R[u]! * X; fb += pnl; if (pnl >= 150) wins++;
      if (fb <= fl) break;
      if (!paid) fl = Math.min(0, Math.max(fl, fb - 2000));
      if (wins >= 5 && fb > 0) { const w = 0.5 * fb; fb -= w; total += 0.9 * w; wins = 0; paid = true; fl = 0; }
    }
    pay.push(total); if (total === 0) noPay++;
  }
  days.sort((a, b) => a - b); const sp = [...pay].sort((a, b) => a - b);
  const mean = pay.reduce((a, b) => a + b, 0) / (pay.length || 1), medDays = days[Math.floor(days.length / 2)] ?? 0;
  const fee = 49 * (months / n); // average monthly fees per attempt (passed or failed)
  return { n, pass: pass / n, medDays, fee, noPay: noPay / (pay.length || 1), medPay: sp[Math.floor(sp.length / 2)] ?? 0, mean, ev: (pass / n) * (mean - 149) - fee };
}
out.push("## Prop фирма: симулация с DT3 (правилата на Topstep $50K; описателно)", "", "Старт на всеки 5-и ден от историята. „Очаквано на опит“ = вероятност за успех × (средно изтеглено − $149 активиране) − средните месечни такси ($49 на месец) до успех или провал. Груба симулация: ETF вместо фючърс, само резултатът в края на деня.", "",
  "| Риск на сделка | Опити | Минава изпита | Медиана дни до успех | Средни такси | Финансирани без нито едно теглене | Медиана изтеглено | Средно изтеглено | Очаквано на опит |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const X of [100, 200, 300, 500, 1000]) { const p = prop(X); out.push(`| $${X} | ${p.n} | ${fmt(100 * p.pass, 0)}% | ${p.medDays} | $${fmt(p.fee, 0)} | ${fmt(100 * p.noPay, 0)}% | $${fmt(p.medPay, 0)} | $${fmt(p.mean, 0)} | $${fmt(p.ev, 0)} |`); }
out.push("");
const text = out.join("\n");
console.log(text);
writeFileSync("reports/bot-v2.md", text + "\n");
writeFileSync("/tmp/claude-0/-home-claude/9e47a7b8-9735-5e0f-a619-81e08cda7ace/scratchpad/botv2-decisions.json", JSON.stringify({ t2, t5, t6, t3, halt15 }));
