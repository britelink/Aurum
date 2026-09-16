/**
 * Plain-runtime half of the EcoCash deposit.
 *
 * `pesepayDeposit.ts` runs in Node for the Pesepay SDK and cannot touch the
 * database; these are the writes it needs. Internal, so the only way in is
 * through the action that actually talked to Pesepay.
 */
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  INBOUND_CHAIN,
  buildDepositReference,
  roundMoney,
} from "./railLib";

/**
 * A deposit that will be settled by Pesepay, not by the chain.
 *
 * `status: "awaiting_ecocash"` is load-bearing. The watcher matches open
 * deposits by their payable amount, and this row has no tag — the money is
 * never coming on chain, so there is nothing to tag. Leaving it in
 * `awaiting_payment` would put an untagged round number into the matching pool,
 * where an unrelated on-chain transfer of exactly $10 could claim it. A status
 * the matcher does not look at keeps the two rails from ever meeting.
 */
export const createEcocashDeposit = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const amount = roundMoney(args.amount);
    const reference = buildDepositReference();

    const depositId = await ctx.db.insert("cryptoDeposits", {
      userId: args.userId,
      reference,
      asset: "USD",
      chain: "EcoCash (Pesepay)",
      amountRequested: amount,
      amountPayable: amount,
      amountReceived: 0,
      feeAmount: 0,
      feePercentAtCreate: 0,
      depositAddress: "ecocash",
      status: "awaiting_ecocash",
      onrampProvider: "pesepay",
      onrampPhone: args.phone,
      onrampFiatAmount: amount,
      // 30 minutes: an EcoCash prompt the payer ignores is dead long before
      // this, and the poll ceiling stops it sooner anyway.
      expiresAt: now + 30 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });

    return { depositId, reference };
  },
});

export const getDeposit = internalQuery({
  args: { depositId: v.id("cryptoDeposits") },
  handler: async (ctx, { depositId }) => ctx.db.get(depositId),
});

export const markPesepayInitiated = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    reference: v.string(),
    phone: v.string(),
    amount: v.number(),
    raw: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.depositId);
    if (!row) return;
    await ctx.db.patch(args.depositId, {
      onrampReference: args.reference,
      onrampPhone: args.phone,
      onrampFiatAmount: args.amount,
      onrampStatus: "initiated",
      onrampRaw: args.raw?.slice(0, 8000),
      onrampInitiatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markPesepayFailed = internalMutation({
  args: { depositId: v.id("cryptoDeposits"), error: v.string() },
  handler: async (ctx, { depositId, error }) => {
    const row = await ctx.db.get(depositId);
    if (!row || row.status !== "awaiting_ecocash") return;
    await ctx.db.patch(depositId, {
      status: "cancelled",
      onrampStatus: "failed",
      onrampError: error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Pesepay says the money is in. Credit the player.
 *
 * Idempotent on `status`: the poll chain and a webhook retry can both arrive,
 * and a second credit would be money invented.
 *
 * **This credit is backed by fiat, not USDT.** A crypto deposit puts tokens in
 * the agent wallet that a crypto withdrawal later spends; this one puts USD in
 * a Pesepay merchant account while withdrawals still spend from the agent
 * wallet. Net EcoCash-in / crypto-out therefore drains the on-chain float while
 * cash accumulates at Pesepay, and the two have to be rebalanced by hand. That
 * is an operational cost of collecting directly, and it is the reason the SGX
 * route converted to USDT on the way in.
 */
export const creditPaidDeposit = internalMutation({
  args: { depositId: v.id("cryptoDeposits") },
  handler: async (ctx, { depositId }) => {
    const row = await ctx.db.get(depositId);
    if (!row || row.status !== "awaiting_ecocash") {
      return { credited: false as const };
    }

    const user = await ctx.db.get(row.userId);
    if (!user) {
      console.error(
        `[aurum-rail] ${row.reference} paid but user ${row.userId} is missing`,
      );
      return { credited: false as const };
    }

    const amount = roundMoney(row.amountRequested);
    const now = Date.now();

    const transactionId = await ctx.db.insert("transactions", {
      userId: row.userId,
      amount,
      type: "deposit",
      status: "completed",
      timestamp: now,
      paymentMethod: "ecocash-usd",
      ref: row.reference,
    });

    await ctx.db.patch(row.userId, {
      balance: roundMoney((user.balance ?? 0) + amount),
    });

    await ctx.db.patch(depositId, {
      status: "confirmed",
      amountReceived: amount,
      amountCredited: amount,
      onrampStatus: "paid",
      creditedTransactionId: transactionId,
      paidAt: now,
      updatedAt: now,
    });

    return { credited: true as const, amount };
  },
});

/** Re-exported so the deposit UI can talk about the chain it settles on. */
export const ECOCASH_CHAIN_LABEL = INBOUND_CHAIN;
