/**
 * Plain-runtime half of the EcoCash deposit.
 *
 * `pesepayDeposit.ts` runs in Node for the Pesepay SDK and cannot touch the
 * database; these are the writes it needs. Internal, so the only way in is
 * through the action that actually talked to Pesepay.
 */
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
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
    /**
     * Which collector we intend to try first. Recorded up front rather than on
     * success, so a row that dies mid-push still says who was holding it.
     */
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const amount = roundMoney(args.amount);
    const reference = buildDepositReference();
    const provider = args.provider ?? "pesepay";

    const depositId = await ctx.db.insert("cryptoDeposits", {
      userId: args.userId,
      reference,
      asset: "USD",
      chain: provider === "zb" ? "EcoCash (ZB)" : "EcoCash (Pesepay)",
      amountRequested: amount,
      amountPayable: amount,
      amountReceived: 0,
      feeAmount: 0,
      feePercentAtCreate: 0,
      depositAddress: "ecocash",
      status: "awaiting_ecocash",
      onrampProvider: provider,
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

/**
 * Find the open deposit a provider's callback is talking about.
 *
 * Scoped to `awaiting_ecocash` deliberately, and not only as an index trick:
 * a reference that has already been settled must not be re-openable from
 * outside. The set is tiny — deposits waiting on a live USSD prompt — so
 * filtering within the status index costs nothing.
 */
export const getDepositByOnrampReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    const open = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_ecocash"))
      .collect();
    return open.find((d) => d.onrampReference === reference) ?? null;
  },
});

/**
 * Hand an open deposit to the other collector.
 *
 * Used when ZB refuses and we have *confirmed* nothing is in flight there, so
 * Pesepay can push on the same row. Reusing the row rather than opening a
 * second one is the point: one intent, one record, one possible credit.
 */
export const switchProvider = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    provider: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, { depositId, provider, reason }) => {
    const row = await ctx.db.get(depositId);
    if (!row || row.status !== "awaiting_ecocash") return;
    await ctx.db.patch(depositId, {
      onrampProvider: provider,
      chain: provider === "zb" ? "EcoCash (ZB)" : "EcoCash (Pesepay)",
      // Kept on the row, not just in logs: "why is this player on Pesepay
      // today" is a question with an answer, and it is usually the outage.
      onrampError: `switched from ${row.onrampProvider ?? "unknown"}: ${reason}`.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
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
 * The credit is immediate and unconditional. The matching USDT is released
 * from the reserve into the agent wallet on a scheduled action below, so a
 * reserve that is empty or out of gas delays our accounting, never the
 * player's money.
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

    /*
     * Release the matching USDT from the reserve into the agent wallet.
     *
     * Scheduled, not awaited: the player is credited the moment Pesepay
     * confirms, and a reserve that is empty or out of gas is the platform's
     * problem, not theirs. Holding the credit hostage to a treasury transfer
     * would turn our accounting into their outage.
     */
    await ctx.scheduler.runAfter(
      0,
      internal.reserveReleaseNode.releaseForEcocashDeposit,
      { depositId },
    );

    return { credited: true as const, amount };
  },
});

/** The reserve transfer landed — the balance is now token-backed on chain. */
export const markReleased = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    txHash: v.string(),
    usdtReleased: v.optional(v.number()),
    rateUsdPerUsdt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.depositId);
    if (!row || row.txHash) return;
    await ctx.db.patch(args.depositId, {
      txHash: args.txHash,
      // The rate that was actually used, not one recomputed later from a rate
      // that has since moved.
      usdtReleased: args.usdtReleased,
      rateUsdPerUsdt: args.rateUsdPerUsdt,
      updatedAt: Date.now(),
    });
  },
});

/**
 * The reserve could not cover it.
 *
 * Recorded on the row rather than thrown away, because this is an accounting
 * shortfall an operator has to clear: the player holds a credited balance that
 * no token yet backs. Deliberately does not touch `status` — the deposit really
 * did succeed from the player's side, and marking it failed would be a lie that
 * also breaks the release retry.
 */
export const markReleaseFailed = internalMutation({
  args: { depositId: v.id("cryptoDeposits"), error: v.string() },
  handler: async (ctx, { depositId, error }) => {
    const row = await ctx.db.get(depositId);
    if (!row) return;
    await ctx.db.patch(depositId, {
      onrampError: error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

/** Re-exported so the deposit UI can talk about the chain it settles on. */
export const ECOCASH_CHAIN_LABEL = INBOUND_CHAIN;
