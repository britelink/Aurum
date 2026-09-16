/**
 * Who owns the tokens in the agent wallet.
 *
 * Players see a dollar balance — $2, $5, $6 — and underneath, that is a claim
 * on USDT sitting at the agent address. This is where that mapping is made
 * explicit: every player's share, what the platform owes in total, and whether
 * the wallet actually holds it.
 *
 * **There is deliberately no second balance field.** The obvious build is a
 * `userHoldings` table carrying a token figure alongside `users.balance`, and
 * it is a trap: two numbers that must be updated in the same seven places —
 * deposit credit, stake debit, win, loss, void refund, payout debit, payout
 * refund — will disagree the first time one of those paths is added or changed,
 * and a solvency report built on a counter that has silently drifted is worse
 * than having no report at all, because it is believed.
 *
 * So the balance *is* the holding. USDT is dollar-pegged and the rail credits
 * and debits it 1:1, which is what makes the identity safe. What was missing
 * was not a number to store but a reconciliation to run: compare the sum of
 * what players are owed against what the wallet actually holds, and say plainly
 * which way the difference goes.
 */
import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { roundMoney } from "./railLib";

/** Balances below this are rounding dust, not a holding worth listing. */
const DUST = 0.005;

/**
 * Total owed to players, and the biggest holders.
 *
 * Capped at 2,000 accounts. Past that the sum stops being exact and the report
 * says so rather than quietly under-reporting the liability — an understated
 * "we owe" is the one error this must never make.
 */
export const liabilities = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const scanCap = 2000;
    const users = await ctx.db.query("users").take(scanCap + 1);
    const truncated = users.length > scanCap;
    const rows = users.slice(0, scanCap);

    const holders = rows
      .map((u) => ({
        userId: u._id as Id<"users">,
        email: u.email ?? null,
        name: u.name ?? null,
        usdt: roundMoney(u.balance ?? 0),
      }))
      .filter((h) => h.usdt > DUST)
      .sort((a, b) => b.usdt - a.usdt);

    return {
      accountsScanned: rows.length,
      truncated,
      holderCount: holders.length,
      totalOwedUsdt: roundMoney(holders.reduce((s, h) => s + h.usdt, 0)),
      topHolders: holders.slice(0, Math.min(args.limit ?? 25, 100)),
    };
  },
});

/**
 * Money still in flight, which a solvency check has to account for separately.
 *
 * A queued payout has already left the player's balance but not yet the wallet,
 * so it is neither a liability nor spendable float. Counting it as neither is
 * what makes the surplus figure mean something.
 */
export const inFlight = internalQuery({
  args: {},
  handler: async (ctx) => {
    const crypto = await ctx.db
      .query("cryptoPayouts")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(200);
    const sending = await ctx.db
      .query("cryptoPayouts")
      .withIndex("by_status", (q) => q.eq("status", "sending"))
      .take(200);
    const ecocash = (
      await ctx.db.query("ecocashPayouts").order("desc").take(300)
    ).filter((p) => p.status === "queued" || p.status === "sgx_submitted");

    const cryptoOut = roundMoney(
      [...crypto, ...sending].reduce((s, p) => s + p.amountToken, 0),
    );
    const ecocashOut = roundMoney(
      ecocash.reduce((s, p) => s + (p.netUsd ?? p.amountUsd), 0),
    );

    return {
      cryptoPayoutsPending: crypto.length + sending.length,
      cryptoOutUsdt: cryptoOut,
      ecocashPayoutsPending: ecocash.length,
      ecocashOutUsdt: ecocashOut,
      totalInFlightUsdt: roundMoney(cryptoOut + ecocashOut),
    };
  },
});

/**
 * What one player's balance means in tokens, for their own wallet screen.
 *
 * Says where the tokens are, because "held for you" is a claim a player is
 * entitled to check: the address is public and the balance is on chain.
 */
export const myHolding = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const address =
      process.env.AURUM_DEPOSIT_ADDRESS?.trim() ??
      (
        await ctx.db
          .query("railConfig")
          .withIndex("by_key", (q) => q.eq("key", "depositAddress"))
          .first()
      )?.value ??
      null;

    return {
      balanceUsd: roundMoney(user.balance ?? 0),
      // 1:1 by construction: the rail credits and debits USDT against this
      // balance directly, and USDT is dollar-pegged.
      holdingUsdt: roundMoney(user.balance ?? 0),
      asset: "USDT",
      chain: "BNB Smart Chain (BEP20)",
      custodyAddress: address,
      custodyUrl: address ? `https://bscscan.com/address/${address}` : null,
    };
  },
});
