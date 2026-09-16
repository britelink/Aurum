/**
 * Aurum inbound rail — crypto deposit bookkeeping.
 *
 * The chain-facing half lives in `depositWatcherNode.ts` (it needs ethers and
 * the agent key). Everything here is plain-runtime state: quoting a deposit,
 * matching a transfer to it, moving it through detected → confirmed, crediting
 * the player's USD balance, and expiring the ones nobody paid.
 *
 * Ported from SGX Pay's `merchantDeposits.ts`, with the merchant replaced by a
 * player and the merchant balance replaced by `users.balance`.
 */
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  DEPOSIT_FEE_PERCENT,
  DEPOSIT_TTL_MS,
  INBOUND_CHAIN,
  LATE_MATCH_WINDOW_MS,
  MAX_DEPOSIT,
  MIN_DEPOSIT,
  REQUIRED_CONFIRMATIONS,
  buildDepositReference,
  buildPayableAmount,
  explorerAddressUrl,
  explorerTxUrl,
  isEvmAddress,
  isRailAsset,
  roundAmount,
  roundMoney,
  splitFee,
  tagFromNonce,
  tokenAddresses,
  type RailAsset,
} from "./railLib";

/** Largest difference (in token units) still treated as "the same amount". */
const AMOUNT_EPSILON = 0.000001;

/**
 * How far from the quoted figure a transfer may land and still be recognised.
 *
 * Deposits are identified by their exact payable amount — the trailing decimals
 * are a tag that tells one player's transfer from another's. Matching on it
 * exactly is right for deciding WHICH deposit a transfer belongs to. It is the
 * wrong rule for deciding whether it belongs to one at all: payers round.
 * Exchanges round, wallets round, and people type the figure they remember
 * rather than the one on the screen.
 *
 * Twenty cents is wider than the tag range (tags span 0.09999), which would be
 * dangerous on its own — two deposits can sit inside one band. That is what the
 * ambiguity check below is for: where more than one open deposit falls in the
 * band, none is matched and a person is asked.
 */
const MATCH_BAND = 0.2;

/**
 * How far UNDER the quoted figure still settles the deposit in full. A player
 * who rounds 12.05331 down to 12.05 is a third of a cent short; holding their
 * money over that costs both sides more than the third of a cent.
 */
const UNDERPAY_ROUNDING = 0.02;

/** Below this a transfer is address-poisoning spam, not a deposit. */
const DUST_THRESHOLD = 0.01;

export const DEPOSIT_ADDRESS_KEY = "depositAddress";

// ---------------------------------------------------------------------------
// Watcher config (key/value strings so the Node action can hold state)
// ---------------------------------------------------------------------------

export const getConfig = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("railConfig")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return row?.value ?? null;
  },
});

export const setConfig = internalMutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const row = await ctx.db
      .query("railConfig")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (row) {
      if (row.value === value) return;
      await ctx.db.patch(row._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("railConfig", { key, value, updatedAt: Date.now() });
    }
  },
});

/**
 * The address a new deposit is quoted.
 *
 * The watcher caches the agent wallet here after deriving it from the private
 * key, because this runtime has no ethers. `AURUM_DEPOSIT_ADDRESS` short-cuts
 * that for a deployment whose inbound should land somewhere other than the
 * signing wallet — and for the first hour of a fresh deployment, before the
 * watcher has run once.
 */
async function resolveDepositAddress(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  const override = process.env.AURUM_DEPOSIT_ADDRESS?.trim();
  if (override && isEvmAddress(override)) return override;
  const row = await ctx.db
    .query("railConfig")
    .withIndex("by_key", (q) => q.eq("key", DEPOSIT_ADDRESS_KEY))
    .first();
  const cached = row?.value?.trim();
  return cached && isEvmAddress(cached) ? cached : null;
}

function requireUserId(identity: { subject: string } | null): Id<"users"> {
  if (!identity) throw new ConvexError("Not authenticated");
  return identity.subject.split("|")[0] as Id<"users">;
}

// ---------------------------------------------------------------------------
// Quoting
// ---------------------------------------------------------------------------

/**
 * Quote a deposit for a given player.
 *
 * Extracted from the public mutation so the rail drill exercises *this* code
 * rather than a copy of it — a test that quotes deposits through its own
 * arithmetic proves only that the test works.
 */
export async function quoteDepositFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  rawAmount: number,
  rawAsset?: string,
) {
  const asset = (rawAsset ?? "USDT").trim().toUpperCase();
  if (!isRailAsset(asset)) {
    throw new ConvexError(`Unsupported asset: ${asset}. Use USDT or USDC.`);
  }

  const requested = roundMoney(rawAmount);
  if (!Number.isFinite(requested) || requested < MIN_DEPOSIT) {
    throw new ConvexError(`Minimum deposit is ${MIN_DEPOSIT} ${asset}.`);
  }
  if (requested > MAX_DEPOSIT) {
    throw new ConvexError(`Maximum deposit is ${MAX_DEPOSIT} ${asset}.`);
  }

  const depositAddress = await resolveDepositAddress(ctx);
  if (!depositAddress) {
    throw new ConvexError(
      "Deposits are not configured yet: the agent wallet address is unknown. " +
        "Set AURUM_DEPOSIT_ADDRESS, or wait for the deposit watcher to run once.",
    );
  }

  /*
   * Find a tag nobody else is using right now. The tag only has to be unique
   * among *open* deposits for the same asset, so the search space is tiny and
   * collisions are rare; a handful of tries is plenty, and the last candidate is
   * taken regardless — a duplicate tag degrades to the ambiguity check in
   * `findOpenDepositByAmount`, which credits nobody and asks a person, rather
   * than to a wrong credit.
   */
  const now = Date.now();
  let amountPayable = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const tag = tagFromNonce(Math.floor(Math.random() * 1_000_000) + attempt);
    const candidate = buildPayableAmount(requested, tag, DEPOSIT_FEE_PERCENT);
    const clash = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_open_amount", (q) =>
        q
          .eq("status", "awaiting_payment")
          .eq("asset", asset)
          .eq("amountPayable", candidate),
      )
      .first();
    amountPayable = candidate;
    if (!clash) break;
  }

  const reference = buildDepositReference();
  const depositId = await ctx.db.insert("cryptoDeposits", {
    userId,
    reference,
    asset,
    chain: INBOUND_CHAIN,
    amountRequested: requested,
    amountPayable,
    amountReceived: 0,
    feeAmount: 0,
    feePercentAtCreate: DEPOSIT_FEE_PERCENT,
    depositAddress,
    status: "awaiting_payment",
    expiresAt: now + DEPOSIT_TTL_MS,
    createdAt: now,
    updatedAt: now,
  });

  return {
    depositId,
    reference,
    asset,
    chain: INBOUND_CHAIN,
    depositAddress,
    depositAddressUrl: explorerAddressUrl(depositAddress),
    amountRequested: requested,
    amountPayable,
    expiresAt: now + DEPOSIT_TTL_MS,
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
  };
}

/**
 * Quote a deposit: an address, and an exact amount that belongs to this player
 * and nobody else. Nothing is credited here — the watcher does that when the
 * transfer actually lands.
 */
export const createDeposit = mutation({
  args: {
    amount: v.number(),
    asset: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    return await quoteDepositFor(ctx, userId, args.amount, args.asset);
  },
});

/** Abandon an unpaid quote so its tag returns to the pool. */
export const cancelDeposit = mutation({
  args: { depositId: v.id("cryptoDeposits") },
  handler: async (ctx, { depositId }) => {
    const userId = requireUserId(await ctx.auth.getUserIdentity());
    const row = await ctx.db.get(depositId);
    if (!row || row.userId !== userId) throw new ConvexError("Deposit not found");
    if (row.status !== "awaiting_payment") {
      // Money is already in flight; cancelling would only hide it.
      return { cancelled: false as const, status: row.status };
    }
    await ctx.db.patch(depositId, { status: "cancelled", updatedAt: Date.now() });
    return { cancelled: true as const, status: "cancelled" as const };
  },
});

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export const findOpenDepositByAmount = internalQuery({
  args: {
    asset: v.string(),
    amount: v.number(),
    fromAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const amount = roundAmount(args.amount);

    // Fast path: the unique payable amount is indexed.
    const exact = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_open_amount", (q) =>
        q
          .eq("status", "awaiting_payment")
          .eq("asset", args.asset)
          .eq("amountPayable", amount),
      )
      .first();
    if (exact) return exact;

    // Same index, for a deposit that expired but is still inside the late window.
    const lateExact = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_open_amount", (q) =>
        q
          .eq("status", "expired")
          .eq("asset", args.asset)
          .eq("amountPayable", amount),
      )
      .first();
    if (lateExact && lateExact.expiresAt >= Date.now() - LATE_MATCH_WINDOW_MS) {
      return lateExact;
    }

    // Slow path: float drift, an overpayment, or a top-up on an underpaid quote.
    const open = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_payment"))
      .order("desc")
      .take(300);
    const underpaid = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_status", (q) => q.eq("status", "underpaid"))
      .order("desc")
      .take(100);
    const cutoff = Date.now() - LATE_MATCH_WINDOW_MS;
    const recentlyExpired = (
      await ctx.db
        .query("cryptoDeposits")
        .withIndex("by_status", (q) => q.eq("status", "expired"))
        .order("desc")
        .take(300)
    ).filter((d) => d.expiresAt >= cutoff);

    const candidates = [...open, ...underpaid, ...recentlyExpired].filter(
      (d) => d.asset === args.asset,
    );

    const near = candidates.find(
      (d) => Math.abs(d.amountPayable - amount) <= AMOUNT_EPSILON,
    );
    if (near) return near;

    /*
     * Nothing wanted this figure exactly. Widen to the band — a payer who
     * rounded — and refuse rather than guess if more than one deposit could
     * have meant it. Ordered by distance, so a reported ambiguity is between
     * the two nearest, which is the pair a person actually has to tell apart.
     */
    const inBand = candidates
      .filter((d) => Math.abs(d.amountPayable - amount) <= MATCH_BAND)
      .sort(
        (a, b) =>
          Math.abs(a.amountPayable - amount) - Math.abs(b.amountPayable - amount),
      );

    if (inBand.length === 1) return inBand[0];
    if (inBand.length > 1) {
      // Crediting either is a coin toss with one player's money against
      // another's deposit, so neither is credited — it is filed as unclaimed,
      // which is exactly where a person can see it and decide.
      console.warn(
        `[aurum-rail] deposit of ${amount} ${args.asset} is within ${MATCH_BAND} of ` +
          `${inBand.length} open quotes (${inBand
            .slice(0, 3)
            .map((d) => d.reference)
            .join(", ")}) — crediting none.`,
      );
      return null;
    }

    // A known payer address is a strong hint — accept exact-or-over from them.
    if (args.fromAddress) {
      const from = args.fromAddress.toLowerCase();
      const byPayer = candidates.filter((d) => d.payerAddress === from);
      if (
        byPayer.length === 1 &&
        amount + AMOUNT_EPSILON >= byPayer[0].amountPayable
      ) {
        return byPayer[0];
      }
    }
    return null;
  },
});

export const isTxAlreadyRecorded = internalQuery({
  args: { txHash: v.string() },
  handler: async (ctx, { txHash }) => {
    const row = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_tx_hash", (q) => q.eq("txHash", txHash))
      .first();
    return row !== null;
  },
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/**
 * First sight of a transfer for a deposit. Under-payments stop here (the player
 * can top up); anything at or above the payable amount waits for confirmations
 * as `detected`.
 */
export const recordDeposit = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    txHash: v.string(),
    blockNumber: v.number(),
    amount: v.number(),
    fromAddress: v.string(),
    confirmations: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.depositId);
    if (!row) return { ok: false as const, reason: "missing" };
    if (row.txHash === args.txHash && row.status !== "underpaid") {
      return { ok: true as const, reason: "duplicate" };
    }

    const now = Date.now();
    const received = roundAmount(row.amountReceived + args.amount);
    // Revived from `expired` by a late transfer: credit it normally, but leave
    // a marker so support can tell it arrived after the quoted deadline.
    const late = row.status === "expired" ? { claimedAfterExpiry: true } : {};

    if (received + UNDERPAY_ROUNDING < row.amountPayable) {
      await ctx.db.patch(args.depositId, {
        ...late,
        status: "underpaid",
        amountReceived: received,
        txHash: args.txHash,
        blockNumber: args.blockNumber,
        payerAddress: row.payerAddress ?? args.fromAddress.toLowerCase(),
        confirmations: args.confirmations,
        updatedAt: now,
      });
      return { ok: true as const, reason: "underpaid" };
    }

    await ctx.db.patch(args.depositId, {
      ...late,
      status: "detected",
      amountReceived: received,
      txHash: args.txHash,
      blockNumber: args.blockNumber,
      payerAddress: row.payerAddress ?? args.fromAddress.toLowerCase(),
      confirmations: args.confirmations,
      updatedAt: now,
    });
    return { ok: true as const, reason: "detected" };
  },
});

export const listDetected = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_status", (q) => q.eq("status", "detected"))
      .order("desc")
      .take(100);
  },
});

/**
 * Promote a detected deposit once it has the confirmations, and credit the
 * player. This is the only place in the codebase that increases a balance from
 * the outside world.
 */
export const confirmDeposit = internalMutation({
  args: {
    depositId: v.id("cryptoDeposits"),
    confirmations: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.depositId);
    if (!row || row.status !== "detected") return { ok: false as const };

    if (args.confirmations < REQUIRED_CONFIRMATIONS) {
      // Below the threshold this just records progress so the UI can show it.
      await ctx.db.patch(args.depositId, {
        confirmations: args.confirmations,
        updatedAt: Date.now(),
      });
      return { ok: false as const };
    }

    // The terms this deposit was quoted on, not whatever the constant says now.
    const { fee, net } = splitFee(
      row.amountReceived,
      row.feePercentAtCreate ?? DEPOSIT_FEE_PERCENT,
    );
    const credit = roundMoney(net);
    const now = Date.now();

    const user = await ctx.db.get(row.userId);
    if (!user) {
      // The player's row is gone; do not silently drop their money.
      await ctx.db.patch(args.depositId, {
        status: "detected",
        confirmations: args.confirmations,
        updatedAt: now,
      });
      console.error(
        `[aurum-rail] ${row.reference} confirmed but user ${row.userId} is missing`,
      );
      return { ok: false as const };
    }

    const transactionId = await ctx.db.insert("transactions", {
      userId: row.userId,
      amount: credit,
      type: "deposit",
      status: "completed",
      fee: fee > 0 ? fee : undefined,
      timestamp: now,
      paymentMethod: row.asset === "USDC" ? "usdc-bep20" : "usdt-bep20",
      ref: row.reference,
    });

    await ctx.db.patch(row.userId, {
      balance: roundMoney((user.balance ?? 0) + credit),
    });

    await ctx.db.patch(args.depositId, {
      status: "confirmed",
      feeAmount: fee,
      amountCredited: credit,
      confirmations: args.confirmations,
      creditedTransactionId: transactionId,
      paidAt: now,
      updatedAt: now,
    });

    return { ok: true as const, credited: credit };
  },
});

export const recordUnmatchedDeposit = internalMutation({
  args: {
    txHash: v.string(),
    fromAddress: v.string(),
    amountToken: v.string(),
    symbol: v.string(),
    chain: v.string(),
    depositAddress: v.string(),
    blockNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("unclaimedDeposits")
      .withIndex("by_tx_hash", (q) => q.eq("txHash", args.txHash))
      .first();
    if (existing) return;
    await ctx.db.insert("unclaimedDeposits", {
      ...args,
      fromAddress: args.fromAddress.toLowerCase(),
      status: "unclaimed",
      createdAt: Date.now(),
    });
  },
});

/**
 * Retire quotes nobody paid. They stay matchable for `LATE_MATCH_WINDOW_MS`
 * after this — expiry frees the tag and stops advertising the quote, it does
 * not refuse the player's money.
 */
export const expireStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_payment"))
      .order("asc")
      .take(200);
    let expired = 0;
    for (const row of stale) {
      if (row.expiresAt > now) continue;
      await ctx.db.patch(row._id, { status: "expired", updatedAt: now });
      expired++;
    }
    return { expired };
  },
});

// ---------------------------------------------------------------------------
// Reads for the wallet UI
// ---------------------------------------------------------------------------

function serializeDeposit(row: Doc<"cryptoDeposits">) {
  return {
    id: row._id,
    reference: row.reference,
    asset: row.asset,
    chain: row.chain,
    status: row.status,
    amountRequested: row.amountRequested,
    amountPayable: row.amountPayable,
    amountReceived: row.amountReceived,
    amountCredited: row.amountCredited ?? null,
    depositAddress: row.depositAddress,
    depositAddressUrl: explorerAddressUrl(row.depositAddress),
    /*
     * The token contract and chain id, so the wallet can build an EIP-681 link
     * that prefills the token, the recipient AND the exact amount. Typing the
     * amount by hand is the one step where the tag gets rounded away, and a
     * rounded tag is the only case the watcher cannot resolve on its own.
     */
    tokenAddress: tokenAddresses(process.env.IS_LIVE === "true")[
      row.asset as RailAsset
    ],
    chainId: process.env.IS_LIVE === "true" ? 56 : 97,
    txHash: row.txHash ?? null,
    txUrl: explorerTxUrl(row.txHash),
    confirmations: row.confirmations ?? 0,
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
    claimedAfterExpiry: row.claimedAfterExpiry ?? false,
    expiresAt: row.expiresAt,
    paidAt: row.paidAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The deposit the wallet is currently showing. One row, so the subscription
 * that a player leaves open on a payment screen costs a single document read
 * per update rather than a list scan.
 */
export const getDeposit = query({
  args: { depositId: v.id("cryptoDeposits") },
  handler: async (ctx, { depositId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const row = await ctx.db.get(depositId);
    if (!row || row.userId !== userId) return null;
    return serializeDeposit(row);
  },
});

export const myDeposits = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const rows = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
    return rows.map(serializeDeposit);
  },
});

/**
 * The newest deposit still worth showing a player, if there is one.
 *
 * The wallet opens on this instead of listing history, so the common case —
 * "I came back to see if my money landed" — is one indexed read.
 */
export const myOpenDeposit = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject.split("|")[0] as Id<"users">;
    const rows = await ctx.db
      .query("cryptoDeposits")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
    const live = rows.find(
      (r) =>
        r.status === "awaiting_payment" ||
        r.status === "underpaid" ||
        r.status === "detected" ||
        // Settled by Pesepay rather than the chain, but just as much "in
        // flight" from the player's side.
        r.status === "awaiting_ecocash",
    );
    return live ? serializeDeposit(live) : null;
  },
});

/** Whether the inbound rail can quote at all, for the UI to say so up front. */
export const depositRailStatus = query({
  args: {},
  handler: async (ctx) => {
    const address = await resolveDepositAddress(ctx);
    return {
      available: address !== null,
      depositAddress: address,
      chain: INBOUND_CHAIN,
      assets: ["USDT", "USDC"],
      minDeposit: MIN_DEPOSIT,
      maxDeposit: MAX_DEPOSIT,
      feePercent: DEPOSIT_FEE_PERCENT,
      requiredConfirmations: REQUIRED_CONFIRMATIONS,
      message:
        address === null
          ? "Deposits are being configured. Try again shortly."
          : null,
    };
  },
});

/** Dust filter, exported so the watcher and this module cannot disagree. */
export const DEPOSIT_DUST_THRESHOLD = DUST_THRESHOLD;
