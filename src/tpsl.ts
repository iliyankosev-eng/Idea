import type { Strategy } from "./history.js";
import { mulberry32 } from "./evaluate.js";

/**
 * Target/stop strategy checked on closes: when flat, enter (always if enterProb >= 1, otherwise with that
 * probability per bar); when holding, exit once the close is >= entry*(1+tp) or <= entry*(1-sl).
 * Stateful: create a fresh copy for every backtest run.
 */
export function tpSl(tp: number, sl: number, enterProb: number, seed: number): Strategy {
  let entry = 0, holding = false;
  const rnd = mulberry32(seed);
  return (h) => {
    const p = h.price(h.t);
    if (holding) {
      if (p >= entry * (1 + tp) || p <= entry * (1 - sl)) { holding = false; return 0; }
      return 1;
    }
    if (enterProb >= 1 || rnd() < enterProb) { holding = true; entry = p; return 1; }
    return 0;
  };
}
