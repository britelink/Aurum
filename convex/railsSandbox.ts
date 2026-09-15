/**
 * Rails sandbox — drive the money paths end to end without money.
 *
 * Every function here is admin-gated **and** refuses to run unless
 * `AURUM_SANDBOX_ENABLED` is `"true"` on the deployment. Two locks rather than
 * one because what this module does is credit a balance from nothing: it is the
 * exact capability the old `depositFunds` had, and the reason that one had to
 * go. An admin session alone is not enough — a production deployment should be
 * unable to mint a balance even if an admin account is compromised, and leaving
 * the flag unset is what guarantees that.
 *
 * What it is for: proving the inbound rail works before a real transfer is
 * risked on it. The synthetic transfer goes through `recordDeposit` and
 * `confirmDeposit` — the same mutations the chain watcher calls, with the same
 * matching, the same confirmation threshold and the same credit — so a pass
 * here means the path is wired, not that a parallel test path is wired.
 *
 * Borrowed from SGX Pay's `merchantSandbox.ts`, minus the scenario scripting:
 * Aurum has one inbound flow, not seven.
 */
import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { REQUIRED_CONFIRMATIONS, randomId, roundAmount } from "./railLib";
import { quoteDepositFor } from "./deposits";
import { queueCryptoPayoutFor } from "./cryptoWithdrawals";
import { queueEcocashPayoutFor } from "./withdrawals";

function sandboxEnabled(): boolean {
  return process.env.AURUM_SANDBOX_ENABLED?.trim() === "true";
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isAdmin(user: Doc<"users"> | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (parseCsvEnv("ADMIN_USER_IDS").includes(String(user._id))) return true;
  const emails = parseCsvEnv("ADMIN_EMAILS").map((e) => e.toLowerCase());
  return Boolean(user.email && emails.includes(user.email.toLowerCase()));
}

async function requireSandboxAdmin(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  db: { get: (id: Id<"users">) => Promise<Doc<"users"> | null> };
}): Promise<Id<"users">> {
  if (!sandboxEnabled()) {
    throw new ConvexError(
      "Sandbox is off. Set AURUM_SANDBOX_ENABLED=true on this deployment to run rail drills — never on production.",
    );
  }
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");
  const userId = identity.subject.split("|")[0] as Id<"users">;
  const user = await ctx.db.get(userId);
  if (!isAdmin(user)) throw new ConvexError("Admin access required");
  return userId;
}

/**
 * Is the sandbox usable, and by whom. Public so a drill can tell "switched off"
 * apart from "you are not an admin" without either answer leaking to a stranger.
 */
export const sandboxStatus = query({
  args: {},
  handler: async (ctx) => {
    const enabled = sandboxEnabled();
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { enabled, admin: false as const };
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    return { enabled, admin: isAdmin(user), userId };
  },
});

/**
 * Feed a synthetic transfer into the inbound rail.
 *
 * `amount` defaults to the deposit's exact payable figure, which is the happy
 * path. Pass a different one to rehearse the interesting failures — a little
 * under to see `underpaid`, a little over to confirm an overpayment still
 * settles, a rounded figure to exercise the 20-cent match band.
 *
 * `confirmations` defaults to the threshold, so one call takes a quote all the
 * way to a credited balance. Pass a smaller number to stop at `detected` and
 * watch the UI count up.
 */
export const simulateInboundTransfer = mutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    amount: v.optional(v.number()),
    confirmations: v.optional(v.number()),
    fromAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSandboxAdmin(ctx);

    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) throw new ConvexError("Deposit not found");

    const amount = roundAmount(args.amount ?? deposit.amountPayable);
    const confirmations = args.confirmations ?? REQUIRED_CONFIRMATIONS;
    const fromAddress =
      args.fromAddress?.toLowerCase() ?? `0x${randomId(40).replace(/[g-z]/g, "0")}`;
    // A hash shaped like a real one, marked so nobody hunts for it on BscScan.
    const txHash = `0xsandbox${randomId(56)}`;

    const recorded: { ok: boolean; reason?: string } = await ctx.runMutation(
      internal.deposits.recordDeposit,
      {
        depositId: args.depositId,
        txHash,
        blockNumber: 1,
        amount,
        fromAddress,
        confirmations,
      },
    );

    let credited: { ok: boolean; credited?: number } = { ok: false };
    if (recorded.reason === "detected") {
      credited = await ctx.runMutation(internal.deposits.confirmDeposit, {
        depositId: args.depositId,
        confirmations,
      });
    }

    const after = await ctx.db.get(args.depositId);
    const user = after ? await ctx.db.get(after.userId) : null;

    return {
      txHash,
      sent: amount,
      recorded: recorded.reason ?? "none",
      credited: credited.ok ? (credited.credited ?? 0) : 0,
      depositStatus: after?.status ?? "missing",
      balance: user?.balance ?? 0,
    };
  },
});

/**
 * Check the Chessa off-ramp without creating an order.
 *
 * Asks Chessa for a rate, which is a read: it proves the deployment URL is
 * right, the bridge secret matches and pricing comes back sane, and it leaves
 * nothing behind. The alternative — creating a real order to "test" — books a
 * remittance somebody then has to cancel, which is how a drill turns into an
 * operations problem.
 *
 * Not sandbox-gated: it writes nothing anywhere. Admin-only because the error
 * it returns names our configuration.
 */
export const checkChessaRail = action({
  args: { usdAmount: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    convexUrl: string | null;
    secretConfigured: boolean;
    rate: unknown;
    error: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const ok = (await ctx.runQuery(internal.aurum.internalIsAdminUser, {
      userId,
    })) as boolean;
    if (!ok) throw new ConvexError("Admin access required");

    const convexUrl =
      process.env.CHESSA_CONVEX_URL?.trim() ||
      process.env.SGX_CONVEX_URL?.trim() ||
      null;
    const secretConfigured = Boolean(
      process.env.CHESSA_V0_INTERNAL_SECRET?.trim() ||
        process.env.SGX_V0_INTERNAL_ACTION_SECRET?.trim(),
    );

    if (!convexUrl) {
      return {
        ok: false,
        convexUrl: null,
        secretConfigured,
        rate: null,
        error: "CHESSA_CONVEX_URL is not set on this deployment.",
      };
    }

    try {
      const { ConvexHttpClient } = await import("convex/browser");
      const { makeFunctionReference } = await import("convex/server");
      const getRate = makeFunctionReference<
        "action",
        { from: string; to: string; amount: number },
        unknown
      >("chessa:getRate");
      const client = new ConvexHttpClient(convexUrl);
      const rate = await client.action(getRate, {
        from: "USDT",
        to: "USD",
        amount: args.usdAmount ?? 5,
      });
      return { ok: true, convexUrl, secretConfigured, rate, error: null };
    } catch (e) {
      return {
        ok: false,
        convexUrl,
        secretConfigured,
        rate: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
});

/**
 * The agent wallet's live float, for a drill that wants to know whether a
 * payout can actually be funded before it queues one.
 */
export const agentFloat = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    | { configured: false }
    | {
        configured: true;
        address: string;
        balances: Record<string, number>;
        bnb: number;
      }
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const ok = (await ctx.runQuery(internal.aurum.internalIsAdminUser, {
      userId,
    })) as boolean;
    if (!ok) throw new ConvexError("Admin access required");
    return await ctx.runAction(internal.cryptoPayoutNode.agentWalletBalance, {});
  },
});

/** Read a deposit by reference, for a drill following one it just created. */
export const depositByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    return await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();
  },
});

/** Re-exported so a drill can assert the threshold it is testing against. */
export const sandboxConstants = query({
  args: {},
  handler: async () => ({
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
    sandboxEnabled: sandboxEnabled(),
  }),
});

// ---------------------------------------------------------------------------
// Drill entry points, invoked with `npx convex run railsSandbox:drillX`.
//
// Internal, so they are unreachable from the internet: only somebody holding a
// deploy key can call them. The ones that can conjure a balance are gated on
// `AURUM_SANDBOX_ENABLED` on top of that, because a leaked deploy key must not
// be able to mint on production — and on this platform a minted balance walks
// out as USDT.
//
// Each is a thin wrapper over the same helper the player-facing mutation calls,
// differing only in where the player id comes from. That is deliberate: a drill
// with its own arithmetic proves that the drill works.
// ---------------------------------------------------------------------------

function assertSandbox() {
  if (!sandboxEnabled()) {
    throw new ConvexError(
      "Sandbox is off. Set AURUM_SANDBOX_ENABLED=true on this deployment to run rail drills — never on production.",
    );
  }
}

/**
 * Find or create the drill's player. It matches the exact email it was given,
 * so it can never wander into a real account.
 */
export const drillUser = internalMutation({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertSandbox();
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      return {
        userId: existing._id,
        created: false,
        balance: existing.balance ?? 0,
      };
    }
    const userId = await ctx.db.insert("users", {
      email,
      name: args.name ?? "Rail Drill",
      balance: 0,
      role: "player",
    });
    return { userId, created: true, balance: 0 };
  },
});

export const drillQuoteDeposit = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    asset: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSandbox();
    return await quoteDepositFor(ctx, args.userId, args.amount, args.asset);
  },
});

/** The same synthetic transfer as the admin-facing version, from the CLI. */
export const drillSimulateTransfer = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    amount: v.optional(v.number()),
    confirmations: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSandbox();
    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) throw new ConvexError("Deposit not found");

    const amount = roundAmount(args.amount ?? deposit.amountPayable);
    const confirmations = args.confirmations ?? REQUIRED_CONFIRMATIONS;
    const txHash = `0xsandbox${randomId(56)}`;

    const recorded: { ok: boolean; reason?: string } = await ctx.runMutation(
      internal.deposits.recordDeposit,
      {
        depositId: args.depositId,
        txHash,
        blockNumber: 1,
        amount,
        fromAddress: "0x000000000000000000000000000000000000dead",
        confirmations,
      },
    );

    let credited: { ok: boolean; credited?: number } = { ok: false };
    if (recorded.reason === "detected") {
      credited = await ctx.runMutation(internal.deposits.confirmDeposit, {
        depositId: args.depositId,
        confirmations,
      });
    }

    const after = await ctx.db.get(args.depositId);
    const user = after ? await ctx.db.get(after.userId) : null;
    return {
      txHash,
      sent: amount,
      recorded: recorded.reason ?? "none",
      credited: credited.ok ? (credited.credited ?? 0) : 0,
      depositStatus: after?.status ?? "missing",
      balance: user?.balance ?? 0,
    };
  },
});

/**
 * Crypto withdrawal drill.
 *
 * Dry by default. `dryRun: false` queues a real transfer out of the agent
 * wallet — which is the point of the drill eventually, but not something that
 * should happen because an argument was left out.
 */
export const drillWithdrawCrypto = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    toAddress: v.string(),
    asset: v.optional(v.string()),
    idempotencyKey: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertSandbox();
    return await queueCryptoPayoutFor(ctx, args.userId, {
      amount: args.amount,
      toAddress: args.toAddress,
      asset: args.asset,
      idempotencyKey: args.idempotencyKey,
      dryRun: args.dryRun !== false,
    });
  },
});

/** EcoCash drill. Same default: dry unless explicitly told otherwise. */
export const drillWithdrawEcocash = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    ecocashPhone: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    idempotencyKey: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertSandbox();
    return await queueEcocashPayoutFor(ctx, args.userId, {
      amount: args.amount,
      ecocashPhone: args.ecocashPhone,
      firstName: args.firstName,
      lastName: args.lastName,
      idempotencyKey: args.idempotencyKey,
      dryRun: args.dryRun !== false,
    });
  },
});

/** Everything the drill asserts on, in one read. */
export const drillSnapshot = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    const deposits = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    const cryptoPayouts = await ctx.db
      .query("cryptoPayouts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    const ecocashPayouts = await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    return {
      balance: user?.balance ?? 0,
      deposits: deposits.map((d) => ({
        reference: d.reference,
        status: d.status,
        asset: d.asset,
        amountPayable: d.amountPayable,
        amountReceived: d.amountReceived,
        amountCredited: d.amountCredited ?? null,
        depositAddress: d.depositAddress,
      })),
      cryptoPayouts: cryptoPayouts.map((p) => ({
        status: p.status,
        amountUsd: p.amountUsd,
        feeUsd: p.feeUsd,
        amountToken: p.amountToken,
        toAddress: p.toAddress,
        txHash: p.txHash ?? null,
        error: p.error ?? null,
      })),
      ecocashPayouts: ecocashPayouts.map((p) => ({
        status: p.status,
        amountUsd: p.amountUsd,
        feeUsd: p.feeUsd ?? null,
        netUsd: p.netUsd ?? null,
        phone: p.ecocashPhone,
        chessaOrderId: p.chessaOrderId ?? null,
        paymentAddress: p.sgxPaymentAddress ?? null,
        sendAmount: p.sgxSendAmount ?? null,
        error: p.sgxError ?? null,
      })),
      transactions: transactions.map((t) => ({
        type: t.type,
        amount: t.amount,
        status: t.status,
        method: t.paymentMethod,
      })),
    };
  },
});

/**
 * Remove the drill's rows.
 *
 * Refuses while anything is in flight: tidying away a queued payout deletes the
 * only record of money that is about to leave the wallet.
 */
export const drillCleanup = internalMutation({
  args: { userId: v.id("users"), deleteUser: v.optional(v.boolean()) },
  handler: async (ctx, { userId, deleteUser }) => {
    assertSandbox();

    const cryptoPayouts = await ctx.db
      .query("cryptoPayouts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(100);
    const ecocashPayouts = await ctx.db
      .query("ecocashPayouts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(100);

    const inFlight = [
      ...cryptoPayouts.filter(
        (p) => p.status === "queued" || p.status === "sending",
      ),
      ...ecocashPayouts.filter(
        (p) => p.status === "queued" || p.status === "sgx_submitted",
      ),
    ];
    if (inFlight.length > 0) {
      throw new ConvexError(
        `${inFlight.length} payout(s) still in flight — refusing to delete the record of money that has not landed.`,
      );
    }

    let removed = 0;
    for (const p of cryptoPayouts) {
      await ctx.db.delete(p._id);
      removed++;
    }
    for (const p of ecocashPayouts) {
      await ctx.db.delete(p._id);
      removed++;
    }
    for (const d of await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(100)) {
      await ctx.db.delete(d._id);
      removed++;
    }
    for (const t of await ctx.db
      .query("transactions")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200)) {
      await ctx.db.delete(t._id);
      removed++;
    }
    if (deleteUser) {
      await ctx.db.delete(userId);
      removed++;
    }
    return { removed };
  },
});
