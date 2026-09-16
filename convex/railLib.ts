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
 * Outbound fee, in percent of the gross withdrawal.
 *
 * Deliberately low: the player is taking back their own money, and the only
 * real cost on this side is gas plus (for EcoCash) Chessa's own cut. Override
 * per deployment with `AURUM_WITHDRAW_FEE_PERCENT`.
 */
export const DEFAULT_WITHDRAW_FEE_PERCENT = 1.5;

/** Floor on the outbound fee, so a dust withdrawal cannot cost the house gas. */
export const DEFAULT_WITHDRAW_MIN_FEE_USD = 0.25;

/**
 * Smallest withdrawal worth a chain transaction.
 *
 * Matched to the deposit minimum so a player can always take back what they
 * were allowed to put in — a floor higher than the entry price is a trap.
 */
export const MIN_WITHDRAW_USD = 0.5;

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

/**
 * Withdrawal fee on a gross amount, honouring the env overrides.
 *
 * Returns the gross, the fee and what actually goes out. The caller debits the
 * gross and sends the net, so a failed payout refunds one number and the books
 * never have to reason about a partially-charged withdrawal.
 */
export function computeWithdrawFee(gross: number): {
  gross: number;
  fee: number;
  net: number;
} {
  const pct = numberFromEnv(
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
