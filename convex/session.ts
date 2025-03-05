import { v } from "convex/values";
import { mutation, action, query } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Constants for session timing
const BETTING_PERIOD = 30000; // 30 seconds for betting
const PROCESSING_PERIOD = 30000; // 30 seconds for price movement
const TOTAL_SESSION_DURATION = BETTING_PERIOD + PROCESSING_PERIOD;

// Create a new session
export const createSession = mutation({
  handler: async (ctx) => {
    const startTime = Date.now();
    const endTime = startTime + BETTING_PERIOD;
    const processingEndTime = endTime + PROCESSING_PERIOD;
    const neutralAxis = Math.random() * 100;

    return await ctx.db.insert("sessions", {
      startTime,
      endTime,
      processingEndTime,
      neutralAxis,
      totalBuyVolume: 0,
      totalSellVolume: 0,
      status: "open",
      finalPrice: undefined,
      winner: undefined,
    });
  },
});

// Session manager loop that runs continuously
export const sessionManagerLoop = action({
  handler: async (ctx) => {
    const now = Date.now();
    let currentSession = await ctx.runQuery(api.session.getCurrentSession);

    if (currentSession) {
      if (currentSession.status === "open" && now > currentSession.endTime) {
        // Move to processing phase
        await ctx.runMutation(api.session.updateSessionStatus, {
          sessionId: currentSession._id,
          status: "processing",
        });
      } else if (
        currentSession.status === "processing" &&
        now > currentSession.processingEndTime
      ) {
        // Process results, close session, and create new one
        await ctx.runAction(api.session.processResults, {
          sessionId: currentSession._id,
          finalPrice: Math.random() * 100,
        });
      }
    } else {
      // Create first session if none exists
      await ctx.runMutation(api.session.createSession);
    }

    // Schedule next check
    await ctx.scheduler.runAfter(1000, api.session.sessionManagerLoop);
  },
});

// Get current session
export const getCurrentSession = query({
  handler: async (ctx) => {
    // First try to get an open session
    const openSession = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .first();

    if (openSession) return openSession;

    // If no open session, try to get a processing session
    const processingSession = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .first();

    if (processingSession) return processingSession;

    // If no open or processing session, check for a closed session
    // This helps ensure we always have a session to show
    const closedSession = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .order("desc")
      .first();

    return closedSession;
  },
});

// Process session results
export const processResults = action({
  args: {
    sessionId: v.id("sessions"),
    finalPrice: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.session.getSessionById, {
      sessionId: args.sessionId,
    });
    if (!session) throw new Error("Session not found");

    let winningDirection = null;
    if (args.finalPrice > session.neutralAxis) {
      winningDirection = "up";
    } else if (args.finalPrice < session.neutralAxis) {
      winningDirection = "down";
    }

    const bets = await ctx.runQuery(api.session.getBetsBySession, {
      sessionId: args.sessionId,
    });

    const hasBuyers = bets.some((bet) => bet.direction === "up");
    const hasSellers = bets.some((bet) => bet.direction === "down");

    if (!winningDirection || !hasBuyers || !hasSellers) {
      await ctx.runMutation(api.session.updateSessionStatus, {
        sessionId: args.sessionId,
        status: "closed",
        finalPrice: args.finalPrice,
        winner: "neutral",
      });
      for (const bet of bets) {
        await ctx.runMutation(api.session.updateBetStatus, {
          betId: bet._id,
          status: "pending",
          sessionOutcome: "void",
          payout: 0,
        });
      }
      await ctx.runMutation(api.session.createSession);
      return { result: "Session voided; no funds exchanged." };
    }

    let losersTotal = 0;
    let winners1 = 0;
    let winners2 = 0;
    for (const bet of bets) {
      if (bet.direction !== winningDirection) {
        losersTotal += bet.amount;
      } else {
        if (bet.amount === 1) winners1++;
        if (bet.amount === 2) winners2++;
      }
    }

    const netPool = losersTotal * 0.92;
    const pool1 = netPool * 0.35;
    const pool2 = netPool * 0.65;

    const winPerOne = winners1 > 0 ? pool1 / winners1 : 0;
    const winPerTwo = winners2 > 0 ? pool2 / winners2 : 0;

    for (const bet of bets) {
      const user = await ctx.runQuery(api.session.getUserById, {
        userId: bet.userId,
      });
      if (!user) continue;

      if (bet.direction === winningDirection) {
        let profit = bet.amount === 1 ? winPerOne : winPerTwo;
        const totalReturn = bet.amount + profit;
        await ctx.runMutation(api.session.updateBetStatus, {
          betId: bet._id,
          status: "won",
          sessionOutcome: "won",
          payout: totalReturn,
        });
        await ctx.runMutation(api.session.updateUserBalance, {
          userId: bet.userId,
          balance: (user.balance || 0) + totalReturn,
        });
        await ctx.runMutation(api.session.createTransaction, {
          userId: bet.userId,
          amount: totalReturn,
          type: "win",
          status: "completed",
          fee: undefined,
          paymentMethod: "eco-usd",
        });
      } else {
        await ctx.runMutation(api.session.updateBetStatus, {
          betId: bet._id,
          status: "lost",
          sessionOutcome: "lost",
          payout: 0,
        });
        await ctx.runMutation(api.session.createTransaction, {
          userId: bet.userId,
          amount: -bet.amount,
          type: "loss",
          status: "completed",
          fee: undefined,
          paymentMethod: "eco-usd",
        });
      }
    }

    const feeAmount = losersTotal * 0.08;
    await ctx.runMutation(api.session.createTransaction, {
      userId: "2001" as Id<"users">,
      amount: feeAmount,
      type: "fee",
      status: "completed",
      fee: feeAmount,
      paymentMethod: "eco-usd",
    });

    await ctx.runMutation(api.session.updateSessionStatus, {
      sessionId: args.sessionId,
      status: "closed",
      finalPrice: args.finalPrice,
      winner: winningDirection === "up" ? "buyers" : "sellers",
    });

    await ctx.runMutation(api.session.createSession);

    return { result: "Session processed successfully." };
  },
});

export const closeSession = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: "closed" });
  },
});

export const getSessionById = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const getBetsBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bets")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const updateSessionStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    status: v.union(
      v.literal("open"),
      v.literal("processing"),
      v.literal("closed"),
      v.literal("pending"),
    ),
    finalPrice: v.optional(v.number()),
    winner: v.optional(
      v.union(v.literal("buyers"), v.literal("sellers"), v.literal("neutral")),
    ),
  },
  handler: async (ctx, args) => {
    console.log(`Updating session ${args.sessionId} to status ${args.status}`);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const update = {
      status: args.status,
      ...(args.finalPrice !== undefined && { finalPrice: args.finalPrice }),
      ...(args.winner !== undefined && { winner: args.winner }),
    };

    await ctx.db.patch(args.sessionId, update);
    console.log(`Session ${args.sessionId} updated successfully`);
  },
});

export const updateBetStatus = mutation({
  args: {
    betId: v.id("bets"),
    status: v.union(v.literal("pending"), v.literal("won"), v.literal("lost")),
    sessionOutcome: v.union(
      v.literal("won"),
      v.literal("lost"),
      v.literal("void"),
    ),
    payout: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.betId, {
      status: args.status,
      sessionOutcome: args.sessionOutcome,
      payout: args.payout,
    });
  },
});

export const updateUserBalance = mutation({
  args: {
    userId: v.id("users"),
    balance: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { balance: args.balance });
  },
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const createTransaction = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    type: v.union(
      v.literal("deposit"),
      v.literal("withdrawal"),
      v.literal("win"),
      v.literal("loss"),
      v.literal("fee"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    fee: v.optional(v.number()),
    paymentMethod: v.union(v.literal("eco-usd"), v.literal("cash")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("transactions", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
