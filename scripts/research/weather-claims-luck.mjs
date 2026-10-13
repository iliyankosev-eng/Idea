// If the claimed trades were bought at fair prices (price = probability), how likely is a record this good?
// Exact Poisson-binomial distribution of the number of wins, plus the distribution of profit by simulation.
import { readFileSync } from "node:fs";
const claims = JSON.parse(readFileSync(new URL("../weather-claims.json", import.meta.url), "utf8"));
const p = claims.map((c) => c[4] / 100), wins = claims.filter((c) => c[6] === "WIN").length;
let dist = [1];
for (const q of p) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, k) => { nd[k] += v * (1 - q); nd[k + 1] += v * q; }); dist = nd; }
const tail = dist.slice(wins).reduce((a, b) => a + b, 0);
const expW = p.reduce((a, b) => a + b, 0);
const profit = claims.reduce((a, c) => a + c[7], 0), staked = claims.reduce((a, c) => a + c[5], 0);
// profit if each trade wins with probability = its price (fair market), 200 000 simulations
let s = 12345, ge = 0;
const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const R = 200000;
for (let i = 0; i < R; i++) { let x = 0; for (const c of claims) x += rnd() < c[4] / 100 ? c[5] * (100 / c[4] - 1) : -c[5]; if (x >= profit) ge++; }
console.log(`trades ${claims.length}, wins ${wins}, expected wins at fair prices ${expW.toFixed(1)}`);
console.log(`P(>= ${wins} wins | fair prices) = ${tail.toExponential(2)}`);
console.log(`profit $${profit.toFixed(2)} on $${staked.toFixed(2)} staked (${((100 * profit) / staked).toFixed(0)}%); P(profit >= that | fair prices) = ${(ge / R).toExponential(2)} (${ge} of ${R})`);
