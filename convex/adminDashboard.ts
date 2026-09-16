/**
 * The operator's view of the platform's money.
 *
 * Everything here is admin-gated, because it reads other people's balances.
 * The internal `treasury.*` queries are the mechanics; these are the same
 * figures with an identity check in front, so the dashboard can call them from
 * a browser without opening anything to a player.
 *
 * The figures are chosen to answer three questions in order: what do we owe,
 * what do we hold, and can one cover the other. A dashboard that leads with
 * volume looks healthy right up until it is not.
 */
import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  FALLBACK_USD_PER_USDT,
  USDT_RATE_KEY,
  roundAmount,
  roundMoney,
  usdToUsdt,
} from "./railLib";
import { withdrawableFor } from "./withdrawable";

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function requireAdmin(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  db: { get: (id: Id<"users">) => Promise<unknown> };
}): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");
  const userId = identity.subject.split("|")[0] as Id<"users">;
  const user = (await ctx.db.get(userId)) as {
    _id: Id<"users">;
    role?: string;
    email?: string;
  } | null;
  if (!user) throw new ConvexError("Not authenticated");

  const ok =
    user.role === "admin" ||
    parseCsvEnv("ADMIN_USER_IDS").includes(String(user._id)) ||
    (user.email
      ? parseCsvEnv("ADMIN_EMAILS")
          .map((e) => e.toLowerCase())
          .includes(user.email.toLowerCase())
      : false);
  if (!ok) throw new ConvexError("Admin access required");
  return userId;
}

/**
 * The headline numbers.
 *
 * `owed` is the liability; `deposits` and `winnings` explain what it is made
 * of. Keeping them apart matters here more than usual, because only the
 * deposit half is currently withdrawable — a single "total balances" figure
 * would hide the one distinction the payout policy turns on.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx as never);

    const users = await ctx.db.query("users").take(2000);

    let owed = 0;
    let withdrawable = 0;
    let locked = 0;
    let holders = 0;
    for (const u of users) {
      const bal = u.balance ?? 0;
      if (bal <= 0.005) continue;
      holders++;
      owed += bal;
      const w = await withdrawableFor(ctx, u._id);
      withdrawable += w.withdrawable;
      locked += w.locked;
    }

    // Volume, from the ledger rather than from a counter that could drift.
    const ledger = await ctx.db.query("transactions").order("desc").take(3000);
    let depositedAllTime = 0;
    let withdrawnAllTime = 0;
    let feesEarned = 0;
    let staked = 0;
    let won = 0;
    for (const t of ledger) {
      if (t.type === "deposit" && t.status === "completed" && t.amount > 0) {
        depositedAllTime += t.amount;
      }
      if (t.type === "withdrawal" && t.status === "completed" && t.amount < 0) {
        withdrawnAllTime += Math.abs(t.amount);
      }
      if (t.fee) feesEarned += t.fee;
      if (t.type === "stake") staked += Math.abs(t.amount);
      if (t.type === "win") won += t.amount;
    }

    // House rake, straight from the rounds that produced it.
    const rounds = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .order("desc")
      .take(500);
    const rake = rounds.reduce((s, r) => s + (r.houseFee ?? 0), 0);

    const rateRow = await ctx.db
      .query("railConfig")
      .withIndex("by_key", (q) => q.eq("key", USDT_RATE_KEY))
      .first();
    let usdPerUsdt = FALLBACK_USD_PER_USDT;
    try {
      const p = rateRow?.value ? JSON.parse(rateRow.value) : null;
      if (p?.usdPerUsdt > 0) usdPerUsdt = p.usdPerUsdt;
    } catch {
      /* fallback stands */
    }

    return {
      holders,
      owedUsd: roundMoney(owed),
      /** What the float must hold in tokens to cover it. */
      owedUsdt: usdToUsdt(owed, usdPerUsdt),
      withdrawableUsd: roundMoney(withdrawable),
      lockedWinningsUsd: roundMoney(locked),
      depositedAllTime: roundMoney(depositedAllTime),
      withdrawnAllTime: roundMoney(withdrawnAllTime),
      feesEarned: roundMoney(feesEarned),
      houseRake: roundMoney(rake),
      staked: roundMoney(staked),
      won: roundMoney(won),
      roundsSettled: rounds.length,
      usdPerUsdt,
      ledgerTruncated: ledger.length >= 3000,
    };
  },
});

/** Every account with a balance, and what each may actually take out. */
export const players = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx as never);
    const users = await ctx.db.query("users").take(500);

    const rows = [];
    for (const u of users) {
      const bal = u.balance ?? 0;
      if (bal <= 0.005) continue;
      const w = await withdrawableFor(ctx, u._id);
      rows.push({
        userId: u._id,
        email: u.email ?? null,
        name: u.name ?? null,
        balance: w.balance,
        deposited: w.deposited,
        withdrawn: w.withdrawn,
        withdrawable: w.withdrawable,
        locked: w.locked,
      });
    }
    rows.sort((a, b) => b.balance - a.balance);
    return rows.slice(0, Math.min(args.limit ?? 50, 200));
  },
});

/** Recent money movement, both rails, newest first. */
export const activity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx as never);
    const n = Math.min(args.limit ?? 20, 100);

    const deposits = await ctx.db.query("cryptoDeposits").order("desc").take(n);
    const cryptoOut = await ctx.db.query("cryptoPayouts").order("desc").take(n);
    const ecocashOut = await ctx.db
      .query("ecocashPayouts")
      .order("desc")
      .take(n);

    return {
      deposits: deposits.map((d) => ({
        id: d._id,
        at: d.createdAt,
        reference: d.reference,
        via: d.onrampProvider ?? "crypto",
        status: d.status,
        askedUsd: d.amountRequested,
        creditedUsd: d.amountCredited ?? 0,
        usdtReleased: d.usdtReleased ?? null,
        rate: d.rateUsdPerUsdt ?? null,
        txHash: d.txHash ?? null,
        error: d.onrampError ?? null,
      })),
      cryptoPayouts: cryptoOut.map((p) => ({
        id: p._id,
        at: p.createdAt,
        status: p.status,
        grossUsd: p.amountUsd,
        feeUsd: p.feeUsd,
        sentUsdt: p.amountToken,
        to: p.toAddress,
        txHash: p.txHash ?? null,
        error: p.error ?? null,
      })),
      ecocashPayouts: ecocashOut.map((p) => ({
        id: p._id,
        at: p.createdAt,
        status: p.status,
        grossUsd: p.amountUsd,
        feeUsd: p.feeUsd ?? null,
        deliveredUsd: p.netUsd ?? null,
        phone: p.ecocashPhone,
        recipient: p.recipientName ?? null,
        chessaOrderId: p.chessaOrderId ?? null,
        chessaOrderStatus: p.chessaOrderStatus ?? null,
        fundedTx: p.tronFloatTxid ?? null,
        error: p.sgxError ?? null,
      })),
    };
  },
});

/** One account, in full — the drill-down behind a row. */
export const player = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx as never);
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const w = await withdrawableFor(ctx, args.userId);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_time", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);
    const deposits = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    return {
      email: user.email ?? null,
      name: user.name ?? null,
      ...w,
      transactions: txs.map((t) => ({
        at: t.timestamp,
        type: t.type,
        amount: t.amount,
        status: t.status,
        method: t.paymentMethod,
        fee: t.fee ?? null,
        ref: t.ref ?? null,
      })),
      deposits: deposits.map((d) => ({
        reference: d.reference,
        via: d.onrampProvider ?? "crypto",
        status: d.status,
        credited: d.amountCredited ?? 0,
        usdtReleased: d.usdtReleased ?? null,
        txHash: d.txHash ?? null,
      })),
    };
  },
});

/** Payouts that need a person: failed, stuck, or funded but unresolved. */
export const needsAttention = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx as never);

    const eco = await ctx.db.query("ecocashPayouts").order("desc").take(100);
    const crypto = await ctx.db.query("cryptoPayouts").order("desc").take(100);
    const deposits = await ctx.db.query("cryptoDeposits").order("desc").take(100);

    return {
      /** Funded at Chessa but never settled — real money in transit. */
      fundedUnsettled: eco
        .filter((p) => p.tronFloatTxid && p.status !== "ecocash_paid")
        .map((p) => ({
          id: p._id,
          amountUsd: p.amountUsd,
          fundedTx: p.tronFloatTxid!,
          chessaOrderId: p.chessaOrderId ?? null,
          chessaOrderStatus: p.chessaOrderStatus ?? null,
          status: p.status,
        })),
      /** Sent on chain but never confirmed sent in our books. */
      payoutsStuckSending: crypto
        .filter((p) => p.status === "sending")
        .map((p) => ({ id: p._id, amountToken: p.amountToken, to: p.toAddress })),
      /** Credited to a player but the reserve never released the tokens. */
      creditedWithoutRelease: deposits
        .filter(
          (d) =>
            d.status === "confirmed" &&
            d.onrampProvider === "pesepay" &&
            !d.txHash,
        )
        .map((d) => ({
          id: d._id,
          reference: d.reference,
          creditedUsd: d.amountCredited ?? 0,
          error: d.onrampError ?? null,
        })),
      unclaimedDeposits: (
        await ctx.db
          .query("unclaimedDeposits")
          .withIndex("by_status", (q) => q.eq("status", "unclaimed"))
          .take(20)
      ).map((u) => ({
        id: u._id,
        amount: u.amountToken,
        symbol: u.symbol,
        from: u.fromAddress,
        txHash: u.txHash,
      })),
    };
  },
});

/** Re-exported for the panel's own rounding. */
export const ROUND = roundAmount;
