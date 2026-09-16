/**
 * One-off data corrections, run by hand from the CLI.
 *
 * Internal only — a deploy key is the gate. Nothing here is on a cron and
 * nothing here is reachable from a browser.
 */
import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { roundMoney } from "./railLib";

/**
 * What the books say before anything is touched.
 *
 * Run this first. A reset that cannot be compared against a "before" is a reset
 * nobody can audit afterwards.
 */
export const balanceReport = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(1000);
    const funded = users
      .filter((u) => (u.balance ?? 0) !== 0)
      .map((u) => ({
        userId: u._id,
        email: u.email ?? null,
        balance: u.balance ?? 0,
      }))
      .sort((a, b) => b.balance - a.balance);
    return {
      totalUsers: users.length,
      usersWithBalance: funded.length,
      totalBalance: roundMoney(funded.reduce((s, u) => s + u.balance, 0)),
      accounts: funded.slice(0, 50),
    };
  },
});

/**
 * Zero every balance, leaving a ledger row for each one.
 *
 * Why this is needed: under the old engine `placeBet` never debited the stake
 * and settlement was computed in the browser, which then told the server what
 * to credit. Balances grew out of nothing. `depositFunds` was also a public
 * mutation that credited the caller any amount with no payment behind it. So
 * the balances standing on this deployment are not claims anybody funded —
 * they are the residue of those bugs, and the new rails would honour them as
 * real money and pay them out in USDT.
 *
 * It does **not** silently erase. Each account gets an `adjustment`-shaped
 * `transactions` row for the exact amount removed, tagged `legacy-reset`, so
 * the history reads as a correction that happened rather than a number that
 * changed on its own — and so a genuine pre-existing claim can be identified
 * and re-credited by hand.
 *
 * Bounded and repeatable: it walks a page at a time and reports whether more
 * remain, so a large table cannot blow the transaction limit halfway through
 * and leave the reset half-applied.
 */
export const zeroAllBalances = internalMutation({
  args: {
    /** Must be exactly "ZERO_ALL_BALANCES". A typo should do nothing. */
    confirm: v.string(),
    /** Accounts per run. */
    limit: v.optional(v.number()),
    /** Report what would change without writing. */
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.confirm !== "ZERO_ALL_BALANCES") {
      throw new ConvexError(
        'Refusing to run: pass confirm: "ZERO_ALL_BALANCES" to zero every player balance.',
      );
    }

    const limit = Math.min(args.limit ?? 200, 500);
    const users = await ctx.db.query("users").take(limit + 1);
    const more = users.length > limit;
    const page = users.slice(0, limit);

    const now = Date.now();
    let cleared = 0;
    let removed = 0;
    const touched: Array<{ email: string | null; was: number }> = [];

    for (const u of page) {
      const was = u.balance ?? 0;
      if (was === 0) continue;

      touched.push({ email: u.email ?? null, was: roundMoney(was) });
      removed = roundMoney(removed + was);
      cleared++;

      if (args.dryRun) continue;

      await ctx.db.insert("transactions", {
        userId: u._id,
        amount: roundMoney(-was),
        type: "withdrawal",
        status: "completed",
        timestamp: now,
        paymentMethod: "cash",
        ref: "legacy-reset: balance predates the funded rails",
      });
      await ctx.db.patch(u._id, { balance: 0 });
    }

    return {
      dryRun: args.dryRun === true,
      scanned: page.length,
      cleared,
      removed,
      more,
      touched: touched.slice(0, 50),
    };
  },
});

/**
 * Clear the game tables so a fresh test starts from nothing.
 *
 * Separate from the balance reset on purpose: wiping rounds is cosmetic, wiping
 * balances is financial, and they should not share one irreversible command.
 */
export const resetGameHistory = internalMutation({
  args: { confirm: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (args.confirm !== "RESET_GAME_HISTORY") {
      throw new ConvexError(
        'Refusing to run: pass confirm: "RESET_GAME_HISTORY".',
      );
    }
    const limit = Math.min(args.limit ?? 200, 500);

    let bets = 0;
    for (const b of await ctx.db.query("bets").take(limit)) {
      await ctx.db.delete(b._id);
      bets++;
    }
    let rounds = 0;
    for (const s of await ctx.db.query("sessions").take(limit)) {
      // Never delete a round that is still taking bets or still settling.
      if (s.status === "open" || s.status === "processing") continue;
      await ctx.db.delete(s._id);
      rounds++;
    }
    return { bets, rounds };
  },
});
