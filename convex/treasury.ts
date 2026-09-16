/**
 * Who owns the tokens in the agent wallet.
 *
 * Players see a dollar balance — $2, $5, $6 — and underneath, that is a claim
 * on USDT sitting at the agent address. This is where that mapping is made
 * explicit: every player's share, what the platform owes in total, and whether
 * the wallet actually holds it.
 *
 * **There is deliberately no second balance field.** The obvious build is a
 * `userHoldings` table carrying a token figure alongside `users.balance`, and
 * it is a trap: two numbers that must be updated in the same seven places —
 * deposit credit, stake debit, win, loss, void refund, payout debit, payout
 * refund — will disagree the first time one of those paths is added or changed,
 * and a solvency report built on a counter that has silently drifted is worse
 * than having no report at all, because it is believed.
 *
 * So the balance is the **claim**, in dollars, and the token figure is that
 * claim converted at the live rate — not asserted to be the same number. A
 * dollar is not a USDT: Chessa quotes about 0.9975 USD per USDT, so a $3
 * balance is 3.007519 USDT. Calling them equal understates what the float has
 * to hold, by a quarter of a percent, permanently.
 */
import {
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  FALLBACK_USD_PER_USDT,
  USDT_RATE_KEY,
  roundAmount,
  roundMoney,
  usdToUsdt,
} from "./railLib";
import { withdrawableFor } from "./withdrawable";

/** Balances below this are rounding dust, not a holding worth listing. */
const DUST = 0.005;

/**
 * The cached USD-per-USDT rate, or the fallback when none has been stored.
 *
 * A query cannot fetch, so the rate is whatever the cron last wrote. Stale by
 * minutes is fine for a display figure; asserting parity was not.
 */
async function cachedRate(
  ctx: QueryCtx | MutationCtx,
): Promise<{ usdPerUsdt: number; stale: boolean }> {
  const row = await ctx.db
    .query("railConfig")
    .withIndex("by_key", (q) => q.eq("key", USDT_RATE_KEY))
    .first();
  if (row?.value) {
    try {
      const p = JSON.parse(row.value) as { usdPerUsdt?: number; at?: number };
      const r = Number(p.usdPerUsdt);
      if (Number.isFinite(r) && r > 0) {
        return { usdPerUsdt: r, stale: Date.now() - (p.at ?? 0) > 864e5 };
      }
    } catch {
      /* fall through */
    }
  }
  return { usdPerUsdt: FALLBACK_USD_PER_USDT, stale: true };
}

/**
 * Total owed to players, and the biggest holders.
 *
 * Capped at 2,000 accounts. Past that the sum stops being exact and the report
 * says so rather than quietly under-reporting the liability — an understated
 * "we owe" is the one error this must never make.
 */
export const liabilities = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const scanCap = 2000;
    const users = await ctx.db.query("users").take(scanCap + 1);
    const truncated = users.length > scanCap;
    const rows = users.slice(0, scanCap);

    const { usdPerUsdt, stale } = await cachedRate(ctx);

    const holders = rows
      .map((u) => ({
        userId: u._id as Id<"users">,
        email: u.email ?? null,
        name: u.name ?? null,
        usd: roundMoney(u.balance ?? 0),
        // Converted, not assumed equal.
        usdt: usdToUsdt(u.balance ?? 0, usdPerUsdt),
      }))
      .filter((h) => h.usd > DUST)
      .sort((a, b) => b.usd - a.usd);

    return {
      accountsScanned: rows.length,
      truncated,
      usdPerUsdt,
      rateStale: stale,
      holderCount: holders.length,
      totalOwedUsd: roundMoney(holders.reduce((s, h) => s + h.usd, 0)),
      /** What the float must actually hold in tokens to cover the claims. */
      totalOwedUsdt: roundAmount(holders.reduce((s, h) => s + h.usdt, 0)),
      topHolders: holders.slice(0, Math.min(args.limit ?? 25, 100)),
    };
  },
});

/**
 * Money still in flight, which a solvency check has to account for separately.
 *
 * A queued payout has already left the player's balance but not yet the wallet,
 * so it is neither a liability nor spendable float. Counting it as neither is
 * what makes the surplus figure mean something.
 */
export const inFlight = internalQuery({
  args: {},
  handler: async (ctx) => {
    const crypto = await ctx.db
      .query("cryptoPayouts")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(200);
    const sending = await ctx.db
      .query("cryptoPayouts")
      .withIndex("by_status", (q) => q.eq("status", "sending"))
      .take(200);
    const ecocash = (
      await ctx.db.query("ecocashPayouts").order("desc").take(300)
    ).filter((p) => p.status === "queued" || p.status === "sgx_submitted");

    const cryptoOut = roundMoney(
      [...crypto, ...sending].reduce((s, p) => s + p.amountToken, 0),
    );
    const ecocashOut = roundMoney(
      ecocash.reduce((s, p) => s + (p.netUsd ?? p.amountUsd), 0),
    );

    return {
      cryptoPayoutsPending: crypto.length + sending.length,
      cryptoOutUsdt: cryptoOut,
      ecocashPayoutsPending: ecocash.length,
      ecocashOutUsdt: ecocashOut,
      totalInFlightUsdt: roundMoney(cryptoOut + ecocashOut),
    };
  },
});

/**
 * What one player's balance means in tokens, for their own wallet screen.
 *
 * Says where the tokens are, because "held for you" is a claim a player is
 * entitled to check: the address is public and the balance is on chain.
 */
export const myHolding = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const address =
      process.env.AURUM_DEPOSIT_ADDRESS?.trim() ??
      (
        await ctx.db
          .query("railConfig")
          .withIndex("by_key", (q) => q.eq("key", "depositAddress"))
          .first()
      )?.value ??
      null;

    const { usdPerUsdt } = await cachedRate(ctx);

    return {
      balanceUsd: roundMoney(user.balance ?? 0),
      // Converted at the live rate. A dollar is not a token.
      holdingUsdt: usdToUsdt(user.balance ?? 0, usdPerUsdt),
      usdPerUsdt,
      asset: "USDT",
      chain: "BNB Smart Chain (BEP20)",
      custodyAddress: address,
      custodyUrl: address ? `https://bscscan.com/address/${address}` : null,
    };
  },
});


/**
 * One player's position, for support and for answering "how much can I take
 * out today" without guessing.
 *
 * Internal: it reads another person's money, so it is reachable only with a
 * deploy key, never from a browser.
 */
export const playerStatement = internalQuery({
  args: { email: v.optional(v.string()), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = args.userId
      ? await ctx.db.get(args.userId)
      : args.email
        ? await ctx.db
            .query("users")
            .withIndex("email", (q) =>
              q.eq("email", args.email!.trim().toLowerCase()),
            )
            .first()
        : null;
    if (!user) return { found: false as const };

    const w = await withdrawableFor(ctx, user._id);
    const deposits = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(10);

    return {
      found: true as const,
      email: user.email ?? null,
      balanceUsd: w.balance,
      holdingUsdt: usdToUsdt(w.balance, (await cachedRate(ctx)).usdPerUsdt),
      deposited: w.deposited,
      withdrawn: w.withdrawn,
      withdrawableToday: w.withdrawable,
      lockedWinnings: w.locked,
      partialLedger: w.partial,
      recentDeposits: deposits.map((d) => ({
        reference: d.reference,
        via: d.onrampProvider ?? "crypto",
        status: d.status,
        credited: d.amountCredited ?? 0,
        txHash: d.txHash ?? null,
      })),
    };
  },
});
