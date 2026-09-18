/**
 * Aurum game — the price curve, as pure maths.
 *
 * Imported by both the Convex round engine and the browser chart. That is the
 * whole point of the file: the curve is a deterministic function of the round's
 * `seed`, so every player draws the identical line without the server writing a
 * single price tick to the database, and the settlement price the backend
 * computes is provably the one the chart drew.
 *
 * The previous build generated the walk locally in each browser with
 * `Math.random()`. It cost nothing either — but no two players were ever
 * watching the same game, and the "result" had no relationship to the chart
 * anyone had been staring at for the whole round.
 */

/** Betting is open for this long. */
export const BETTING_MS = 15_000;
/** Then the price runs, and where it lands decides the round. */
export const PROCESSING_MS = 15_000;
export const ROUND_MS = BETTING_MS + PROCESSING_MS;

/** Sample spacing of the underlying walk. Between samples the chart interpolates. */
export const TICK_MS = 250;

/** Where every round opens. Arbitrary; only movement relative to it matters. */
export const BASE_PRICE = 100;

/** Total samples in a round, plus the opening one. */
export const TICK_COUNT = Math.floor(ROUND_MS / TICK_MS) + 1;

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * Chosen because it is a dozen lines and produces the same sequence in every
 * JS runtime from one integer. A seeded generator is the mechanism that makes
 * the chart shared; anything runtime-dependent would quietly desync a browser
 * from the server and settle rounds against a line nobody saw.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The full sample series for a round.
 *
 * A random walk with light mean reversion: without the pull the line drifts off
 * the axis and the round stops being a coin flip; with too much of it every
 * round ends in a near-tie and gets voided. 0.02 keeps it lively and close.
 */
export function priceSeries(seed: number): number[] {
  const rand = mulberry32(seed);
  const out: number[] = new Array(TICK_COUNT);
  let price = BASE_PRICE;
  out[0] = price;
  for (let i = 1; i < TICK_COUNT; i++) {
    const shock = (rand() - 0.5) * 0.7;
    const reversion = (BASE_PRICE - price) * 0.02;
    price = price + shock + reversion;
    out[i] = price;
  }
  return out;
}

/** Price at `elapsedMs` into the round, interpolated between samples. */
export function priceAt(seed: number, elapsedMs: number): number {
  const series = priceSeries(seed);
  return priceFromSeries(series, elapsedMs);
}

/** Same, when the caller already holds the series (the chart, every frame). */
export function priceFromSeries(series: number[], elapsedMs: number): number {
  if (elapsedMs <= 0) return series[0];
  const exact = elapsedMs / TICK_MS;
  const i = Math.floor(exact);
  if (i >= series.length - 1) return series[series.length - 1];
  const frac = exact - i;
  return series[i] + (series[i + 1] - series[i]) * frac;
}

/**
 * The line the round is judged against: the price at the moment betting closed.
 *
 * Players are backing where the price goes *after* they stop being able to
 * react to it, which is the only version of this game that is not simply a race
 * to click last.
 */
export function neutralAxisFor(seed: number): number {
  return priceAt(seed, BETTING_MS);
}

/** Where the price finished. Compared against the neutral axis to pick a side. */
export function finalPriceFor(seed: number): number {
  const series = priceSeries(seed);
  return series[series.length - 1];
}

/**
 * How close to the axis still counts as no movement.
 *
 * Exact equality never happens with floats, so without a band the "neutral"
 * outcome would be unreachable and a round decided by the fifteenth decimal
 * place would pay out as a real win.
 */
export const NEUTRAL_BAND = 0.05;

export type RoundWinner = "buyers" | "sellers" | "neutral";

export function winnerFor(finalPrice: number, neutralAxis: number): RoundWinner {
  const delta = finalPrice - neutralAxis;
  if (Math.abs(delta) <= NEUTRAL_BAND) return "neutral";
  return delta > 0 ? "buyers" : "sellers";
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

/** The house's cut of the losing pool. The winners share what is left. */
export const HOUSE_RAKE = 0.08;

/**
 * How the net losing pool is split between the $1 and $2 books.
 *
 * $2 stakes take the larger share because they carried the larger risk, but not
 * proportionally larger — a straight pro-rata split makes $1 bets pointless on
 * a table where anyone can afford $2, and the $1 ticket is what lets somebody
 * play at all.
 */
export const POOL_SHARE_ONE = 0.35;
export const POOL_SHARE_TWO = 0.65;

/**
 * What each winning stake earns, given the losing pool and the winning book.
 *
 * Returns profit per stake size, not the total return — the caller adds the
 * stake back, because the stake was debited when the bet was placed and has to
 * come home separately from the winnings.
 */
export function profitPerStake(
  losersTotal: number,
  winners1: number,
  winners2: number,
): { perOne: number; perTwo: number; houseFee: number } {
  const houseFee = losersTotal * HOUSE_RAKE;
  const net = losersTotal - houseFee;

  /*
   * If one book is empty its share has nobody to go to. Handing it to the house
   * would quietly raise the rake to 73% whenever no $2 bet was placed, so it
   * falls through to the other book instead.
   */
  const share1 = winners1 > 0 ? (winners2 > 0 ? POOL_SHARE_ONE : 1) : 0;
  const share2 = winners2 > 0 ? (winners1 > 0 ? POOL_SHARE_TWO : 1) : 0;

  return {
    perOne: winners1 > 0 ? (net * share1) / winners1 : 0,
    perTwo: winners2 > 0 ? (net * share2) / winners2 : 0,
    houseFee,
  };
}
