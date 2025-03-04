import { v } from "convex/values";
import { query, mutation, action, ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

/*
  Core functions for Aurum Capital – an enterprise-ready real-time betting platform.
  As described in the attached document:
  
  • Sessions are open for a 10-second betting period then close for 5 seconds.
  • Users bet fixed lots ($1 or $2) on whether the price index will be above or below
    a randomly generated neutral axis.
  • If both sides participate, the losing side's funds (minus an 8% fee) form a pool that is
    distributed among winners (with $2 bets receiving ~65% and $1 bets ~35%).
  • In cases of a tie or if only one side is present, the session is voided.
  
  Since Convex is a real-time database, we don't require a cron job. Instead, we implement
  session management via a mutation that any user can call ("joinActiveSession"), which ensures
  that if the current session is expired, it is automatically processed and a new one is created.
*/

/* 
  Create a new betting session.
  A session is open for 10 seconds (the betting period), after which it is processed.
*/
export const createSession = mutation({
  handler: async (ctx) => {
    const startTime = Date.now();
    const endTime = startTime + 10000; // 10-second betting period
    const neutralAxis = Math.random() * 100; // simulate price index neutral axis

    return await ctx.db.insert("sessions", {
      startTime,
      endTime,
      neutralAxis,
      totalBuyVolume: 0, // for "up" bets
      totalSellVolume: 0, // for "down" bets
      status: "open",
      finalPrice: undefined,
      winner: undefined,
    });
  },
});

/*
  joinActiveSession ensures there is one active session for all users.
  If the current session is expired (i.e. current time > endTime), it automatically processes
  the session's results and creates a new session.
*/
export const joinActiveSession = mutation({
  args: {},
  handler: async (ctx): Promise<any> => {
    // Query for the current open session.
    let currentSession = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .first();

    const now = Date.now();
    if (currentSession && now > currentSession.endTime) {
      // The current session is expired—process its results.
      await (ctx as any).runAction(api.aurum.processSessionResults, {
        sessionId: currentSession._id,
        finalPrice: Math.random() * 100,
      });
      currentSession = null;
    }

    // If no active session exists, create a new one.
    if (!currentSession) {
      const sessionId = await ctx.runMutation(api.aurum.createSession);
      currentSession = await ctx.db.get(sessionId);
    }

    return currentSession;
  },
});

/*
  Place a bet in an open session.
  Clients are expected to first call joinActiveSession to obtain the active session.
  This function then validates that the session is still open and registers the bet.
*/
export const placeBet = mutation({
  args: {
    sessionId: v.id("sessions"),
    amount: v.union(v.literal(1), v.literal(2)),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Not authenticated");

    // Ensure session exists and is open.
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "open") throw new Error("Session is closed");

    // Update session volumes based on bet direction.
    if (args.direction === "up") {
      await ctx.db.patch(args.sessionId, {
        totalBuyVolume: session.totalBuyVolume + args.amount,
      });
    } else {
      await ctx.db.patch(args.sessionId, {
        totalSellVolume: session.totalSellVolume + args.amount,
      });
    }

    // Register the bet with initial "pending" status.
    return await ctx.db.insert("bets", {
      userId: userId.subject as Id<"users">,
      sessionId: args.sessionId,
      amount: args.amount,
      direction: args.direction,
      status: "pending",
      payout: undefined,
      sessionOutcome: undefined,
    });
  },
});

/*
  Get the current open session.
  This query returns the session that is currently accepting bets.
  (Note: joinActiveSession is preferred to automatically manage expired sessions.)
*/
export const getCurrentSession = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .first();
  },
});

// Get a session by its ID.
export const getSessionById = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    return session;
  },
});

// Get all bets for a specific session.
export const getBetsForSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await (ctx as any).db
      .query("bets")
      .withIndex("by_session", (q: any) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

/*
  Process a session's results:
  - Determines the winning direction based on the finalPrice relative to the session's neutralAxis.
  - If the result is a tie or only one side participated, the session is voided.
  - Otherwise, calculates winnings (after deducting an 8% broker fee) and distributes payouts:
    • 35% of the net pool goes to winning $1 bets,
    • 65% to winning $2 bets.
  - Updates bet statuses and user balances accordingly.
  This follows the core logic outlined in your document.
*/
export const processSessionResults = action({
  args: {
    sessionId: v.id("sessions"),
    finalPrice: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch the session and its bets.
    const session = await (ctx as any).db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "open") throw new Error("Session already processed");

    // Determine winning direction based on finalPrice vs. neutralAxis.
    let winningDirection = null;
    if (args.finalPrice > session.neutralAxis) {
      winningDirection = "up";
    } else if (args.finalPrice < session.neutralAxis) {
      winningDirection = "down";
    }
    // If finalPrice exactly equals neutralAxis, treat the session as void.

    // Get all bets for the session.
    const bets = await (ctx as any).db
      .query("bets")
      .withIndex("by_session", (q: any) => q.eq("sessionId", args.sessionId))
      .collect();

    // Check if both sides are present.
    const hasBuyers = bets.some(
      (bet: { direction: string }) => bet.direction === "up",
    );
    const hasSellers = bets.some(
      (bet: { direction: string }) => bet.direction === "down",
    );
    if (!winningDirection || !hasBuyers || !hasSellers) {
      // Void the session if conditions are not met.
      await (ctx as any).db.patch(args.sessionId, {
        status: "closed",
        finalPrice: args.finalPrice,
        winner: "neutral",
      });
      for (const bet of bets) {
        await (ctx as any).db.patch(bet._id, {
          status: "pending", // Or "void" if you add that status.
          sessionOutcome: "void",
        });
      }
      return { result: "Session voided; no funds exchanged." };
    }

    // Calculate totals:
    // Losing pool: total bet amount from the losing side.
    let losersTotal = 0;
    // Count winning bets for distribution.
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

    // Deduct an 8% broker fee from the losers' pool.
    const netPool = losersTotal * 0.92;
    // Allocate 35% to $1 bet winners and 65% to $2 bet winners.
    const pool1 = netPool * 0.35;
    const pool2 = netPool * 0.65;

    const winPerOne = winners1 > 0 ? pool1 / winners1 : 0;
    const winPerTwo = winners2 > 0 ? pool2 / winners2 : 0;

    // Process each bet: update statuses, update user balances, and log transactions.
    for (const bet of bets) {
      const user = await (ctx as any).db.get(bet.userId);
      if (!user) continue;

      if (bet.direction === winningDirection) {
        let profit = bet.amount === 1 ? winPerOne : winPerTwo;
        const totalReturn = bet.amount + profit;
        await (ctx as any).db.patch(bet._id, {
          status: "won",
          sessionOutcome: "won",
          payout: totalReturn,
        });
        await (ctx as any).db.patch(bet.userId, {
          balance: (user.balance || 0) + totalReturn,
        });
        await (ctx as any).db.insert("transactions", {
          userId: bet.userId,
          amount: totalReturn,
          type: "win",
          status: "completed",
          fee: null,
          timestamp: Date.now(),
          paymentMethod: "eco-usd",
        });
      } else {
        await (ctx as any).db.patch(bet._id, {
          status: "lost",
          sessionOutcome: "lost",
          payout: 0,
        });
        await (ctx as any).db.insert("transactions", {
          userId: bet.userId,
          amount: -bet.amount,
          type: "loss",
          status: "completed",
          fee: null,
          timestamp: Date.now(),
          paymentMethod: "eco-usd",
        });
      }
    }

    // Log the fee taken by Aurum.
    const feeAmount = losersTotal * 0.08;
    await (ctx as any).db.insert("transactions", {
      userId: "aurum_fee_account",
      amount: feeAmount,
      type: "fee",
      status: "completed",
      fee: feeAmount,
      timestamp: Date.now(),
      paymentMethod: "eco-usd",
    });

    // Update the session to closed.
    await (ctx as any).db.patch(args.sessionId, {
      status: "closed",
      finalPrice: args.finalPrice,
      winner: winningDirection === "up" ? "buyers" : "sellers",
    });

    return { result: "Session processed successfully." };
  },
});

/*
  Deposit funds into a user's account.
  Funds can be deposited via "eco-usd" or "cash", as outlined in the document.
*/
export const depositFunds = mutation({
  args: {
    amount: v.number(),
    paymentMethod: v.union(v.literal("eco-usd"), v.literal("cash")),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId.subject as Id<"users">);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(userId.subject as Id<"users">, {
      balance: (user.balance || 0) + args.amount,
    });

    return await ctx.db.insert("transactions", {
      userId: userId.subject as Id<"users">,
      amount: args.amount,
      type: "deposit",
      status: "completed",
      fee: undefined,
      timestamp: Date.now(),
      paymentMethod: args.paymentMethod,
    });
  },
});

/*
  Withdraw funds from a user's account.
  Checks for sufficient balance before deducting and logging the transaction.
*/
export const withdrawFunds = mutation({
  args: {
    amount: v.number(),
    paymentMethod: v.union(v.literal("eco-usd"), v.literal("cash")),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId.subject as Id<"users">);
    if (!user) throw new Error("User not found");
    if ((user.balance || 0) < args.amount)
      throw new Error("Insufficient funds");

    await ctx.db.patch(userId.subject as Id<"users">, {
      balance: (user.balance || 0) - args.amount,
    });

    return await ctx.db.insert("transactions", {
      userId: userId.subject as Id<"users">,
      amount: -args.amount,
      type: "withdrawal",
      status: "completed",
      fee: undefined,
      timestamp: Date.now(),
      paymentMethod: args.paymentMethod,
    });
  },
});

/*
  Record an admin action (e.g. adjustments, overrides).
  This is restricted to users with an admin role.
*/
export const recordAdminAction = mutation({
  args: {
    actionType: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId.subject as Id<"users">);
    if (!user || user.role !== "admin")
      throw new Error("Unauthorized: Admin access required");

    return await ctx.db.insert("adminActions", {
      adminId: userId.subject as Id<"users">,
      actionType: args.actionType,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});
