/**
 * Aurum outbound rail — crypto payouts.
 *
 * The player takes their balance back as USDT/USDC on BSC, sent from the agent
 * wallet to an address they own. Plain-runtime bookkeeping only; the transfer
 * itself is `cryptoPayoutNode.ts`.
 *
 * The shape mirrors the EcoCash path in `withdrawals.ts` on purpose: debit
 * first inside one transaction, hand off to a scheduled action, and refund on
 * any terminal failure. A withdrawal that debits and then fails without
 * refunding is the only bug on this rail a player cannot see and cannot undo.
 */
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  INBOUND_CHAIN,
  MIN_WITHDRAW_USD,
  computeWithdrawFee,
  explorerAddressUrl,
  explorerTxUrl,
  isEvmAddress,
  isRailAsset,
  roundMoney,
} from "./railLib";

export const getPayoutForAction = internalQuery({
  args: { payoutId: v.id("cryptoPayouts") },
  handler: async (ctx, { payoutId }) => {
    return await ctx.db.get(payoutId);
  },
});

/**
 * Queue a crypto payout for a given player: debit, write the ledger row, hand off.
 *
 * Extracted from the public mutation so the rail drill runs this exact path
 * rather than a rehearsal of it. Every validation a player hits — the address
 * shape, the minimum, the balance, the idempotency key — a drill hits too.
 */
export async function queueCryptoPayoutFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    amount: number;
    toAddress: string;
    asset?: string;
    idempotencyKey: string;
    /** Validate and price it, but write nothing and send nothing. */
    dryRun?: boolean;
  },
) {
  const asset = (args.asset ?? "USDT").trim().toUpperCase();
  if (!isRailAsset(asset)) {
    throw new ConvexError(`Unsupported asset: ${asset}. Use USDT or USDC.`);
  }

  const toAddress = args.toAddress.trim();
  if (!isEvmAddress(toAddress)) {
    throw new ConvexError(
      "Enter a BNB Smart Chain (BEP20) address — 0x followed by 40 hex characters.",
    );
  }

  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) throw new ConvexError("idempotencyKey required");

  const existing = await ctx.db
    .query("cryptoPayouts")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing) {
    if (existing.userId !== userId) {
      throw new ConvexError("Idempotency key already used");
    }
    return {
      deduped: true as const,
      payoutId: existing._id,
      status: existing.status,
    };
  }

  const gross = roundMoney(args.amount);
  if (!Number.isFinite(gross) || gross < MIN_WITHDRAW_USD) {
    throw new ConvexError(`Minimum withdrawal is $${MIN_WITHDRAW_USD}`);
  }

  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("User not found");
  if ((user.balance ?? 0) < gross) throw new ConvexError("Insufficient funds");

  const { fee, net } = computeWithdrawFee(gross);

  if (args.dryRun) {
    return {
      deduped: false as const,
      dryRun: true as const,
      payoutId: null,
      status: "not_queued" as const,
      amountUsd: gross,
      feeUsd: fee,
      amountToken: net,
      toAddress,
      asset,
      balanceAfter: roundMoney((user.balance ?? 0) - gross),
    };
  }

  const now = Date.now();
  await ctx.db.patch(userId, {
    balance: roundMoney((user.balance ?? 0) - gross),
    payoutAddress: toAddress,
  });

  const transactionId = await ctx.db.insert("transactions", {
    userId,
    amount: -gross,
    type: "withdrawal",
    status: "pending",
    fee,
    timestamp: now,
    paymentMethod: asset === "USDC" ? "usdc-bep20" : "usdt-bep20",
  });

  const payoutId = await ctx.db.insert("cryptoPayouts", {
    userId,
    transactionId,
    idempotencyKey,
    toAddress,
    asset,
    chain: INBOUND_CHAIN,
    amountUsd: gross,
    feeUsd: fee,
    amountToken: net,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.cryptoPayoutNode.sendCryptoPayout, {
    payoutId,
  });

  return {
    deduped: false as const,
    payoutId,
    status: "queued" as const,
    amountUsd: gross,
    feeUsd: fee,
    amountToken: net,
  };
}

/**
 * Queue a crypto payout: debit the balance, write the ledger row, hand off.
 *
 * All of it in one mutation, so a player cannot get two payouts out of one
 * balance by clicking twice — and `idempotencyKey` makes a retried request
 * return the first payout rather than opening a second.
 */
export const requestCryptoWithdrawal = mutation({
  args: {
    amount: v.number(),
    toAddress: v.string(),
    asset: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;
    return await queueCryptoPayoutFor(ctx, userId, args);
  },
});

/**
 * Claim the payout for sending.
 *
 * `queued → sending` is a compare-and-set: two overlapping runs of the node
 * action (a retry, a redeploy mid-flight) both read the row, and only the one
 * that wins this transition is allowed to touch the chain. Without it the
 * second run sends the money a second time, and nothing on-chain can take it
 * back.
 */
export const claimForSending = internalMutation({
  args: { payoutId: v.id("cryptoPayouts") },
  handler: async (ctx, { payoutId }) => {
    const row = await ctx.db.get(payoutId);
    if (!row) return { claimed: false as const, reason: "missing" };
    if (row.status !== "queued") {
      return { claimed: false as const, reason: row.status };
    }
    await ctx.db.patch(payoutId, { status: "sending", updatedAt: Date.now() });
    return { claimed: true as const };
  },
});

export const markPayoutSent = internalMutation({
  args: { payoutId: v.id("cryptoPayouts"), txHash: v.string() },
  handler: async (ctx, { payoutId, txHash }) => {
    const row = await ctx.db.get(payoutId);
    if (!row || row.status === "sent" || row.status === "failed") return;
    await ctx.db.patch(payoutId, {
      status: "sent",
      txHash,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(row.transactionId, { status: "completed", ref: txHash });
  },
});

/** Terminal failure — the money never left, so it goes back. */
export const markPayoutFailed = internalMutation({
  args: { payoutId: v.id("cryptoPayouts"), error: v.string() },
  handler: async (ctx, { payoutId, error }) => {
    const row = await ctx.db.get(payoutId);
    if (!row || row.status === "sent" || row.status === "failed") return;

    const user = await ctx.db.get(row.userId);
    if (user) {
      await ctx.db.patch(row.userId, {
        balance: roundMoney((user.balance ?? 0) + row.amountUsd),
      });
    }
    await ctx.db.patch(row.transactionId, { status: "failed" });
    await ctx.db.patch(payoutId, {
      status: "failed",
      error,
      updatedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function serializePayout(row: Doc<"cryptoPayouts">) {
  return {
    id: row._id,
    asset: row.asset,
    chain: row.chain,
    status: row.status,
    toAddress: row.toAddress,
    toAddressUrl: explorerAddressUrl(row.toAddress),
    amountUsd: row.amountUsd,
    feeUsd: row.feeUsd,
    amountToken: row.amountToken,
    txHash: row.txHash ?? null,
    txUrl: explorerTxUrl(row.txHash),
    error: row.error ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const myCryptoPayouts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const rows = await ctx.db
      .query("cryptoPayouts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
    return rows.map(serializePayout);
  },
});

/**
 * What a withdrawal of `amount` would actually cost, before the player commits.
 *
 * A pure read, so the form can show the fee live without a round trip that
 * writes anything — and so the number on screen is computed by the same
 * function that will charge it.
 */
export const quoteWithdrawal = query({
  args: { amount: v.number() },
  handler: async (_ctx, { amount }) => {
    const gross = roundMoney(amount);
    if (!Number.isFinite(gross) || gross <= 0) {
      return { valid: false as const, gross: 0, fee: 0, net: 0 };
    }
    if (gross < MIN_WITHDRAW_USD) {
      return {
        valid: false as const,
        gross,
        fee: 0,
        net: 0,
        message: `Minimum withdrawal is $${MIN_WITHDRAW_USD}`,
      };
    }
    const { fee, net } = computeWithdrawFee(gross);
    return { valid: true as const, gross, fee, net };
  },
});
