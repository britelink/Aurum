/**
 * Whether a withdrawal can actually be paid, decided by the float itself.
 *
 * This replaces a hand-flipped `AURUM_WITHDRAWALS_PAUSED`. The switch was
 * honest about the situation — the float was empty — but it had the failure
 * mode every manual gate has: it stays shut after the reason for it goes away.
 * Somebody funds the treasury and withdrawals remain off until a person
 * remembers a flag, and the only signal that anything is wrong is players
 * asking why.
 *
 * So availability is now derived. Fund the wallet and pay the gas, and
 * withdrawals open on their own; drain it and they close on their own. Nobody
 * has to remember anything.
 *
 * The snapshot it reads is written by `treasuryFloatNode.snapshotFloat` on a
 * cron, because these checks run inside mutations and a mutation cannot read a
 * chain. That indirection is the one thing to be careful about, and the
 * staleness rule below is how it is handled.
 */

import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { roundAmount } from "./railLib";

export const FLOAT_SNAPSHOT_KEY = "treasuryFloat";

/**
 * A BEP-20 transfer is ~60k gas. This is roughly ten of them.
 *
 * Deliberately more than one: the gate should close while there is still enough
 * gas to finish the payouts already in flight, not at the moment the next one
 * would fail halfway through.
 */
export const MIN_GAS_BNB = 0.0005;

/**
 * How old a reading may be before it stops counting as knowledge.
 *
 * A stale snapshot is the dangerous case. The cron stopping, the RPC refusing,
 * or the action erroring all leave the last *good* reading sitting there, and
 * acting on it means paying out against a balance that may have been spent an
 * hour ago. Not knowing is treated as not having — the cost is a player waiting
 * who could have been paid, against paying from a float that is not there.
 */
export const MAX_SNAPSHOT_AGE_MS = 45 * 60 * 1000;

export type FloatSnapshot = {
  usdt: number;
  bnb: number;
  address: string;
  at: number;
};

export type Availability = {
  available: boolean;
  message: string | null;
  /** For the admin view — players are told less than this. */
  reason: "ok" | "kill_switch" | "no_reading" | "stale" | "no_gas" | "short" | null;
  snapshot: FloatSnapshot | null;
};

/**
 * What a player is told when we cannot pay.
 *
 * One sentence, no diagnosis. "Treasury low on float" describes our problem in
 * our vocabulary; a player wants to know whether their money is safe and
 * whether to wait. Naming the internal cause also invites the reading that the
 * platform is in trouble, which is worse than saying less.
 */
export const UNAVAILABLE_MESSAGE =
  "Withdrawals are unavailable right now. Your balance is safe and unchanged, " +
  "and you can keep playing — cash-outs will reopen automatically.";

export function decideAvailability(
  snapshot: FloatSnapshot | null,
  needUsdt?: number,
  now: number = Date.now(),
): Availability {
  /*
   * The manual switch stays, but only as an override that can *close* the gate.
   * There is no matching flag to force it open: a switch that says "pay anyway"
   * is a switch that eventually pays out of an empty wallet.
   */
  if (process.env.AURUM_WITHDRAWALS_PAUSED?.trim() === "true") {
    return {
      available: false,
      message:
        process.env.AURUM_WITHDRAWALS_PAUSED_MESSAGE?.trim() || UNAVAILABLE_MESSAGE,
      reason: "kill_switch",
      snapshot,
    };
  }

  if (!snapshot) {
    return { available: false, message: UNAVAILABLE_MESSAGE, reason: "no_reading", snapshot };
  }
  if (now - snapshot.at > MAX_SNAPSHOT_AGE_MS) {
    return { available: false, message: UNAVAILABLE_MESSAGE, reason: "stale", snapshot };
  }
  if (snapshot.bnb < MIN_GAS_BNB) {
    // Tokens with no gas cannot move. The balance looks fine and every send
    // would fail, so this has to close the gate as firmly as an empty wallet.
    return { available: false, message: UNAVAILABLE_MESSAGE, reason: "no_gas", snapshot };
  }
  if (needUsdt !== undefined && snapshot.usdt < needUsdt) {
    return { available: false, message: UNAVAILABLE_MESSAGE, reason: "short", snapshot };
  }
  if (snapshot.usdt <= 0) {
    return { available: false, message: UNAVAILABLE_MESSAGE, reason: "short", snapshot };
  }

  return { available: true, message: null, reason: "ok", snapshot };
}

export async function readSnapshot(ctx: {
  db: {
    query: (t: "railConfig") => {
      withIndex: (
        i: "by_key",
        f: (q: { eq: (k: "key", v: string) => unknown }) => unknown,
      ) => { first: () => Promise<{ value: string } | null> };
    };
  };
}): Promise<FloatSnapshot | null> {
  const row = await ctx.db
    .query("railConfig")
    .withIndex("by_key", (q) => q.eq("key", FLOAT_SNAPSHOT_KEY))
    .first();
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as FloatSnapshot;
    if (typeof parsed?.usdt !== "number" || typeof parsed?.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Availability as the rest of the backend asks for it. */
export const availability = internalQuery({
  args: { needUsdt: v.optional(v.number()) },
  handler: async (ctx, { needUsdt }): Promise<Availability> => {
    const snapshot = await readSnapshot(ctx as never);
    return decideAvailability(snapshot, needUsdt);
  },
});

/** Admin-facing detail: the reading, its age, and what it implies. */
export const floatStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const snapshot = await readSnapshot(ctx as never);
    const decision = decideAvailability(snapshot);
    return {
      ...decision,
      ageMs: snapshot ? Date.now() - snapshot.at : null,
      minGasBnb: MIN_GAS_BNB,
      usdt: snapshot ? roundAmount(snapshot.usdt) : null,
      bnb: snapshot ? snapshot.bnb : null,
    };
  },
});
