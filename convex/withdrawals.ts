import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  MIN_WITHDRAW_USD,
  computeWithdrawFee,
  ecocashMinNetUsd,
  minEcocashGrossUsd,
  normalizeE164Zimbabwe,
  roundMoney,
} from "./railLib";
import { withdrawableFor, lockedExplanation } from "./withdrawable";

const MIN_USD = MIN_WITHDRAW_USD;

/**
 * Chessa's live floor if we have it, our constant if we do not.
 *
 * Read from the cache `chessaBridge.refreshEcocashLimits` keeps current, so a
 * change on their side reaches the withdraw form without a deploy.
 */
export async function readEcocashMinNet(
  ctx: { db: MutationCtx["db"] | QueryCtx["db"] },
): Promise<number> {
  const row = await ctx.db
    .query("railConfig")
    .withIndex("by_key", (q) => q.eq("key", "chessaEcocashLimits"))
    .first();
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value) as { min?: number };
      const min = Number(parsed.min);
      if (Number.isFinite(min) && min > 0) return min;
    } catch {
      /* fall through to the constant */
    }
  }
  return ecocashMinNetUsd();
}

/** Smallest gross that clears whichever floor is in force. */
export function grossForNet(target: number): number {
  for (
    let cents = Math.round(target * 100);
    cents <= Math.round(target * 100) + 200;
    cents++
  ) {
    const gross = cents / 100;
    if (computeWithdrawFee(gross).net >= target - 1e-9) return gross;
  }
  return roundMoney(target * 1.1);
}

export const getPayoutForAction = internalQuery({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    return await ctx.db.get(payoutId);
  },
});

/**
 * Payouts Chessa has an order for but has not resolved yet.
 *
 * Ordered oldest-first so a stuck row is looked at every tick rather than being
 * pushed off the end of the page by newer ones.
 */
export const listAwaitingSettlement = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_user_created")
      .order("asc")
      .take(300);
    return rows
      .filter((r) => r.status === "sgx_submitted")
      .slice(0, Math.min(args.limit ?? 25, 50));
  },
});

/**
 * Payouts we funded on chain that then failed — real money sitting at Chessa.
 *
 * This is the only case where a refund means anything. An order we never funded
 * holds nothing: the player was already made whole from our side, and the order
 * simply expires. An order we *did* fund has our USDT in it, and that is the
 * platform's money to reclaim.
 */
export const listFundedOrphans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("ecocashPayouts").order("desc").take(300);
    return rows
      .filter((r) => r.status === "failed" && r.tronFloatTxid && r.chessaOrderId)
      .map((r) => ({
        payoutId: r._id,
        chessaOrderId: r.chessaOrderId!,
        fundedTx: r.tronFloatTxid!,
        sentUsdt: r.sgxSendAmount ?? null,
        error: r.sgxError ?? null,
      }));
  },
});

/** Orders created but never funded — nothing to reclaim, they expire. */
export const listUnfundedOrphans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("ecocashPayouts").order("desc").take(300);
    return rows
      .filter((r) => r.status === "failed" && !r.tronFloatTxid && r.chessaOrderId)
      .map((r) => ({
        payoutId: r._id,
        chessaOrderId: r.chessaOrderId!,
        quotedUsdt: r.sgxSendAmount ?? null,
      }));
  },
});

/** Record what Chessa said about an order we did not complete. */
export const markOrderReconciled = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    chessaOrderStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.payoutId);
    if (!row) return;
    await ctx.db.patch(args.payoutId, {
      chessaOrderStatus: args.chessaOrderStatus,
      chessaCheckedAt: Date.now(),
    });
  },
});

/**
 * A refund of our funding leg has been asked for.
 *
 * Only ever reached for an order we actually funded. The reference is kept so
 * the return transfer can be matched when it arrives — a refund we requested
 * and then could not recognise on arrival is the same as no refund at all.
 */
export const markRefundRequested = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    chessaOrderStatus: v.string(),
    reference: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.payoutId);
    if (!row || row.refundRequestedAt) return;
    await ctx.db.patch(args.payoutId, {
      chessaOrderStatus: args.chessaOrderStatus,
      chessaCheckedAt: Date.now(),
      refundRequestedAt: Date.now(),
      refundReference: args.reference,
    });
  },
});

export const markPayoutSgxSuccess = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    sgxOrderId: v.string(),
    tronFloatTxid: v.optional(v.string()),
    sgxV0: v.optional(
      v.object({
        paymentAddress: v.optional(v.string()),
        network: v.optional(v.string()),
        sendAmount: v.optional(v.number()),
        sendCurrency: v.optional(v.string()),
        receiveAmount: v.optional(v.number()),
        receiveCurrency: v.optional(v.string()),
        fee: v.optional(v.number()),
        chessaOrderId: v.optional(v.string()),
        chessaShortId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.status !== "queued") return;
    const v0 = args.sgxV0;
    await ctx.db.patch(args.payoutId, {
      status: "sgx_submitted",
      sgxOrderId: args.sgxOrderId,
      updatedAt: Date.now(),
      ...(args.tronFloatTxid ? { tronFloatTxid: args.tronFloatTxid } : {}),
      ...(v0?.paymentAddress !== undefined
        ? { sgxPaymentAddress: v0.paymentAddress }
        : {}),
      ...(v0?.network !== undefined ? { sgxNetwork: v0.network } : {}),
      ...(v0?.sendAmount !== undefined ? { sgxSendAmount: v0.sendAmount } : {}),
      ...(v0?.sendCurrency !== undefined
        ? { sgxSendCurrency: v0.sendCurrency }
        : {}),
      ...(v0?.receiveAmount !== undefined
        ? { sgxReceiveAmount: v0.receiveAmount }
        : {}),
      ...(v0?.receiveCurrency !== undefined
        ? { sgxReceiveCurrency: v0.receiveCurrency }
        : {}),
      ...(v0?.fee !== undefined ? { sgxFee: v0.fee } : {}),
      ...(v0?.chessaOrderId !== undefined
        ? { chessaOrderId: v0.chessaOrderId }
        : {}),
      ...(v0?.chessaShortId !== undefined
        ? { chessaShortId: v0.chessaShortId }
        : {}),
    });
  },
});

/**
 * SGX (Chessa) could not start payout — return funds to user
 */
export const markPayoutFailed = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.payoutId);
    if (!p || p.status === "failed" || p.status === "ecocash_paid")
      return;

    const user = await ctx.db.get(p.userId);
    if (user) {
      await ctx.db.patch(p.userId, {
        balance: roundMoney((user.balance || 0) + p.amountUsd),
      });
    }
    const tx = await ctx.db.get(p.transactionId);
    if (tx) {
      await ctx.db.patch(p.transactionId, { status: "failed" });
    }
    await ctx.db.patch(args.payoutId, {
      status: "failed",
      sgxError: args.error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Called from HTTP callback (SGX → Penny) when EcoChessa settled or order failed
 */
export const completeOrFailFromCallback = internalMutation({
  args: {
    idempotencyKey: v.string(),
    outcome: v.union(
      v.literal("ecocash_paid"),
      v.literal("failed"),
    ),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (!p) throw new Error("Payout not found for idempotency key");

    if (p.status === "ecocash_paid" || p.status === "failed")
      return { already: true as const };

    if (args.outcome === "ecocash_paid") {
      if (p.status === "queued") {
        throw new Error("Invalid state for completion");
      }
      await ctx.db.patch(p.transactionId, { status: "completed" });
      await ctx.db.patch(p._id, {
        status: "ecocash_paid",
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }

    // failed after SGX handoff — refund
    if (p.status !== "sgx_submitted") {
      throw new Error("Payout is not in sgx_submitted; cannot mark failed from callback");
    }
    const user = await ctx.db.get(p.userId);
    if (user) {
      await ctx.db.patch(p.userId, {
        balance: roundMoney((user.balance || 0) + p.amountUsd),
      });
    }
    await ctx.db.patch(p.transactionId, { status: "failed" });
    await ctx.db.patch(p._id, {
      status: "failed",
      sgxError: args.detail ?? "Settled as failed on SGX",
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** After on-chain TRC20 send to SGX’s paymentAddress. */
export const markTreasuryFundingSuccess = internalMutation({
  args: {
    payoutId: v.id("ecocashPayouts"),
    tronFloatTxid: v.string(),
  },
  handler: async (ctx, { payoutId, tronFloatTxid }) => {
    const p = await ctx.db.get(payoutId);
    if (!p || p.status !== "sgx_submitted") return;
    if (p.tronFloatTxid) return;
    await ctx.db.patch(payoutId, {
      tronFloatTxid,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Queue an EcoCash cash-out for a given player.
 *
 * Extracted from the public mutation so the rail drill runs this path, not a
 * copy of it. `dryRun` prices and validates without debiting or queueing —
 * enough to prove the phone number, the name and the fee are acceptable before
 * a real remittance is booked at Chessa.
 */
export async function queueEcocashPayoutFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    amount: number;
    ecocashPhone: string;
    /** The name EcoCash returned, as shown to the player on the quote. */
    recipientName?: string;
    idempotencyKey: string;
    dryRun?: boolean;
  },
) {
  const amount = roundMoney(args.amount);
  if (amount < MIN_USD) {
    throw new Error(`Minimum withdrawal is $${MIN_USD}`);
  }

  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) throw new Error("idempotencyKey required");

  const existing = await ctx.db
    .query("ecocashPayouts")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing) {
    if (existing.userId !== userId) {
      throw new Error("Idempotency key already used");
    }
    return {
      deduped: true as const,
      payoutId: existing._id,
      transactionId: existing.transactionId,
      status: existing.status,
      sgxOrderId: existing.sgxOrderId,
    };
  }

  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  if ((user.balance || 0) < amount) {
    throw new Error("Insufficient funds");
  }

  // Deposits only, until the float is capitalised. See convex/withdrawable.ts.
  const allowance = await withdrawableFor(ctx, userId);
  if (amount > allowance.withdrawable + 1e-9) {
    throw new Error(lockedExplanation(allowance));
  }

  const phone = normalizeE164Zimbabwe(args.ecocashPhone);
  if (phone.length < 12) {
    throw new Error("Check EcoCash / phone number format");
  }

  /*
   * The fee comes off here, not at Chessa. `amount` is what leaves the player's
   * balance; `net` is what the off-ramp is asked to deliver. Sending the gross
   * to Chessa and taking the fee afterwards would mean the recipient sees a
   * figure nobody quoted them, and the refund path would have to know which of
   * the two numbers to give back.
   */
  const { fee, net } = computeWithdrawFee(amount);

  /*
   * Chessa's floor is on what the recipient *receives*, so it has to be checked
   * against `net`, not against what the player typed. Checked here, before the
   * debit, because failing after it means a refund for a limit we already knew.
   */
  const minNet = await readEcocashMinNet(ctx);
  if (net < minNet) {
    throw new Error(
      `EcoCash payouts start at $${minNet.toFixed(2)} received. ` +
        `Withdraw at least $${grossForNet(minNet).toFixed(2)} to clear it, or take this out as crypto.`,
    );
  }

  if (args.dryRun) {
    return {
      deduped: false as const,
      dryRun: true as const,
      payoutId: null,
      status: "not_queued" as const,
      ecocashPhone: phone,
      amountUsd: amount,
      feeUsd: fee,
      netUsd: net,
      balanceAfter: roundMoney((user.balance || 0) - amount),
    };
  }

  await ctx.db.patch(userId, {
    balance: roundMoney((user.balance || 0) - amount),
    payoutPhone: phone,
  });

  const now = Date.now();
  const transactionId = await ctx.db.insert("transactions", {
    userId,
    amount: -amount,
    type: "withdrawal",
    status: "pending",
    fee,
    timestamp: now,
    paymentMethod: "ecocash-usd",
  });

  const payoutId = await ctx.db.insert("ecocashPayouts", {
    userId,
    transactionId,
    idempotencyKey,
    ecocashPhone: phone,
    recipientName: args.recipientName?.trim() || undefined,
    amountUsd: amount,
    feeUsd: fee,
    netUsd: net,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.chessaBridge.runCryptoToEcocashForPayout,
    { payoutId },
  );

  return {
    deduped: false as const,
    payoutId,
    transactionId,
    status: "queued" as const,
    amountUsd: amount,
    feeUsd: fee,
    netUsd: net,
  };
}

/**
 * One-shot: deduct balance, create the pending withdrawal + payout rows, and
 * push to Chessa in the background. Subscribe to `getMyPayouts` for live status.
 */
export const requestEcocashWithdrawal = mutation({
  args: {
    amount: v.number(),
    ecocashPhone: v.string(),
    /**
     * Optional, and never trusted as identity. Chessa's name-enquiry decides who
     * is paid; this is only the name the player saw on the confirmation screen,
     * stored so a dispute can be read back against what they agreed to.
     */
    recipientName: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;
    return await queueEcocashPayoutFor(ctx, userId, args);
  },
});

export const getMyPayouts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const n = args.limit ?? 20;
    return await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(n);
  },
});

export const getPayoutById = query({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const p = await ctx.db.get(payoutId);
    if (!p || p.userId !== userId) return null;
    return p;
  },
});
