/**
 * A single-flight lease over the agent wallet.
 *
 * One wallet, one nonce sequence. Aurum has two independent senders — the
 * crypto payout rail and the EcoCash funding step — and both are scheduled
 * actions, so two payouts queued a second apart will happily build and
 * broadcast at the same moment. Both read the same pending nonce, and one of
 * them is rejected as a duplicate or, worse, silently replaces the other.
 *
 * SGX signs from this same key, and we cannot coordinate with it from here.
 * That is handled separately, by retrying with a refreshed nonce when the chain
 * rejects one — a lock cannot help against a process we do not run. This lock
 * solves the half we do control: Aurum never races itself.
 *
 * The lease is time-boxed rather than held until release. An action that dies
 * mid-send (a deploy, a timeout) would otherwise hold the lock forever and stop
 * every payout on the platform, which is a worse failure than the collision it
 * was meant to prevent.
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { randomId } from "./railLib";

/** Long enough for an RPC round trip and a broadcast, short enough to recover. */
const DEFAULT_TTL_MS = 90_000;

type Lease = { token: string; expiresAt: number };

function parse(raw: string | null): Lease | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Lease>;
    if (typeof p.token === "string" && typeof p.expiresAt === "number") {
      return { token: p.token, expiresAt: p.expiresAt };
    }
  } catch {
    /* a corrupt lease is no lease */
  }
  return null;
}

export const acquire = internalMutation({
  args: { key: v.string(), ttlMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("railConfig")
      .withIndex("by_key", (q) => q.eq("key", `lock:${args.key}`))
      .first();

    const held = parse(row?.value ?? null);
    if (held && held.expiresAt > now) {
      return { acquired: false as const, retryInMs: held.expiresAt - now };
    }

    const lease: Lease = {
      token: randomId(16),
      expiresAt: now + (args.ttlMs ?? DEFAULT_TTL_MS),
    };
    const value = JSON.stringify(lease);
    if (row) {
      await ctx.db.patch(row._id, { value, updatedAt: now });
    } else {
      await ctx.db.insert("railConfig", {
        key: `lock:${args.key}`,
        value,
        updatedAt: now,
      });
    }
    return { acquired: true as const, token: lease.token };
  },
});

/**
 * Release, but only if we still hold it.
 *
 * Checking the token matters: a lease that expired and was taken by another
 * sender must not be cleared by the slow one finishing afterwards, or the new
 * holder loses its protection halfway through its own send.
 */
export const release = internalMutation({
  args: { key: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("railConfig")
      .withIndex("by_key", (q) => q.eq("key", `lock:${args.key}`))
      .first();
    const held = parse(row?.value ?? null);
    if (!row || !held || held.token !== args.token) {
      return { released: false as const };
    }
    await ctx.db.patch(row._id, {
      value: JSON.stringify({ token: held.token, expiresAt: 0 }),
      updatedAt: Date.now(),
    });
    return { released: true as const };
  },
});

/** The one lease every sender from the agent wallet contends for. */
export const AGENT_WALLET_LOCK = "agentWalletSend";
