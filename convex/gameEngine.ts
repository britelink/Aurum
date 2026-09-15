/**
 * Aurum game — the round engine.
 *
 * Replaces the old `session.ts`, which had three problems worth naming because
 * the shape of this file is the answer to all three:
 *
 *  1. **Cost.** A self-rescheduling action woke every second, forever — 86,400
 *     action invocations a day whether or not anybody was playing, each one
 *     running a query. Rounds have exactly two interesting instants, so this
 *     schedules work *at* them (`scheduler.runAt`) and sleeps in between: two
 *     mutations a minute instead of sixty actions, and zero when the table is
 *     idle and nothing is scheduled. A five-minute cron is the only heartbeat,
 *     and it exists solely to restart the chain if a deploy drops a scheduled
 *     job.
 *
 *  2. **Safety.** `updateUserBalance`, `createTransaction`, `updateBetStatus`
 *     and `createSession` were all public mutations. Any browser could call
 *     `api.session.updateUserBalance({ userId, balance: 1e9 })` and then
 *     withdraw it through a rail that sends real USDT. Everything that touches
 *     money here is `internalMutation`; the only public writes are `placeBet`
 *     (which debits) and the rail entry points.
 *
 *  3. **Correctness.** `placeBet` never debited the stake, so bets were free
 *     and every settled round minted money. Settlement also ran as an action
 *     issuing three mutations per player, so a crash halfway left some players
 *     paid and others not. It is one transaction now: all of it lands or none
 *     of it does.
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
  BETTING_MS,
  PROCESSING_MS,
  finalPriceFor,
  neutralAxisFor,
  profitPerStake,
  winnerFor,
} from "./gameLib";
import { roundMoney } from "./railLib";

/** Rounds older than this are pruned by the settlement that follows them. */
const HISTORY_KEEP = 20;

function requireUserId(identity: { subject: string } | null): Id<"users"> {
  if (!identity) throw new ConvexError("Not authenticated");
  return identity.subject.split("|")[0] as Id<"users">;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Open a round and book the two jobs that will finish it.
 *
 * Returns the id so the caller can chain. Everything about a round's timing is
 * fixed at creation, which is what lets the chart run entirely on its own clock
 * and lets the engine sleep until the boundary.
 */
async function openRound(ctx: MutationCtx): Promise<Id<"sessions">> {
  const startTime = Date.now();
  const endTime = startTime + BETTING_MS;
  const processingEndTime = endTime + PROCESSING_MS;
  // 31 bits: stays a safe integer through `>>> 0` inside the PRNG.
  const seed = Math.floor(Math.random() * 0x7fffffff);

  const sessionId = await ctx.db.insert("sessions", {
    startTime,
    endTime,
    processingEndTime,
    seed,
    // Stored rather than derived on read: it is the number the round is judged
    // against, so it should be auditable from the row alone.
    neutralAxis: neutralAxisFor(seed),
    totalBuyVolume: 0,
    totalSellVolume: 0,
    buyCount: 0,
    sellCount: 0,
    status: "open",
  });

  await ctx.scheduler.runAt(endTime, internal.gameEngine.closeBetting, {
    sessionId,
  });
  return sessionId;
}

/**
 * Make sure a round is running. Idempotent, and the only entry point that
 * creates one — the cron, the first player through the door and the recovery
 * path all come through here.
 */
export const ensureRound = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const open = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .first();
    if (open) {
      /*
       * A round left behind by the old engine has no `seed`, and its
       * `neutralAxis` was an unrelated `Math.random()` rather than a point on
       * any curve. Settling it would judge real stakes against a line that
       * never existed, so it is voided and every stake goes back.
       *
       * Only ever fires on the first deploy over live data.
       */
      if (open.seed === undefined) {
        await retireLegacyRound(ctx, open._id);
        const sessionId = await openRound(ctx);
        return { ok: true as const, sessionId, recovered: "legacy" };
      }
      if (open.endTime > now) return { ok: true as const, sessionId: open._id };
      // Its `closeBetting` never fired (a deploy, an error). Run it now rather
      // than leaving a round that takes bets forever.
      await ctx.scheduler.runAfter(0, internal.gameEngine.closeBetting, {
        sessionId: open._id,
      });
      return { ok: true as const, sessionId: open._id, recovered: "close" };
    }

    const processing = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .first();
    if (processing) {
      if (processing.seed === undefined) {
        await retireLegacyRound(ctx, processing._id);
        const sessionId = await openRound(ctx);
        return { ok: true as const, sessionId, recovered: "legacy" };
      }
      if (processing.processingEndTime > now) {
        return { ok: true as const, sessionId: processing._id };
      }
      await ctx.scheduler.runAfter(0, internal.gameEngine.settleRound, {
        sessionId: processing._id,
      });
      return { ok: true as const, sessionId: processing._id, recovered: "settle" };
    }

    const sessionId = await openRound(ctx);
    return { ok: true as const, sessionId, created: true };
  },
});

export const closeBetting = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const round = await ctx.db.get(sessionId);
    if (!round || round.status !== "open") return;
    await ctx.db.patch(sessionId, { status: "processing" });
    await ctx.scheduler.runAt(
      round.processingEndTime,
      internal.gameEngine.settleRound,
      { sessionId },
    );
  },
});

/**
 * Settle the round and open the next one, in a single transaction.
 *
 * One mutation, not an action issuing many: a settlement that pays half the
 * table and then fails is not recoverable by retrying — the retry would pay the
 * first half twice. Here it either all commits or none of it does, and a retry
 * is a no-op because the round is no longer `processing`.
 */
export const settleRound = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const round = await ctx.db.get(sessionId);
    if (!round || round.status !== "processing") return { skipped: true };

    const seed = round.seed ?? 0;
    const finalPrice = finalPriceFor(seed);
    const neutralAxis = round.neutralAxis;
    const bets = await ctx.db
      .query("bets")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    const outcome = winnerFor(finalPrice, neutralAxis);
    const hasBuyers = bets.some((b) => b.direction === "up");
    const hasSellers = bets.some((b) => b.direction === "down");

    /*
     * A one-sided book has no losing pool to pay from, so there is nothing to
     * win — paying the only side present would be paying them out of the house.
     * Stakes go back untouched. Same for a price that finished on the axis.
     */
    if (outcome === "neutral" || !hasBuyers || !hasSellers) {
      for (const bet of bets) {
        await refundStake(ctx, bet, "Round voided");
      }
      await ctx.db.patch(sessionId, {
        status: "closed",
        finalPrice,
        winner: "neutral",
        houseFee: 0,
      });
      await finishAndReopen(ctx);
      return { result: "void" as const, refunded: bets.length };
    }

    const winningDirection = outcome === "buyers" ? "up" : "down";

    let losersTotal = 0;
    let winners1 = 0;
    let winners2 = 0;
    for (const bet of bets) {
      if (bet.direction !== winningDirection) losersTotal += bet.amount;
      else if (bet.amount === 1) winners1++;
      else winners2++;
    }

    const { perOne, perTwo, houseFee } = profitPerStake(
      losersTotal,
      winners1,
      winners2,
    );

    const now = Date.now();
    // One read per distinct player, not one per bet — a player with two bets in
    // a round would otherwise have the second patch overwrite the first from a
    // stale balance.
    const deltas = new Map<Id<"users">, number>();

    for (const bet of bets) {
      if (bet.direction === winningDirection) {
        const profit = roundMoney(bet.amount === 1 ? perOne : perTwo);
        const totalReturn = roundMoney(bet.amount + profit);
        await ctx.db.patch(bet._id, {
          status: "won",
          sessionOutcome: "won",
          payout: totalReturn,
        });
        deltas.set(bet.userId, (deltas.get(bet.userId) ?? 0) + totalReturn);
        await ctx.db.insert("transactions", {
          userId: bet.userId,
          amount: totalReturn,
          type: "win",
          status: "completed",
          timestamp: now,
          paymentMethod: "game",
          ref: sessionId,
        });
      } else {
        await ctx.db.patch(bet._id, {
          status: "lost",
          sessionOutcome: "lost",
          payout: 0,
        });
        // The stake already left the balance when the bet was placed; this row
        // is the record of it being lost, not a second debit.
        await ctx.db.insert("transactions", {
          userId: bet.userId,
          amount: -bet.amount,
          type: "loss",
          status: "completed",
          timestamp: now,
          paymentMethod: "game",
          ref: sessionId,
        });
      }
    }

    for (const [userId, delta] of deltas) {
      const user = await ctx.db.get(userId);
      if (!user) continue;
      await ctx.db.patch(userId, {
        balance: roundMoney((user.balance ?? 0) + delta),
      });
    }

    await ctx.db.patch(sessionId, {
      status: "closed",
      finalPrice,
      winner: outcome,
      houseFee: roundMoney(houseFee),
    });

    await finishAndReopen(ctx);
    return {
      result: "settled" as const,
      winner: outcome,
      paid: deltas.size,
      houseFee: roundMoney(houseFee),
    };
  },
});

/**
 * Close out a round the old engine left behind, returning every stake.
 *
 * Under the old engine `placeBet` never debited, so most legacy bets cost their
 * player nothing and refunding them would be a gift. `refundStake` is used
 * anyway: it credits `bet.amount`, and the alternative — deciding per row
 * whether a stake was ever actually taken — cannot be answered from the data,
 * because the debit that would prove it was never written. Paying a handful of
 * dollars once, on one deploy, is the cheap side of that uncertainty; the
 * expensive side is a player who really did stake and gets nothing back.
 */
async function retireLegacyRound(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
): Promise<void> {
  const bets = await ctx.db
    .query("bets")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(200);
  for (const bet of bets) {
    await refundStake(ctx, bet, "Round voided: engine upgrade");
  }
  await ctx.db.patch(sessionId, {
    status: "closed",
    winner: "neutral",
    houseFee: 0,
  });
}

/** Stake back, bet marked void. */
async function refundStake(
  ctx: MutationCtx,
  bet: Doc<"bets">,
  reason: string,
): Promise<void> {
  await ctx.db.patch(bet._id, {
    status: "pending",
    sessionOutcome: "void",
    payout: bet.amount,
  });
  const user = await ctx.db.get(bet.userId);
  if (user) {
    await ctx.db.patch(bet.userId, {
      balance: roundMoney((user.balance ?? 0) + bet.amount),
    });
  }
  await ctx.db.insert("transactions", {
    userId: bet.userId,
    amount: bet.amount,
    type: "refund",
    status: "completed",
    timestamp: Date.now(),
    paymentMethod: "game",
    ref: reason,
  });
}

/**
 * Prune old rounds and open the next one.
 *
 * Pruning happens here, bounded, rather than in the create path. The old build
 * read *every* session row on every create to decide what to delete — a full
 * table scan once a minute, growing with history. This walks the oldest few by
 * index and stops.
 */
async function finishAndReopen(ctx: MutationCtx): Promise<void> {
  const oldest = await ctx.db
    .query("sessions")
    .withIndex("by_start")
    .order("asc")
    .take(HISTORY_KEEP + 10);
  if (oldest.length > HISTORY_KEEP) {
    for (const stale of oldest.slice(0, oldest.length - HISTORY_KEEP)) {
      if (stale.status !== "closed") continue;
      const staleBets = await ctx.db
        .query("bets")
        .withIndex("by_session", (q) => q.eq("sessionId", stale._id))
        .take(200);
      for (const b of staleBets) await ctx.db.delete(b._id);
      await ctx.db.delete(stale._id);
    }
  }
  await openRound(ctx);
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

/**
 * Take a position. Debits the stake in the same transaction that records it —
 * the balance check and the deduction cannot be separated, or two simultaneous
 * clicks both pass the check against the same balance.
 */
export const placeBet = mutation({
  args: {
    sessionId: v.id("sessions"),
    amount: v.union(v.literal(1), v.literal(2)),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());

    const round = await ctx.db.get(args.sessionId);
    if (!round) throw new ConvexError("Round not found");
    if (round.status !== "open") throw new ConvexError("Betting has closed");
    if (round.endTime <= Date.now()) {
      throw new ConvexError("Betting has closed");
    }

    // One position per player per round. The settlement maths, the chart and
    // the "your trade" panel all assume a single position, and letting someone
    // hold both directions at once is a way to pay the rake for nothing.
    const existing = await ctx.db
      .query("bets")
      .withIndex("by_session_user", (q) =>
        q.eq("sessionId", args.sessionId).eq("userId", userId),
      )
      .first();
    if (existing) {
      throw new ConvexError("You already have a position in this round");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("User not found");
    const balance = user.balance ?? 0;
    if (balance < args.amount) {
      throw new ConvexError("Insufficient balance");
    }

    await ctx.db.patch(userId, {
      balance: roundMoney(balance - args.amount),
    });

    if (args.direction === "up") {
      await ctx.db.patch(args.sessionId, {
        totalBuyVolume: round.totalBuyVolume + args.amount,
        buyCount: (round.buyCount ?? 0) + 1,
      });
    } else {
      await ctx.db.patch(args.sessionId, {
        totalSellVolume: round.totalSellVolume + args.amount,
        sellCount: (round.sellCount ?? 0) + 1,
      });
    }

    const betId = await ctx.db.insert("bets", {
      userId,
      sessionId: args.sessionId,
      amount: args.amount,
      direction: args.direction,
      status: "pending",
    });

    await ctx.db.insert("transactions", {
      userId,
      amount: -args.amount,
      type: "stake",
      status: "completed",
      timestamp: Date.now(),
      paymentMethod: "game",
      ref: args.sessionId,
    });

    return { betId, balance: roundMoney(balance - args.amount) };
  },
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Everything the game screen needs, in one subscription.
 *
 * Deliberately one query rather than four: a Convex subscription re-runs on any
 * write to a document it read, so four overlapping subscriptions on the same
 * round means four re-runs and four websocket pushes for every bet anybody
 * places. One query, one push.
 *
 * It returns no price data at all — the client derives the whole curve from
 * `seed` and its own clock.
 *
 * And no server timestamp either. `Date.now()` inside a query is legal but the
 * result is cached and only invalidated by a write, so a "server now" read here
 * can be a minute stale — worse than useless for correcting a client clock,
 * because it is confidently wrong. The client pins its offset against
 * `round.startTime` the first time it watches a round begin instead.
 */
export const liveRound = query({
  args: {},
  handler: async (ctx) => {
    const round =
      (await ctx.db
        .query("sessions")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .first()) ??
      (await ctx.db
        .query("sessions")
        .withIndex("by_status", (q) => q.eq("status", "processing"))
        .first());

    if (!round) {
      // Nothing scheduled. The cron will open one within five minutes; say so
      // rather than rendering an empty chart that looks broken.
      return { round: null, myBet: null };
    }

    const identity = await ctx.auth.getUserIdentity();
    let myBet: Doc<"bets"> | null = null;
    if (identity) {
      const userId = identity.subject.split("|")[0] as Id<"users">;
      myBet = await ctx.db
        .query("bets")
        .withIndex("by_session_user", (q) =>
          q.eq("sessionId", round._id).eq("userId", userId),
        )
        .first();
    }

    return {
      round: {
        id: round._id,
        seed: round.seed ?? 0,
        status: round.status,
        startTime: round.startTime,
        endTime: round.endTime,
        processingEndTime: round.processingEndTime,
        neutralAxis: round.neutralAxis,
        totalBuyVolume: round.totalBuyVolume,
        totalSellVolume: round.totalSellVolume,
        buyCount: round.buyCount ?? 0,
        sellCount: round.sellCount ?? 0,
      },
      myBet: myBet
        ? {
            id: myBet._id,
            amount: myBet.amount,
            direction: myBet.direction,
            status: myBet.status,
            payout: myBet.payout ?? null,
          }
        : null,
    };
  },
});

/**
 * The last few settled rounds, for the results strip.
 *
 * Separate from `liveRound` on purpose: this changes once a minute, the live
 * round changes on every bet, and merging them would push the whole history
 * down the socket every time somebody staked a dollar.
 */
export const recentResults = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .order("desc")
      .take(Math.min(args.limit ?? 8, 20));
    return rows.map((r) => ({
      id: r._id,
      winner: r.winner ?? "neutral",
      finalPrice: r.finalPrice ?? null,
      neutralAxis: r.neutralAxis,
      startTime: r.startTime,
    }));
  },
});

/** The player's own settled positions. */
export const myRecentBets = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const rows = await ctx.db
      .query("bets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
    return rows.map((b) => ({
      id: b._id,
      amount: b.amount,
      direction: b.direction,
      status: b.status,
      outcome: b.sessionOutcome ?? null,
      payout: b.payout ?? null,
    }));
  },
});

/** Kick the engine from the client when the table is cold. Cheap and idempotent. */
export const startIfIdle = mutation({
  args: {},
  handler: async (ctx): Promise<{ started: boolean }> => {
    const live =
      (await ctx.db
        .query("sessions")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .first()) ??
      (await ctx.db
        .query("sessions")
        .withIndex("by_status", (q) => q.eq("status", "processing"))
        .first());
    if (live) return { started: false };
    await ctx.scheduler.runAfter(0, internal.gameEngine.ensureRound, {});
    return { started: true };
  },
});

export const roundById = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => ctx.db.get(sessionId),
});
