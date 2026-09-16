import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { withdrawableFor } from "./withdrawable";
import { withdrawalPauseMessage, withdrawalsPaused } from "./railLib";
import {
  formatSgxPartnerApiError,
  getSgxV0BaseUrl,
  getSgxV0CryptoToEcocashUrl,
  getSgxV0EcocashToCryptoUrl,
  isValidZwEcocashNineDigits,
  parseSgxPartnerFlow,
  toZwEcocashLocalNineDigits,
  useSgxV0TestEndpoints,
} from "./britelinkSgx";

/** Limit SSRF when Convex polls SGX/Pesepay status URLs. */
function assertSafeHttpsPartnerStatusUrl(urlStr: string): string {
  let u: URL;
  try {
    u = new URL(urlStr.trim());
  } catch {
    throw new Error("Invalid status URL");
  }
  if (u.protocol !== "https:") {
    throw new Error("status URL must use https");
  }
  const host = u.hostname.toLowerCase();
  const allowed =
    host === "sgxremit.com" ||
    host.endsWith(".sgxremit.com") ||
    host.endsWith(".pesepay.com") ||
    host.includes("pesepay") ||
    host.includes("chessa");
  if (!allowed) {
    throw new Error(`Refusing to fetch status URL host: ${host}`);
  }
  return u.toString();
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAdminUser(user: {
  _id: Id<"users">;
  role?: "player" | "admin" | "agent";
  email?: string;
}): boolean {
  if (user.role === "admin") return true;
  const allowedIds = parseCsvEnv("ADMIN_USER_IDS");
  if (allowedIds.includes(String(user._id))) return true;
  const allowedEmails = parseCsvEnv("ADMIN_EMAILS").map((e) =>
    e.toLowerCase(),
  );
  if (user.email && allowedEmails.includes(user.email.toLowerCase())) return true;
  return false;
}

/**
 * Same rule as `getCurrentUser`: Convex Auth encodes the users row id in `subject`.
 * Do not use `getAuthUserId` here — it can disagree with `subject` and fail admin checks.
 */
function usersIdFromIdentitySubject(subject: string): Id<"users"> {
  return subject.split("|")[0] as Id<"users">;
}

/*
  Core functions for Aurum Capital – an enterprise-ready real-time betting platform.
  Session management has been moved to session.ts
*/

/**
 * Manual balance adjustment — the only hand-written path into a player's money.
 *
 * What it replaces is worth naming. `depositFunds` was a public mutation that
 * credited the caller's own balance with whatever number they passed and no
 * payment behind it. `adminDepositFunds` and `adminWithdrawFunds` took an
 * arbitrary `userId` and had **no admin check at all** — and were exposed to the
 * open internet through unauthenticated Next routes under `/api/house` and
 * `/api/payment`. While the balance was play money that was merely wrong; with
 * the crypto payout rail live, minting a balance means withdrawing real USDT
 * from the agent wallet.
 *
 * So: one function, admin identity required, every use audited in
 * `adminActions`, and it books a `transactions` row like any other movement so
 * a hand adjustment is never invisible in the ledger.
 */
export const adminAdjustBalance = mutation({
  args: {
    userId: v.id("users"),
    /** Positive credits, negative debits. */
    delta: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const adminId = usersIdFromIdentitySubject(identity.subject);
    const admin = await ctx.db.get(adminId);
    if (!admin || !isAdminUser(admin)) {
      throw new Error("Unauthorized: Admin access required");
    }

    const reason = args.reason.trim();
    if (!reason) throw new Error("A reason is required for a manual adjustment");

    const delta = Math.round(args.delta * 100) / 100;
    if (!Number.isFinite(delta) || delta === 0) {
      throw new Error("delta must be a non-zero amount");
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const before = user.balance ?? 0;
    const after = Math.round((before + delta) * 100) / 100;
    if (after < 0) {
      throw new Error(
        `Adjustment would leave a negative balance (${before} + ${delta})`,
      );
    }

    await ctx.db.patch(args.userId, { balance: after });

    const transactionId = await ctx.db.insert("transactions", {
      userId: args.userId,
      amount: delta,
      type: delta > 0 ? "deposit" : "withdrawal",
      status: "completed",
      timestamp: Date.now(),
      paymentMethod: "cash",
      ref: `admin:${reason}`,
    });

    await ctx.db.insert("adminActions", {
      adminId,
      actionType: delta > 0 ? "manual_credit" : "manual_debit",
      details: `${args.userId} ${before} -> ${after} (${delta}) — ${reason}`,
      timestamp: Date.now(),
    });

    return { transactionId, before, after };
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

    const userId = usersIdFromIdentitySubject(identity.subject);
    const user = await ctx.db.get(userId);
    if (!user || !isAdminUser(user)) {
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

/** `/admin` gate: role admin or ADMIN_USER_IDS / ADMIN_EMAILS env allowlist. */
export const getAdminAccess = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { authenticated: false as const, allowed: false as const };
    }
    const userId = usersIdFromIdentitySubject(identity.subject);
    const user = await ctx.db.get(userId);
    return {
      authenticated: true as const,
      allowed: Boolean(user && isAdminUser(user)),
    };
  },
});

/**
 * The player's ledger, newest first.
 *
 * Bounded. This used to `.collect()` the whole history on every read, and every
 * one of those rows crossed the wire again each time a new one was written —
 * a subscription whose cost grew with how much the player had played, which is
 * exactly backwards. Twenty-five rows is a screenful; ask for more explicitly.
 */
export const getUserTransactions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject.split("|")[0] as Id<"users">;

    return await ctx.db
      .query("transactions")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(args.limit ?? 25, 100));
  },
});

/**
 * Balance plus identity, as one small document.
 *
 * `getCurrentUser` returns the whole `users` row, so any write to it — a payout
 * address being remembered, a phone number — pushes every field to every open
 * tab. The game header only wants the balance, and it wants it on every round.
 */
export const myBalance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const allowance = await withdrawableFor(ctx, userId);
    return {
      userId,
      name: user.name ?? null,
      email: user.email ?? null,
      balance: user.balance ?? 0,
      // Split out so the wallet can show what is cashable and what is winnings.
      withdrawalsPaused: withdrawalsPaused(),
      withdrawalPauseMessage: withdrawalsPaused() ? withdrawalPauseMessage() : null,
      withdrawable: allowance.withdrawable,
      lockedWinnings: allowance.locked,
      deposited: allowance.deposited,
      payoutAddress: user.payoutAddress ?? null,
      payoutPhone: user.payoutPhone ?? null,
    };
  },
});

export const getUserByIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/** Internal-only admin gate for actions in other modules (on-chain reads, etc.). */
export const internalIsAdminUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    return isAdminUser(user);
  },
});

export const getSgxApiConfigStatus = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUserId = identity.subject.split("|")[0] as Id<"users">;
    const currentUser = await ctx.db.get(currentUserId);
    if (!currentUser || !isAdminUser(currentUser)) {
      return null;
    }

    return {
      ecocashToCryptoUrl: getSgxV0EcocashToCryptoUrl(),
      cryptoToEcocashUrl: getSgxV0CryptoToEcocashUrl(),
      baseUrl: getSgxV0BaseUrl(),
      hasTreasuryTronPrivateKey: Boolean(
        process.env.PENNY_TREASURY_TRON_PRIVATE_KEY,
      ),
      hasTreasuryTronAddress: Boolean(process.env.PENNY_TREASURY_TRC20_ADDRESS),
      hasOnRampWalletBep20: Boolean(process.env.PENNY_ONRAMP_WALLET_BEP20),
      usesTestEndpoints: useSgxV0TestEndpoints(),
    };
  },
});

export const adminFundWalletViaEcocash = action({
  args: {
    payerPhone: v.string(),
    fiatAmount: v.number(),
    email: v.optional(v.string()),
    cryptoAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Not authenticated");

    const userId = usersIdFromIdentitySubject(identity.subject);
    const currentUser = await ctx.runQuery(internal.aurum.getUserByIdInternal, {
      userId,
    });
    if (!currentUser || !isAdminUser(currentUser)) {
      throw new Error(
        `Unauthorized: Admin access required (userId=${String(userId)} role=${String(currentUser?.role ?? "none")} email=${String(currentUser?.email ?? "none")})`,
      );
    }

    const walletAddress = process.env.PENNY_ONRAMP_WALLET_BEP20?.trim();
    if (!walletAddress) {
      throw new Error(
        "Set PENNY_ONRAMP_WALLET_BEP20 (BEP-20 USDT address for settlements) in Convex environment",
      );
    }

    const phoneNormalized = toZwEcocashLocalNineDigits(args.payerPhone);
    if (!isValidZwEcocashNineDigits(phoneNormalized)) {
      throw new Error(
        "Enter a valid Zimbabwe EcoCash number (e.g. 0771234567 or +263771234567). Pesepay needs 9 digits starting with 7.",
      );
    }
    const fiatAmount = Number(args.fiatAmount.toFixed(2));
    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
      throw new Error("fiatAmount must be greater than 0");
    }

    const payload: Record<string, string> = {
      walletAddress,
      payerPhone: phoneNormalized,
      fiatAmount: fiatAmount.toFixed(2),
    };
    const email = args.email?.trim();
    if (email) payload.email = email;
    if (args.cryptoAmount !== undefined) {
      const c = Number(Number(args.cryptoAmount).toFixed(6));
      if (Number.isFinite(c) && c >= 0) {
        payload.cryptoAmount = c.toFixed(6);
      }
    }

    const url = getSgxV0EcocashToCryptoUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const partnerBearer = process.env.SGX_V0_PARTNER_BEARER?.trim();
    if (partnerBearer) {
      headers.Authorization = `Bearer ${partnerBearer}`;
    }

    const controller = new AbortController();
    const timeoutMs = 120_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("abort") || msg === "The operation was aborted.") {
        throw new Error(
          `SGX ecocash-to-crypto timed out after ${timeoutMs / 1000}s — check ${url} and Convex→internet connectivity`,
        );
      }
      throw new Error(`SGX ecocash-to-crypto fetch failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ignore parse errors and keep raw text for support
    }
    if (!res.ok) {
      throw new Error(
        formatSgxPartnerApiError(
          "SGX ecocash-to-crypto",
          res.status,
          text,
          data,
        ),
      );
    }

    const referenceNumber =
      data.referenceNumber ??
      data.reference_number ??
      data.pesepayReference ??
      null;
    const orderId = data.orderId ?? data.order_id ?? null;

    if (
      referenceNumber == null ||
      referenceNumber === "" ||
      (typeof referenceNumber !== "string" && typeof referenceNumber !== "number")
    ) {
      throw new Error(
        `SGX returned HTTP ${res.status} but no referenceNumber — Pesepay may have rejected the session. First 600 chars: ${text.slice(0, 600)}`,
      );
    }

    const referenceNumberStr = String(referenceNumber);
    const orderIdStr = orderId != null ? String(orderId) : null;

    let partnerFlow = parseSgxPartnerFlow(data);
    const topInstruction =
      typeof data.instruction === "string" ? data.instruction : null;
    if (partnerFlow && topInstruction && !partnerFlow.instruction) {
      partnerFlow = { ...partnerFlow, instruction: topInstruction };
    }

    const hasSuccessFlag =
      data.ok === true ||
      data.success === true ||
      (typeof data.success === "string" && data.success === "true");

    return {
      ok: hasSuccessFlag || Boolean(referenceNumberStr),
      referenceNumber: referenceNumberStr,
      redirectUrl: data.redirectUrl ?? null,
      orderId: orderIdStr,
      partnerFlow,
      payerPhoneSent: phoneNormalized.replace(/\d(?=\d{4})/g, "*"),
      instruction: partnerFlow?.instruction ?? topInstruction ?? null,
      raw: data,
    };
  },
});

/** Poll `partnerFlow.statusUrl` once (admin-only). Client repeats every `pollEverySeconds`. */
export const pollEcocashOnRampStatus = action({
  args: { statusUrl: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) throw new Error("Not authenticated");

    const userId = usersIdFromIdentitySubject(identity.subject);
    const currentUser = await ctx.runQuery(internal.aurum.getUserByIdInternal, {
      userId,
    });
    if (!currentUser || !isAdminUser(currentUser)) {
      throw new Error("Unauthorized: Admin access required");
    }

    const safeUrl = assertSafeHttpsPartnerStatusUrl(args.statusUrl);
    const res = await fetch(safeUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // keep empty
    }

    return {
      httpOk: res.ok,
      httpStatus: res.status,
      terminal: data.terminal === true,
      status: typeof data.status === "string" ? data.status : null,
      found:
        data.found === true ? true : data.found === false ? false : null,
      raw: data,
    };
  },
});
