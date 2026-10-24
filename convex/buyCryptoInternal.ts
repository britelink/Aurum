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

/**
 * How far back the poller looks. Long enough to cover SGX recovering a stuck
 * order days later (our late-match window is seven days), short enough that an
 * order SGX never answers for stops costing a call a minute forever.
 */
export const ONRAMP_POLL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/*
 * Only these end the polling. "failed" and "expired" do not: SGX retries a
 * paid order whose send stalled, and has recovered orders it once reported as
 * failed — so those keep being asked about, just less often, until the poll
 * window closes. A player whose top-up comes good later then sees it move.
 */
const FINAL_STAGES = new Set(["delivered", "cancelled"]);
const ENDED_STAGES = new Set(["failed", "expired", "unknown"]);
const ENDED_RECHECK_MS = 30 * 60 * 1000;

/** On-ramp orders SGX has not finished with, oldest-checked first. */
export const onrampOrdersToCheck = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const since = now - ONRAMP_POLL_WINDOW_MS;
    const rows = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_onramp_status", (q) =>
        q.eq("onrampStatus", "initiated").gte("onrampInitiatedAt", since),
      )
      .take(200);
    return rows
      .filter((r) => r.onrampOrderId)
      // Credited already: the watcher settled it, SGX has nothing to add.
      .filter((r) => r.status !== "confirmed")
      .filter(
        (r) =>
          !ENDED_STAGES.has(r.onrampStage ?? "") ||
          now - (r.onrampCheckedAt ?? 0) >= ENDED_RECHECK_MS,
      )
      .sort((a, b) => (a.onrampCheckedAt ?? 0) - (b.onrampCheckedAt ?? 0))
      .slice(0, limit)
      .map((r) => ({ depositId: r._id, orderId: r.onrampOrderId as string }));
  },
});

/**
 * Write down what SGX says about an order.
 *
 * Records, never decides. The deposit itself is still credited only by the
 * chain watcher when the USDT lands, so nothing SGX reports here can put money
 * in a balance. And a failed or expired order does not cancel the deposit: SGX
 * recovers stuck orders, and a late delivery has to find a quote still inside
 * the late-match window to be credited.
 */
export const recordOnrampStatus = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    found: v.boolean(),
    stage: v.optional(v.string()),
    reason: v.optional(v.union(v.string(), v.null())),
    route: v.optional(v.union(v.string(), v.null())),
    txHash: v.optional(v.union(v.string(), v.null())),
    trace: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.depositId);
    if (!row || row.onrampStatus !== "initiated") return;
    const now = Date.now();

    if (!args.found) {
      await ctx.db.patch(args.depositId, {
        onrampStatus: "settled",
        onrampStage: "unknown",
        onrampReason: "SGX has no record of this order.",
        onrampCheckedAt: now,
        updatedAt: now,
      });
      return;
    }

    const stage = args.stage ?? "unknown";
    await ctx.db.patch(args.depositId, {
      onrampStage: stage,
      onrampReason: args.reason?.slice(0, 500) || undefined,
      onrampRoute: args.route || undefined,
      onrampTxHash: args.txHash || undefined,
      onrampTrace: args.trace?.slice(0, 8000) || undefined,
      onrampCheckedAt: now,
      // Final stages stop the polling; the chain watcher takes it from here.
      ...(FINAL_STAGES.has(stage) ? { onrampStatus: "settled" } : {}),
      updatedAt: now,
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
