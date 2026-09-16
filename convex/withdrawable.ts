/**
 * How much of a balance a player is actually allowed to take out.
 *
 * The game is a pool: winners are paid from losers' stakes, so in aggregate the
 * platform never owes more than was deposited. But *one* player can be up a lot
 * — and right now the agent wallet is funded from deposits alone, with no house
 * capital behind it. A player who runs $2 into $1,000 and withdraws would be
 * paid out of everybody else's deposits, and the pool would stop covering what
 * it owes long before the last of them noticed.
 *
 * So until the treasury is capitalised: **winnings accumulate and are playable,
 * but only deposits are withdrawable.** A player can always take back what they
 * put in, never more. That is a real restriction and the wallet says so plainly
 * rather than letting someone discover it at the moment they try to cash out.
 *
 * Derived from `transactions`, not from a counter.
 *
 * A stored `depositedTotal` would have to be incremented in four places and
 * decremented correctly on every refund path; the first one that gets missed
 * silently raises somebody's withdrawal limit, and a limit that has drifted
 * upward is indistinguishable from one that was set correctly. The ledger is
 * already the record of every movement, so the cap is computed from it and
 * cannot disagree with it.
 */
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { roundMoney } from "./railLib";

/**
 * Ledger rows scanned per check.
 *
 * A player reaches this only after hundreds of rounds. Past it the sum is
 * incomplete, and an incomplete deposit total must never be rounded up into a
 * larger allowance — so the result is marked and the caller falls back to the
 * stricter answer.
 */
const SCAN_LIMIT = 800;

export type Withdrawable = {
  balance: number;
  /** Everything the player has ever funded, across both rails. */
  deposited: number;
  /** Everything already taken out, or on its way out. */
  withdrawn: number;
  /** The cap: deposits minus what has been withdrawn, never above the balance. */
  withdrawable: number;
  /** Balance the cap does not cover — winnings, playable but not yet cashable. */
  locked: number;
  /** True when the ledger was longer than we read; the cap is then conservative. */
  partial: boolean;
};

export async function withdrawableFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Withdrawable> {
  const user = await ctx.db.get(userId);
  const balance = roundMoney(user?.balance ?? 0);

  const rows = await ctx.db
    .query("transactions")
    .withIndex("by_user_time", (q) => q.eq("userId", userId))
    .order("desc")
    .take(SCAN_LIMIT + 1);
  const partial = rows.length > SCAN_LIMIT;

  let deposited = 0;
  let withdrawn = 0;
  for (const t of rows.slice(0, SCAN_LIMIT)) {
    if (t.type === "deposit" && t.status === "completed" && t.amount > 0) {
      deposited += t.amount;
    }
    /*
     * Pending counts as withdrawn. A payout in flight has left the balance and
     * may yet land; treating it as not-yet-withdrawn would let a second request
     * be approved against the same headroom while the first is still moving.
     * A failed one is excluded, because its refund restored the balance.
     */
    if (t.type === "withdrawal" && t.status !== "failed" && t.amount < 0) {
      withdrawn += Math.abs(t.amount);
    }
  }

  deposited = roundMoney(deposited);
  withdrawn = roundMoney(withdrawn);

  const headroom = Math.max(0, roundMoney(deposited - withdrawn));
  // Never above the balance: you cannot withdraw money you have since lost.
  const withdrawable = roundMoney(Math.min(headroom, balance));

  return {
    balance,
    deposited,
    withdrawn,
    withdrawable,
    locked: roundMoney(Math.max(0, balance - withdrawable)),
    partial,
  };
}

/** The sentence a player sees when winnings are what is blocking them. */
export function lockedExplanation(w: Withdrawable): string {
  return (
    `You can withdraw $${w.withdrawable.toFixed(2)} — what you have deposited ` +
    `and not yet taken out. The other $${w.locked.toFixed(2)} is winnings, ` +
    "which stay in play until the payout float is capitalised."
  );
}
