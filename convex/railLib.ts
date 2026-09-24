/**
 * Aurum rails — shared constants and pure helpers.
 *
 * Ported from SGX Pay (`chessa/convex/merchantLib.ts`). No Convex functions
 * live here; the deposit queries, the chain watcher and the payout path all
 * import it so the money maths sits in exactly one place.
 *
 * The one deliberate divergence from SGX: **inbound is free**. Aurum is a game,
 * the deposit is a stake in waiting, and charging to put money on the table
 * discourages the only thing the platform wants people to do. The tag maths is
 * kept anyway — not for the fee, but because it is what lets one shared agent
 * wallet serve every player.
 */

/** The chain both rails settle on. */
export const INBOUND_CHAIN = "BNB Smart Chain (BEP20)";

/** Assets a player may deposit or be paid in. */
export const RAIL_ASSETS = ["USDT", "USDC"] as const;
export type RailAsset = (typeof RAIL_ASSETS)[number];

export function isRailAsset(value: string): value is RailAsset {
  return (RAIL_ASSETS as readonly string[]).includes(value);
}

/** How long a quoted deposit stays advertised. */
export const DEPOSIT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * How long after expiry a transfer can still be matched back to a deposit.
 *
 * Expiry is a quote deadline, not a claim on the player's money. People fund a
 * wallet and send late, exchanges withdraw on a delay, and a transfer carrying
 * a deposit's unique payable amount is unambiguous however late it lands.
 * Without this window such a payment matches nothing, is filed as unclaimed,
 * and has to be reconciled by hand — which in SGX is how a real customer
 * payment went missing.
 */
export const LATE_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Confirmations before a detected deposit becomes spendable balance. */
export const REQUIRED_CONFIRMATIONS = 6;

/**
 * Smallest/largest deposit the rail will quote, in token units.
 *
 * Half a dollar, not one: the point of a penny game is that the entry price is
 * not a decision. A minimum that exceeds the smallest stake turns "try it" into
 * "commit first".
 */
export const MIN_DEPOSIT = 0.5;
export const MAX_DEPOSIT = 10_000;

/**
 * Inbound fee. Zero on purpose — see the note at the top of this file. It is a
 * named constant rather than an absent concept so switching it on later is a
 * one-line change that flows through `buildPayableAmount` and the credit path
 * without either of them being touched.
 */
export const DEPOSIT_FEE_PERCENT = 0;

/**
 * Outbound fee on a **crypto** withdrawal, in percent of the gross.
 *
 * Two percent. The only real cost on this side is gas — about $0.002 for a
 * BEP-20 transfer — so almost all of this is margin, and it is set by what is
 * fair rather than by what it costs. The player is taking back their own money.
 *
 * Deliberately lower than the EcoCash rate. Crypto is the cheap rail and should
 * visibly be the cheap rail: it is the one that works at small sizes, and the
 * one a player should be nudged toward when they are withdrawing $2.
 *
 * Override per deployment with `AURUM_WITHDRAW_FEE_PERCENT`.
 */
export const DEFAULT_WITHDRAW_FEE_PERCENT = 2;

/**
 * Outbound fee on an **EcoCash** withdrawal, in percent of the gross.
 *
 * Half a point more than crypto, and it is not arbitrary: an EcoCash payout is
 * an order placed with a third party, reconciled, polled to completion and
 * occasionally refunded. That is work crypto does not need, and work that
 * happens whether or not the payout succeeds.
 *
 * Not 3%. SGX charges 3% because SGX moves remittance-sized amounts where three
 * points is real money. Here the ticket is a few dollars: at $5 the difference
 * between 2.5% and 3% is two and a half cents, while Chessa's flat cut is $1.10.
 * Charging the higher number would earn nothing worth having and would make the
 * headline worse than the parent product's for no gain.
 *
 * Override with `AURUM_ECOCASH_FEE_PERCENT`.
 */
export const DEFAULT_ECOCASH_FEE_PERCENT = 2.5;

export function ecocashFeePercent(): number {
  return numberFromEnv("AURUM_ECOCASH_FEE_PERCENT", DEFAULT_ECOCASH_FEE_PERCENT);
}

/**
 * Floor on the outbound fee, so a dust withdrawal cannot cost the house gas.
 *
 * Five cents, measured rather than guessed. A BEP-20 transfer on BSC is ~60k
 * gas at ~0.05 gwei, which is about **$0.002** — so this carries roughly 25x
 * headroom for a gas spike and still stays out of the way.
 *
 * It was $0.25, set when the minimum withdrawal was $1. Dropping the minimum to
 * $0.50 turned that floor into a 50% fee at the bottom of the range, and 25% at
 * a dollar: a penny game whose cheapest withdrawal costs half of itself is one
 * nobody withdraws from, and a fee that large stops being a cost recovery and
 * becomes a reason not to have deposited.
 *
 * Left at five cents when the rate went to 2%, having briefly been ten. Ten
 * looked harmless because it only binds below $5 — but the binding range is
 * exactly where this game lives, and at the $0.50 minimum it is a 20% fee. The
 * paragraph above says why that is the wrong direction; doubling the floor was
 * the same mistake in smaller print.
 */
export const DEFAULT_WITHDRAW_MIN_FEE_USD = 0.05;

/**
 * Smallest withdrawal worth a chain transaction.
 *
 * Matched to the deposit minimum so a player can always take back what they
 * were allowed to put in — a floor higher than the entry price is a trap.
 */
export const MIN_WITHDRAW_USD = 0.5;

/**
 * Chessa will not deliver an EcoCash payout below this, in USD **received**.
 *
 * Their Zimbabwe route publishes `limits: { min: 2, max: 10000 }`, and it is
 * enforced on the amount the recipient gets — not the amount the player asked
 * for. A $2.00 withdrawal with a $0.05 fee sends $1.95, which is under the
 * floor and comes back as a bare "Server Error" with a request id: no mention
 * of a limit, nothing a player or an operator could act on. This is the same
 * number, checked on our side, before anything is debited.
 *
 * Env-overridable because it is Chessa's number to change, not ours.
 */
export const DEFAULT_ECOCASH_MIN_NET_USD = 2;

export function ecocashMinNetUsd(): number {
  const raw = process.env.AURUM_ECOCASH_MIN_NET_USD?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ECOCASH_MIN_NET_USD;
}

export const EXPLORER_BASE = "https://bscscan.com";

export function explorerTxUrl(txHash?: string | null): string | null {
  return txHash ? `${EXPLORER_BASE}/tx/${txHash}` : null;
}

export function explorerAddressUrl(address?: string | null): string | null {
  return address ? `${EXPLORER_BASE}/address/${address}` : null;
}

/** Statuses an incoming transfer can still be matched against. */
export const OPEN_DEPOSIT_STATUSES = ["awaiting_payment", "underpaid"] as const;

/** Statuses the UI should stop polling on. */
export const TERMINAL_DEPOSIT_STATUSES = [
  "confirmed",
  "expired",
  "cancelled",
] as const;

export function isTerminalDepositStatus(status: string): boolean {
  return (TERMINAL_DEPOSIT_STATUSES as readonly string[]).includes(status);
}

/** Token amounts are carried to 6 dp everywhere; floats are rounded on every write. */
export function roundAmount(value: number, dp = 6): number {
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}

/** USD ledger amounts are cents. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The fee taken off an inbound transfer and what the player nets. Fees are
 * charged on what actually arrived, never on what was asked for.
 */
export function splitFee(
  received: number,
  feePercent: number,
): { fee: number; net: number } {
  const pct = Number.isFinite(feePercent) && feePercent > 0 ? feePercent : 0;
  const fee = roundAmount((received * pct) / 100);
  return { fee, net: roundAmount(received - fee) };
}

/**
 * The amount whose fee leaves exactly `requested` behind.
 *
 * The correction is division, not markup: adding 1.7% to 1.00 gives 1.017, and
 * 1.7% of 1.017 is 0.017289, so the payer still lands at 0.999711 — short every
 * time, forever. Dividing by (1 - rate) is the figure that nets the invoice.
 * With `DEPOSIT_FEE_PERCENT` at 0 this is the identity, which is the point: the
 * maths is already right for the day the fee turns on.
 */
export function grossUpForFee(requested: number, feePercent: number): number {
  const p = Number.isFinite(feePercent) && feePercent > 0 ? feePercent / 100 : 0;
  if (p <= 0 || p >= 1) return roundAmount(requested, 6);
  return roundAmount(requested / (1 - p), 6);
}

/**
 * Deposits from every player land in one agent wallet, so each open deposit is
 * given a unique payable amount: the fee-inclusive figure plus a 5 dp tag
 * between 0.00001 and 0.09999. An inbound transfer of exactly that amount
 * identifies exactly one deposit.
 *
 * It does not go past 5 dp on purpose. Adjacent tags are then 1e-5 apart, ten
 * times the 1e-6 tolerance the watcher matches within. At 6 dp neighbouring
 * deposits would sit exactly one epsilon apart and a transfer could match
 * either one.
 */
export function buildPayableAmount(
  requested: number,
  tag: number,
  feePercent = DEPOSIT_FEE_PERCENT,
): number {
  const base = grossUpForFee(Math.round(requested * 100) / 100, feePercent);
  return roundAmount(base + tag / 100_000, 6);
}

/** Deterministic-ish tag from a nonce, kept inside 1…9999. */
export function tagFromNonce(nonce: number): number {
  return (Math.abs(Math.floor(nonce)) % 9999) + 1;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random lowercase id of `len` characters. */
export function randomId(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Public handle for a deposit. Convex document ids never leave the backend. */
export function buildDepositReference(): string {
  return `aurd_${randomId(20)}`;
}

/** Public handle for a payout. */
export function buildPayoutReference(): string {
  return `aurw_${randomId(20)}`;
}

export type WithdrawRail = "crypto" | "ecocash";

/**
 * Withdrawal fee on a gross amount, honouring the env overrides.
 *
 * Returns the gross, the fee and what actually goes out. The caller debits the
 * gross and sends the net, so a failed payout refunds one number and the books
 * never have to reason about a partially-charged withdrawal.
 */
export function computeWithdrawFee(
  gross: number,
  rail: WithdrawRail = "crypto",
): {
  gross: number;
  fee: number;
  net: number;
} {
  /*
   * The rail decides the rate. Passing it explicitly rather than reading a
   * single global means a change to the EcoCash price cannot silently reprice
   * crypto, which is the kind of edit that looks like a one-line tweak and
   * moves money on a rail nobody was thinking about.
   */
  const pct =
    rail === "ecocash"
      ? ecocashFeePercent()
      : numberFromEnv(
          "AURUM_WITHDRAW_FEE_PERCENT",
          DEFAULT_WITHDRAW_FEE_PERCENT,
        );
  const min = numberFromEnv(
    "AURUM_WITHDRAW_MIN_FEE_USD",
    DEFAULT_WITHDRAW_MIN_FEE_USD,
  );
  const g = roundMoney(gross);
  const raw = Math.max(roundMoney((g * pct) / 100), min);
  // Never let the fee eat the whole withdrawal: a payout of nothing is a fee
  // dressed up as a transfer, and the player would have paid to receive zero.
  const fee = Math.min(raw, roundMoney(g - 0.01));
  return { gross: g, fee, net: roundMoney(g - fee) };
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** ERC-20 contract addresses per asset, chosen by `IS_LIVE`. */
export function tokenAddresses(isLive: boolean): Record<RailAsset, string> {
  return isLive
    ? {
        USDT: "0x55d398326f99059fF775485246999027B3197955",
        USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      }
    : {
        USDT: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
        USDC: "0x64544969ed7EBf5f083679233325356EbE738930",
      };
}

/**
 * Decimals for the tokens we settle in. Both are 18 on BSC (unlike Ethereum's
 * 6-decimal USDT/USDC) and `decimals()` is immutable in both contracts, so
 * there is nothing to re-read every tick.
 */
export const KNOWN_DECIMALS: Record<string, number> = { USDT: 18, USDC: 18 };

/** A BEP-20 address, loosely. Checksumming is left to ethers. */
export function isEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/**
 * Normalise a Zimbabwean mobile number to E.164.
 *
 * Kept next to the rail constants rather than in the EcoCash module because
 * both payout paths and the player profile write it.
 */
export function normalizeE164Zimbabwe(raw: string): string {
  let t = raw.replace(/\s/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  if (t.startsWith("0") && t.length >= 9) t = "+263" + t.slice(1);
  if (/^263[0-9]{9,}$/.test(t)) t = "+" + t;
  if (t.startsWith("7") && t.length === 9) t = "+263" + t;
  if (!t.startsWith("+")) t = `+${t}`;
  return t;
}

/**
 * The key the agent wallet signs with, under any of the names in use.
 *
 * Three names because the deployment inherited env from SGX (`PRIVATE_KEY`) and
 * from the earlier Penny treasury (`PENNY_TREASURY_BEP20_PRIVATE_KEY`). New
 * deployments should set `AURUM_AGENT_PRIVATE_KEY` and nothing else; the
 * fallbacks exist so an existing deployment keeps working without a re-key.
 */
export function agentPrivateKey(): string | undefined {
  return (
    process.env.AURUM_AGENT_PRIVATE_KEY?.trim() ||
    process.env.PENNY_TREASURY_BEP20_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim() ||
    undefined
  );
}

/** BSC JSON-RPC endpoints, most-trusted first. Comma-separated env is allowed. */
export function bscRpcUrls(isLive: boolean): string[] {
  const configured = (
    process.env.AURUM_BSC_RPC_URL ||
    process.env.PENNY_BSC_RPC_URL ||
    process.env.BSC_RPC_URL ||
    ""
  ).trim();
  const list = configured
    ? configured.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  /*
   * publicnode leads the fallbacks because, measured against the exact
   * `eth_getLogs` query the watcher makes, the Binance dataseeds refuse a range
   * of even one block and meowrpc does not implement the method at all. A
   * watcher built on log scanning simply stops on those. publicnode gates
   * *archive* reads, so it keeps a current cursor moving but cannot drag one
   * that has fallen days behind back to the head; a provider with history is
   * still the real fix, which is why the configured list always wins.
   */
  const fallbacks = isLive
    ? [
        "https://bsc-rpc.publicnode.com",
        "https://bsc-dataseed.binance.org/",
        "https://bsc-dataseed2.defibit.io/",
      ]
    : [
        "https://data-seed-prebsc-1-s1.binance.org:8545/",
        "https://data-seed-prebsc-2-s1.binance.org:8545/",
      ];
  return list.length ? [...list, ...fallbacks] : fallbacks;
}

/**
 * Does this chain error mean "that nonce was taken" rather than "it failed"?
 *
 * The agent wallet is shared with SGX, which signs from it on its own schedule.
 * We cannot lock against a process we do not run, so the answer to a collision
 * is to notice it and try again with a fresh nonce.
 *
 * Every string here describes a transaction the node **refused**, which is what
 * makes retrying safe: nothing was broadcast, so nothing can be sent twice. A
 * transaction that reached the mempool fails with something else entirely, and
 * that must never come through here.
 */
export function isNonceConflict(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("nonce too low") ||
    msg.includes("nonce has already been used") ||
    msg.includes("replacement transaction underpriced") ||
    msg.includes("already known") ||
    msg.includes("known transaction") ||
    msg.includes("invalid nonce")
  );
}


/**
 * Where the cached USD-per-USDT rate lives.
 *
 * A dollar is not a USDT: Chessa quotes about 0.9975 USD per USDT, so a $3
 * deposit is 3.007519 USDT. Treating them as equal under-funds the float on
 * every deposit and overstates what a balance is worth in tokens — small per
 * transaction, and permanent.
 *
 * Cached because the rate is fetched over the network and the paths that need
 * it include queries, which cannot fetch at all.
 */
export const USDT_RATE_KEY = "chessaUsdPerUsdt";

/** Falls back to par only when no rate has ever been cached. Par is a guess. */
export const FALLBACK_USD_PER_USDT = 0.9975;

/** USD → USDT at a given rate (USD per USDT). */
export function usdToUsdt(usd: number, usdPerUsdt: number): number {
  const rate =
    Number.isFinite(usdPerUsdt) && usdPerUsdt > 0
      ? usdPerUsdt
      : FALLBACK_USD_PER_USDT;
  return roundAmount(usd / rate, 6);
}

/** USDT → USD at a given rate. */
export function usdtToUsd(usdt: number, usdPerUsdt: number): number {
  const rate =
    Number.isFinite(usdPerUsdt) && usdPerUsdt > 0
      ? usdPerUsdt
      : FALLBACK_USD_PER_USDT;
  return roundMoney(usdt * rate);
}


/**
 * Chessa's own service fee on an EcoCash payout, in USD.
 *
 * Charged **on top of** the amount delivered, and in the asset we send: their
 * orders on this account quoted 3.01 USDT to deliver $2.00 and 5.02 to deliver
 * ~$4.00 — a flat ~$1.01, not a percentage.
 *
 * It was never collected from the player, which made EcoCash arithmetically
 * impossible rather than merely expensive: our fee is a percentage and the
 * shortfall is a constant, so no amount could ever cover it and the guard
 * refused every one. Now it is quoted, so the player sees the real cost and
 * the float is never asked to absorb it.
 *
 * An estimate, because Chessa exposes it only on order creation — `getRate`
 * returns the rate alone. Set slightly above the observed figure: quoting a
 * little high refunds the difference to nobody, while quoting low reproduces
 * exactly the failure this exists to remove.
 */
export const DEFAULT_CHESSA_PAYOUT_FEE_USD = 1.1;

export function chessaPayoutFeeUsd(): number {
  const raw = process.env.AURUM_CHESSA_PAYOUT_FEE_USD?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CHESSA_PAYOUT_FEE_USD;
}

/**
 * What an EcoCash cash-out really costs the player.
 *
 * `gross` leaves their balance; `delivered` reaches the recipient. Between them
 * sit our fee and Chessa's. Returns null when the gross cannot cover both —
 * which is the honest answer for small amounts, not something to paper over.
 */
/**
 * The percentage half of Chessa's tariff.
 *
 * Their cost is not flat — it is a percentage **plus** a flat fee, both charged
 * on top of the amount delivered rather than taken out of it. SGX proved the
 * shape on a live order: asking for 4.765 produced "they receive 4.75 USD, send
 * exactly 5.79 USDT", which is `4.765 × 1.005 + 1.00`.
 *
 * Modelling this as a flat fee alone is what made our quotes drift. The error
 * is small on a $5 payout and grows with the amount, so it passes every test
 * anybody runs by hand and then misprices the withdrawals that matter.
 *
 * It is still only ever a **prediction**. The funding endpoint states the real
 * requirement per order and that is what gets funded — this exists so the
 * player is shown a number close to the truth before they commit, and so the
 * spend guard has something sane to compare against.
 */
export const DEFAULT_CHESSA_PAYOUT_FEE_PERCENT = 0.5;

export function chessaPayoutFeePercent(): number {
  return numberFromEnv(
    "AURUM_CHESSA_PAYOUT_FEE_PERCENT",
    DEFAULT_CHESSA_PAYOUT_FEE_PERCENT,
  );
}

export function quoteEcocashPayout(gross: number): {
  gross: number;
  ourFee: number;
  chessaFee: number;
  delivered: number;
} | null {
  const { fee: ourFee } = computeWithdrawFee(gross, "ecocash");
  const flat = chessaPayoutFeeUsd();
  const pct = chessaPayoutFeePercent() / 100;

  /*
   * Solve for what actually lands, rather than subtracting a guess.
   *
   * Chessa charges on top of the delivered amount: funding = delivered × (1+pct)
   * + flat. What we have to spend is gross − ourFee. Rearranged, that gives the
   * delivered figure below. Subtracting a percentage from the gross instead —
   * the obvious way to write this — takes the percentage off the wrong number
   * and over-promises the player by a little more with every extra dollar.
   */
  const spendable = roundMoney(gross - ourFee);
  const delivered = roundMoney((spendable - flat) / (1 + pct));
  if (delivered <= 0) return null;

  return {
    gross: roundMoney(gross),
    ourFee,
    // What Chessa takes, stated as one number the player can read.
    chessaFee: roundMoney(spendable - delivered),
    delivered,
  };
}

/** Smallest gross that both covers Chessa's fee and clears their floor. */
export function minEcocashGrossWithFee(minNet: number): number {
  for (let cents = 1; cents <= 100_000; cents++) {
    const q = quoteEcocashPayout(cents / 100);
    if (q && q.delivered >= minNet - 1e-9) return q.gross;
  }
  return roundMoney(minNet + chessaPayoutFeeUsd() + 1);
}


/**
 * Withdrawals off, deliberately.
 *
 * A flag rather than removed code, because the reason is temporary: the payout
 * float is thin and the house has no capital behind it yet. Turning it back on
 * should be one env change, not a deploy and a re-review of code somebody
 * commented out.
 *
 * Read on the **server**, in both payout mutations. Hiding the form is a
 * courtesy to whoever is looking at it; the gate is the thing that stops a
 * direct call to the mutation, and a switch that only exists in the UI is not
 * a switch.
 */
export function withdrawalsPaused(): boolean {
  return process.env.AURUM_WITHDRAWALS_PAUSED?.trim() === "true";
}

/**
 * What to tell the player.
 *
 * Says the real reason. "Temporarily unavailable" invites the suspicion that
 * their money is gone; naming the float makes it a capacity problem with an
 * end, and the balance stays visible and intact behind it.
 */
export function withdrawalPauseMessage(): string {
  return (
    process.env.AURUM_WITHDRAWALS_PAUSED_MESSAGE?.trim() ||
    "Withdrawals are paused while we top up the payout float. Your balance is " +
      "safe and unchanged, and you can keep playing — cash-outs will reopen shortly."
  );
}
