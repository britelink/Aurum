import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const MIN_USD = 0.5;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function normalizeE164Zimbabwe(raw: string): string {
  let t = raw.replace(/\s/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  if (t.startsWith("0") && t.length >= 9) t = "+263" + t.slice(1);
  if (/^263[0-9]{9,}$/.test(t)) t = "+" + t;
  if (t.startsWith("7") && t.length === 9) t = "+263" + t;
  if (!t.startsWith("+")) t = `+${t}`;
  return t;
}

/** Script helper: resolve Penny user by email. */
export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .first();
  },
});

/** Script helper: full payout row for polling. */
export const getPayoutSnapshot = internalQuery({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const p = await ctx.db.get(payoutId);
    if (!p) return null;
    const tx = await ctx.db.get(p.transactionId);
    return { payout: p, transactionStatus: tx?.status ?? null };
  },
});

/**
 * Internal-only: trigger full EcoCash withdraw pipeline for automation tests.
 * Mirrors `requestEcocashWithdrawal` without auth (run via `npx convex run`).
 */
export const triggerTestEcocashWithdrawal = internalMutation({
  args: {
    email: v.string(),
    amount: v.number(),
    ecocashPhone: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    idempotencyKey: v.string(),
    ensureBalance: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .first();
    if (!user) throw new Error(`User not found for email: ${normalized}`);

    const amount = roundMoney(args.amount);
    if (amount < MIN_USD) {
      throw new Error(`Minimum withdrawal is $${MIN_USD}`);
    }

    let balance = user.balance ?? 0;
    if (args.ensureBalance && balance < amount) {
      const topUp = roundMoney(amount - balance + 1);
      await ctx.db.patch(user._id, {
        balance: roundMoney(balance + topUp),
      });
      balance = roundMoney(balance + topUp);
    }
    if (balance < amount) {
      throw new Error(
        `Insufficient funds: balance=$${balance}, need=$${amount}. Pass ensureBalance:true or deposit first.`,
      );
    }

    const idempotencyKey = args.idempotencyKey.trim();
    if (!idempotencyKey) throw new Error("idempotencyKey required");

    const existing = await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) {
      return {
        deduped: true,
        userId: user._id,
        payoutId: existing._id,
        transactionId: existing.transactionId,
        status: existing.status,
        balanceAfter: balance,
      };
    }

    const phone = normalizeE164Zimbabwe(args.ecocashPhone);
    if (phone.length < 12) {
      throw new Error(`Invalid phone after normalize: ${phone}`);
    }

    await ctx.db.patch(user._id, {
      balance: roundMoney(balance - amount),
    });

    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      userId: user._id,
      amount: -amount,
      type: "withdrawal",
      status: "pending",
      fee: undefined,
      timestamp: now,
      paymentMethod: "ecocash-zwg",
    });

    const payoutId = await ctx.db.insert("ecocashPayouts", {
      userId: user._id,
      transactionId,
      idempotencyKey,
      ecocashPhone: phone,
      firstName: args.firstName.trim() || "Player",
      lastName: args.lastName.trim() || "User",
      amountUsd: amount,
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
      deduped: false,
      userId: user._id,
      payoutId,
      transactionId,
      status: "queued" as const,
      balanceAfter: roundMoney(balance - amount),
      ecocashPhone: phone,
    };
  },
});
