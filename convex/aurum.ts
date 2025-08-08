import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

/*
  Core functions for Aurum Capital – an enterprise-ready real-time betting platform.
  Session management has been moved to session.ts
*/

export const placeBet = mutation({
  args: {
    sessionId: v.id("sessions"),
    amount: v.union(v.literal(1), v.literal(2)),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject.split("|")[0] as Id<"users">;

    // Ensure session exists and is open
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "open") throw new Error("Session is closed");

    // Update session volumes based on bet direction
    if (args.direction === "up") {
      await ctx.db.patch(args.sessionId, {
        totalBuyVolume: session.totalBuyVolume + args.amount,
      });
    } else {
      await ctx.db.patch(args.sessionId, {
        totalSellVolume: session.totalSellVolume + args.amount,
      });
    }

    // Register the bet with initial "pending" status
    return await ctx.db.insert("bets", {
      userId,
      sessionId: args.sessionId,
      amount: args.amount,
      direction: args.direction,
      status: "pending",
      payout: undefined,
      sessionOutcome: undefined,
    });
  },
});

export const depositFunds = mutation({
  args: {
    amount: v.number(),
    paymentMethod: v.union(
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
    ),
  },
  handler: async (ctx, args) => {
    console.log("Starting depositFunds mutation");

    const identity = await ctx.auth.getUserIdentity();
    console.log("Auth identity:", identity);

    if (!identity) throw new Error("Not authenticated");

    // Get the actual user ID from the identity
    const userId = identity.subject.split("|")[0] as Id<"users">;
    console.log("Parsed userId:", userId);

    const user = await ctx.db.get(userId);
    console.log("Found user:", user);

    if (!user) {
      throw new Error("User not found");
    }

    console.log("Current balance:", user.balance);
    console.log("Adding amount:", args.amount);

    try {
      // Update existing user's balance
      await ctx.db.patch(userId, {
        balance: (user.balance || 0) + args.amount,
      });
      console.log("Successfully updated balance");

      const transaction = await ctx.db.insert("transactions", {
        userId,
        amount: args.amount,
        type: "deposit",
        status: "completed",
        fee: undefined,
        timestamp: Date.now(),
        paymentMethod: args.paymentMethod,
      });
      console.log("Created transaction:", transaction);

      return transaction;
    } catch (error) {
      console.error("Error in depositFunds:", error);
      throw error;
    }
  },
});

export const adminDepositFunds = mutation({
  args: {
    userId: v.string(),
    amount: v.number(),
    paymentMethod: v.union(
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
    ),
  },
  handler: async (ctx, args) => {
    console.log("Starting adminDepositFunds mutation");
    console.log("User ID:", args.userId);
    console.log("Amount:", args.amount);
    console.log("Payment method:", args.paymentMethod);

    const userId = args.userId as Id<"users">;
    const user = await ctx.db.get(userId);
    console.log("Found user:", user);

    if (!user) {
      throw new Error("User not found");
    }

    console.log("Current balance:", user.balance);
    console.log("Adding amount:", args.amount);

    try {
      // Update existing user's balance
      await ctx.db.patch(userId, {
        balance: (user.balance || 0) + args.amount,
      });
      console.log("Successfully updated balance");

      const transaction = await ctx.db.insert("transactions", {
        userId,
        amount: args.amount,
        type: "deposit",
        status: "completed",
        fee: undefined,
        timestamp: Date.now(),
        paymentMethod: args.paymentMethod,
      });
      console.log("Created transaction:", transaction);

      return transaction;
    } catch (error) {
      console.error("Error in adminDepositFunds:", error);
      throw error;
    }
  },
});

export const withdrawFunds = mutation({
  args: {
    amount: v.number(),
    paymentMethod: v.union(v.literal("eco-usd"), v.literal("cash")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if ((user.balance || 0) < args.amount)
      throw new Error("Insufficient funds");

    await ctx.db.patch(userId, {
      balance: (user.balance || 0) - args.amount,
    });

    return await ctx.db.insert("transactions", {
      userId,
      amount: -args.amount,
      type: "withdrawal",
      status: "completed",
      fee: undefined,
      timestamp: Date.now(),
      paymentMethod: args.paymentMethod,
    });
  },
});

export const recordAdminAction = mutation({
  args: {
    actionType: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    return await ctx.db.insert("adminActions", {
      adminId: userId,
      actionType: args.actionType,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});

export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Get the actual user ID from the identity
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);

    if (!user) {
      return null;
    }

    return user;
  },
});
