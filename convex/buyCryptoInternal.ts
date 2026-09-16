/**
 * Plain-runtime half of the EcoCash on-ramp.
 *
 * `buyCrypto.ts` runs in Node (it needs the Convex HTTP client to reach
 * Chessa), and a Node action cannot touch the database. These are the three
 * writes it needs, kept internal so the only way to reach them is through the
 * action that actually talks to the on-ramp.
 */
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { quoteDepositFor } from "./deposits";
import { explorerTxUrl } from "./railLib";

/**
 * Quote a deposit on a player's behalf for the on-ramp to fill.
 *
 * Deliberately the same `quoteDepositFor` the wallet's own deposit button
 * calls. The EcoCash route is not a second way to credit a balance — it is the
 * same deposit, with SGX sending the transfer instead of the player. Everything
 * downstream (matching, confirmations, crediting, the underpayment rules) is
 * therefore already written and already tested.
 */
export const quoteForOnramp = internalMutation({
  args: { userId: v.id("users"), amount: v.number() },
  handler: async (ctx, { userId, amount }) => {
    const quote = await quoteDepositFor(ctx, userId, amount, "USDT");
    return {
      depositId: quote.depositId,
      reference: quote.reference,
      amountPayable: quote.amountPayable,
      depositAddress: quote.depositAddress,
    };
  },
});

export const markOnrampInitiated = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    reference: v.string(),
    orderId: v.string(),
    fiatAmount: v.number(),
    phone: v.string(),
    /** The provider's full response, JSON-encoded. Kept as reconciliation evidence. */
    raw: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.depositId);
    if (!row) return;
    await ctx.db.patch(args.depositId, {
      onrampProvider: "chessa_ecocash",
      onrampReference: args.reference,
      onrampOrderId: args.orderId || undefined,
      onrampFiatAmount: args.fiatAmount,
      onrampPhone: args.phone,
      onrampStatus: "initiated",
      onrampRaw: args.raw?.slice(0, 8000),
      onrampInitiatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * The on-ramp refused before taking any money.
 *
 * The quote is cancelled rather than left open: nothing is coming to fill it,
 * and an abandoned quote holds a tag and shows in the wallet as "send exactly
 * X", which is advice the player cannot act on. The error is kept on the row so
 * support can see why.
 *
 * Only ever called when the call to Chessa threw — if it returned a reference,
 * a payment may exist and the quote must stay open to receive it.
 */
export const markOnrampFailed = internalMutation({
  args: { depositId: v.id("cryptoDeposits"), error: v.string() },
  handler: async (ctx, { depositId, error }) => {
    const row = await ctx.db.get(depositId);
    if (!row || row.status !== "awaiting_payment") return;
    await ctx.db.patch(depositId, {
      status: "cancelled",
      onrampProvider: "chessa_ecocash",
      onrampStatus: "failed",
      onrampError: error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

/** The on-ramp details behind a deposit, for the wallet's status panel. */
export const onrampForDeposit = internalQuery({
  args: { depositId: v.id("cryptoDeposits") },
  handler: async (ctx, { depositId }) => {
    const row = await ctx.db.get(depositId);
    if (!row) return null;
    return {
      provider: row.onrampProvider ?? null,
      reference: row.onrampReference ?? null,
      raw: row.onrampRaw ?? null,
      initiatedAt: row.onrampInitiatedAt ?? null,
      fiatAmount: row.onrampFiatAmount ?? null,
      phone: row.onrampPhone ?? null,
      status: row.onrampStatus ?? null,
      error: row.onrampError ?? null,
      depositStatus: row.status,
      txUrl: explorerTxUrl(row.txHash),
    };
  },
});

/** Convenience for the drill: look a deposit up by its public reference. */
export const byReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    return await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();
  },
});

export type OnrampDepositId = Id<"cryptoDeposits">;
