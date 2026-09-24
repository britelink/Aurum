/**
 * What the house has earned, and how much of it may actually be taken.
 *
 * Withdrawal fees are charged in bookkeeping — the player is debited gross and
 * the net goes out — but until now the fee simply stayed behind in the agent
 * wallet. That wallet is one pool holding every player's deposits, so "our
 * earnings" and "their money" were the same balance, and the question "can we
 * afford this payout" had no true answer.
 *
 * This module answers two separate questions and keeps them separate:
 *
 *  - **Earned**: the sum of fees on payouts that actually completed. Derived
 *    from the payout rows, not from a counter — a counter is a second source of
 *    truth that drifts, and the drift is always in the house's favour, which is
 *    the worst direction for it to drift in.
 *  - **Takeable**: earned, minus what has already been swept, and capped by
 *    what the float can spare after covering every player's claim.
 *
 * The second cap is the one that matters. Earning a fee does not conjure a
 * token: if the float is short — because EcoCash deposits credited balances
 * that no USDT backs yet — then sweeping "our" fee takes it from players. So
 * the sweep is allowed only out of genuine surplus, and when there is no
 * surplus the fee stays earned, unpaid, and visible.
 */

import { internalQuery, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { roundMoney, roundAmount, usdToUsdt } from "./railLib";
import { requireAdmin } from "./adminDashboard";

/** Below this, a sweep costs more attention than it moves. */
const MIN_SWEEP_USDT = 1;

/**
 * Leave this much token behind on top of every player claim.
 *
 * Rounding, an in-flight payout the books have not caught up with, and a rate
 * that moved between the liability calculation and the transfer all land in the
 * same place: a float that is a few cents short of what it owes. A buffer is
 * cheaper than discovering that at the moment somebody tries to cash out.
 */
const SURPLUS_BUFFER_USDT = 5;

/** Fees charged on payouts that actually completed, by rail. */
export const earned = internalQuery({
  args: {},
  handler: async (ctx) => {
    /*
     * Only completed payouts count. A fee on a failed payout was refunded with
     * the rest of the gross — counting it would have the house earning money
     * from transfers that never happened, and the error compounds silently
     * because failures are exactly what nobody reviews.
     */
    const ecocash = await ctx.db.query("ecocashPayouts").collect();
    const crypto = await ctx.db.query("cryptoPayouts").collect();

    const ecocashFees = ecocash
      .filter((r) => r.status === "ecocash_paid")
      .reduce((s, r) => s + (r.feeUsd ?? 0), 0);
    const cryptoFees = crypto
      .filter((r) => r.status === "sent")
      .reduce((s, r) => s + (r.feeUsd ?? 0), 0);

    const sweeps = await ctx.db.query("feeSweeps").collect();
    const sweptUsdt = sweeps
      .filter((s) => s.status === "sent")
      .reduce((s, r) => s + r.amountUsdt, 0);

    return {
      ecocashFeesUsd: roundMoney(ecocashFees),
      cryptoFeesUsd: roundMoney(cryptoFees),
      totalFeesUsd: roundMoney(ecocashFees + cryptoFees),
      sweptUsdt: roundAmount(sweptUsdt),
      sweepCount: sweeps.filter((s) => s.status === "sent").length,
    };
  },
});

/**
 * How much may be moved to the fee wallet right now.
 *
 * Takes the float's measured token balance as an argument rather than reading
 * the chain, so this stays a pure database query the sweep action can call
 * inside its own transaction boundary.
 */
export const takeable = internalQuery({
  args: { floatUsdt: v.number(), usdPerUsdt: v.number() },
  handler: async (ctx, { floatUsdt, usdPerUsdt }) => {
    const ecocash = await ctx.db.query("ecocashPayouts").collect();
    const crypto = await ctx.db.query("cryptoPayouts").collect();
    const sweeps = await ctx.db.query("feeSweeps").collect();

    const feesUsd =
      ecocash
        .filter((r) => r.status === "ecocash_paid")
        .reduce((s, r) => s + (r.feeUsd ?? 0), 0) +
      crypto.filter((r) => r.status === "sent").reduce((s, r) => s + (r.feeUsd ?? 0), 0);

    const sweptUsdt = sweeps
      .filter((s) => s.status === "sent" || s.status === "sending")
      .reduce((s, r) => s + r.amountUsdt, 0);

    const earnedUsdt = usdToUsdt(feesUsd, usdPerUsdt);
    const unsweptUsdt = roundAmount(Math.max(0, earnedUsdt - sweptUsdt));

    // What players are owed, in tokens. Everything above this is surplus;
    // everything at or below it is theirs.
    const users = await ctx.db.query("users").collect();
    const owedUsd = users.reduce((s, u) => s + Math.max(0, u.balance ?? 0), 0);
    const owedUsdt = usdToUsdt(owedUsd, usdPerUsdt);

    const surplusUsdt = roundAmount(
      Math.max(0, floatUsdt - owedUsdt - SURPLUS_BUFFER_USDT),
    );
    const amountUsdt = roundAmount(Math.min(unsweptUsdt, surplusUsdt));

    return {
      earnedUsdt: roundAmount(earnedUsdt),
      sweptUsdt: roundAmount(sweptUsdt),
      unsweptUsdt,
      floatUsdt: roundAmount(floatUsdt),
      owedUsdt: roundAmount(owedUsdt),
      surplusUsdt,
      amountUsdt,
      /** Why nothing is moving, when nothing is moving. */
      blockedBy:
        unsweptUsdt < MIN_SWEEP_USDT
          ? ("nothing_earned" as const)
          : surplusUsdt <= 0
            ? ("float_short" as const)
            : amountUsdt < MIN_SWEEP_USDT
              ? ("below_minimum" as const)
              : null,
    };
  },
});

export const openSweep = internalMutation({
  args: { amountUsdt: v.number(), toAddress: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("feeSweeps", {
      amountUsdt: roundAmount(args.amountUsdt),
      toAddress: args.toAddress,
      status: "sending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const closeSweep = internalMutation({
  args: {
    sweepId: v.id("feeSweeps"),
    txHash: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { sweepId, txHash, error }) => {
    await ctx.db.patch(sweepId, {
      status: txHash ? "sent" : "failed",
      txHash,
      error: error?.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

/** Admin view: what has been earned, what has been taken, what is stuck. */
export const feeReport = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx as never);

    const ecocash = await ctx.db.query("ecocashPayouts").collect();
    const crypto = await ctx.db.query("cryptoPayouts").collect();
    const sweeps = await ctx.db.query("feeSweeps").order("desc").take(50);

    const paidEcocash = ecocash.filter((r) => r.status === "ecocash_paid");
    const sentCrypto = crypto.filter((r) => r.status === "sent");

    return {
      wallet: process.env.FEESHOLDINGWALLET_ADDRESS ?? null,
      ecocash: {
        count: paidEcocash.length,
        feesUsd: roundMoney(paidEcocash.reduce((s, r) => s + (r.feeUsd ?? 0), 0)),
      },
      crypto: {
        count: sentCrypto.length,
        feesUsd: roundMoney(sentCrypto.reduce((s, r) => s + (r.feeUsd ?? 0), 0)),
      },
      totalFeesUsd: roundMoney(
        paidEcocash.reduce((s, r) => s + (r.feeUsd ?? 0), 0) +
          sentCrypto.reduce((s, r) => s + (r.feeUsd ?? 0), 0),
      ),
      sweeps: sweeps.map((s) => ({
        amountUsdt: s.amountUsdt,
        status: s.status,
        txHash: s.txHash ?? null,
        error: s.error ?? null,
        at: s.createdAt,
      })),
    };
  },
});
