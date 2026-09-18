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

/**
 * Scan caps.
 *
 * Both tables are read whole rather than through a running counter, so a bad
 * write cannot quietly corrupt the totals — but a Convex query may not read
 * unbounded documents, so the reads stop here and say so. `ledgerTruncated`
 * and `usersTruncated` travel with the figures precisely so the dashboard can
 * admit the totals are partial instead of rendering a confident wrong number.
 */
const USER_SCAN_CAP = 5000;
const LEDGER_SCAN_CAP = 8000;

/**
 * How far back "active" reaches.
 *
 * Bets are deleted along with their round once history rolls past
 * `HISTORY_KEEP` rounds, so this window is in practice capped by retention —
 * it is a live-activity gauge, not a retention metric.
 */
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

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

    const users = await ctx.db.query("users").take(USER_SCAN_CAP);

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
    const ledger = await ctx.db
      .query("transactions")
      .order("desc")
      .take(LEDGER_SCAN_CAP);
    let depositedAllTime = 0;
    let withdrawnAllTime = 0;
    let feesEarned = 0;
    let staked = 0;
    let won = 0;
    let refunded = 0;
    let betCount = 0;
    for (const t of ledger) {
      if (t.type === "deposit" && t.status === "completed" && t.amount > 0) {
        depositedAllTime += t.amount;
      }
      if (t.type === "withdrawal" && t.status === "completed" && t.amount < 0) {
        withdrawnAllTime += Math.abs(t.amount);
      }
      if (t.fee) feesEarned += t.fee;
      if (t.type === "stake") {
        staked += Math.abs(t.amount);
        betCount++;
      }
      if (t.type === "win") won += t.amount;
      if (t.type === "refund") refunded += t.amount;
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
      /** Everyone with an account, whether or not they hold a cent. */
      totalUsers: users.length,
      usersTruncated: users.length >= USER_SCAN_CAP,
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
      refunded: roundMoney(refunded),
      betCount,
      /** Deposits less withdrawals: what players have actually left with us. */
      netInflow: roundMoney(depositedAllTime - withdrawnAllTime),
      /** Staked less paid out — the table's margin, rake included. */
      grossGamingRevenue: roundMoney(staked - won),
      roundsSettled: rounds.length,
      usdPerUsdt,
      ledgerTruncated: ledger.length >= LEDGER_SCAN_CAP,
    };
  },
});

/**
 * Who is at the table right now.
 *
 * Three different populations, kept apart because operators conflate them and
 * then misread the platform: everyone who ever signed up, everyone who has
 * staked in the last few minutes, and the people with money on *this* round.
 * The last is the only one that moves second to second, and it is the one a
 * one-sided round — which voids and pays nobody — shows up in first.
 *
 * "Active" is derived from bets rather than from a presence heartbeat: there is
 * no session table, and a figure counting open browser tabs would flatter the
 * platform without meaning anything. Somebody who staked a dollar is provably
 * there.
 */
export const liveSession = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx as never);
    const now = Date.now();

    // Recent stakers across whatever rounds history still holds. One read of
    // the bets table, newest first, rather than a query per retained round.
    const recentBets = await ctx.db.query("bets").order("desc").take(500);
    const activeUsers = new Set<string>();
    for (const b of recentBets) {
      if (b._creationTime < now - ACTIVE_WINDOW_MS) break;
      activeUsers.add(String(b.userId));
    }

    const round =
      (await ctx.db
        .query("sessions")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .first()) ??
      (await ctx.db
        .query("sessions")
        .withIndex("by_status", (q) => q.eq("status", "processing"))
        .first());

    const base = {
      activeUsers: activeUsers.size,
      activeWindowMinutes: ACTIVE_WINDOW_MS / 60000,
    };

    // No live round is a real state, not an error: the engine sleeps when the
    // table is empty and the cron reopens it. Say so rather than showing zeros
    // that read as "nobody is playing".
    if (!round) return { ...base, round: null };

    const bets = await ctx.db
      .query("bets")
      .withIndex("by_session", (q) => q.eq("sessionId", round._id))
      .collect();

    const playersInRound = new Set(bets.map((b) => String(b.userId)));
    const staked = bets.reduce((sum, b) => sum + b.amount, 0);
    const betting = round.status === "open" && now < round.endTime;

    return {
      ...base,
      round: {
        id: round._id,
        status: round.status,
        /** What the table is doing, as opposed to what the row says. */
        phase: betting ? ("betting" as const) : ("settling" as const),
        startTime: round.startTime,
        endTime: round.endTime,
        processingEndTime: round.processingEndTime,
        secondsLeft: Math.max(
          0,
          Math.ceil(
            ((betting ? round.endTime : round.processingEndTime) - now) / 1000,
          ),
        ),
        /** Distinct accounts with money on this round. */
        players: playersInRound.size,
        bets: bets.length,
        stakedUsd: roundMoney(staked),
        upCount: bets.filter((b) => b.direction === "up").length,
        downCount: bets.filter((b) => b.direction === "down").length,
        buyVolume: roundMoney(round.totalBuyVolume),
        sellVolume: roundMoney(round.totalSellVolume),
        /**
         * A book with nothing on one side has no losing pool, so the round
         * voids and every stake comes back. Worth flagging before it settles.
         */
        willVoid:
          bets.length === 0 ||
          !bets.some((b) => b.direction === "up") ||
          !bets.some((b) => b.direction === "down"),
      },
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
