import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Aurum (Penny) — gaming platform on the SGX/Chessa money rails.
 *
 * Money only ever enters as crypto (USDT/USDC on BNB Smart Chain) and only ever
 * leaves as crypto or as EcoCash routed through Chessa. There is no fiat
 * in-bound: the card/Zimswitch/EcoCash deposit providers never worked, so the
 * deposit side is the on-chain watcher alone and the payout side is the agent
 * wallet plus Chessa's off-ramp.
 *
 * `users.balance` is the custodial USD ledger. Everything here exists to move a
 * number into it (deposits), around it (the game) or out of it (payouts), and
 * every one of those paths is idempotent because they all end at a real
 * transfer somebody can lose.
 */
export default defineSchema({
  ...authTables,

  system: defineTable({
    name: v.string(),
    status: v.string(),
    lastRun: v.number(),
  }).index("by_name", ["name"]),

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    balance: v.optional(v.number()), // custodial USD ledger
    walletBalance: v.optional(v.number()), // in-game currency balance
    ecoUsdAddress: v.optional(v.string()),
    /** Last payout address the player used, so the withdraw form can prefill. */
    payoutAddress: v.optional(v.string()),
    /** Last EcoCash number used, E.164. */
    payoutPhone: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("player"), v.literal("admin"), v.literal("agent")),
    ),
    referralCode: v.optional(v.string()),
  }).index("email", ["email"]),

  // ---------------------------------------------------------------------
  // Game
  // ---------------------------------------------------------------------

  /**
   * A round. `seed` makes the price curve deterministic: every client draws the
   * same chart from (seed, startTime) without the server writing a tick to the
   * database. The old build wrote nothing either, but it also showed everyone a
   * different random walk, so no two players were watching the same game.
   */
  sessions: defineTable({
    startTime: v.number(),
    endTime: v.number(),
    processingEndTime: v.number(),
    neutralAxis: v.number(),
    seed: v.optional(v.number()),
    totalBuyVolume: v.number(),
    totalSellVolume: v.number(),
    /** Bet counts, so the UI can show the book without reading every bet. */
    buyCount: v.optional(v.number()),
    sellCount: v.optional(v.number()),
    finalPrice: v.optional(v.number()),
    status: v.union(
      v.literal("open"),
      v.literal("processing"),
      v.literal("closed"),
      v.literal("pending"),
    ),
    winner: v.optional(
      v.union(v.literal("buyers"), v.literal("sellers"), v.literal("neutral")),
    ),
    /** House cut taken on this round, in USD. */
    houseFee: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_start", ["startTime"]),

  bets: defineTable({
    userId: v.id("users"),
    sessionId: v.id("sessions"),
    amount: v.union(v.literal(1), v.literal(2)),
    direction: v.union(v.literal("up"), v.literal("down")),
    status: v.union(v.literal("pending"), v.literal("won"), v.literal("lost")),
    payout: v.optional(v.number()),
    sessionOutcome: v.optional(
      v.union(v.literal("won"), v.literal("lost"), v.literal("void")),
    ),
  })
    .index("by_session", ["sessionId"])
    // One read to answer "what has this player staked this round", instead of
    // pulling the whole round's book into every browser.
    .index("by_session_user", ["sessionId", "userId"])
    .index("by_user", ["userId"]),

  transactions: defineTable({
    userId: v.id("users"),
    amount: v.number(),
    type: v.union(
      v.literal("deposit"),
      v.literal("withdrawal"),
      v.literal("win"),
      v.literal("loss"),
      v.literal("fee"),
      v.literal("stake"),
      v.literal("refund"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    fee: v.optional(v.number()),
    timestamp: v.number(),
    paymentMethod: v.union(
      v.literal("eco-usd"),
      v.literal("cash"),
      v.literal("card-usd"),
      v.literal("zimswitch-usd"),
      v.literal("zimswitch-zwg"),
      v.literal("ecocash-usd"),
      v.literal("ecocash-zwg"),
      // Live rails.
      v.literal("usdt-bep20"),
      v.literal("usdc-bep20"),
      v.literal("game"),
    ),
    /** Free-form pointer back to the deposit/payout that caused this row. */
    ref: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_time", ["userId", "timestamp"]),

  leaderboard: defineTable({
    userId: v.id("users"),
    totalWins: v.number(),
    totalLosses: v.number(),
    totalPayout: v.number(),
  }).index("by_wins", ["totalWins"]),

  referralRewards: defineTable({
    referrerId: v.id("users"),
    referredId: v.id("users"),
    rewardAmount: v.number(),
    timestamp: v.number(),
  }).index("by_referrer", ["referrerId"]),

  adminActions: defineTable({
    adminId: v.id("users"),
    actionType: v.string(),
    details: v.string(),
    timestamp: v.number(),
  }).index("by_admin", ["adminId"]),

  // ---------------------------------------------------------------------
  // Inbound rail — crypto deposits (the SGX Pay engine, ported)
  // ---------------------------------------------------------------------

  /**
   * One intent to deposit. Every player's funds land in the same agent wallet,
   * so each open deposit is quoted a **unique payable amount**: what the player
   * asked for plus a five-decimal tag. A transfer carrying that exact figure
   * identifies exactly one deposit, which is what lets a single shared address
   * serve every player without per-user wallets or per-user gas.
   */
  cryptoDeposits: defineTable({
    userId: v.id("users"),
    reference: v.string(), // "aurd_…" — public handle
    asset: v.string(), // "USDT" | "USDC"
    chain: v.string(), // "BNB Smart Chain (BEP20)"
    /** What the player said they would send. */
    amountRequested: v.number(),
    /** What they must actually send — requested + tag. Inbound fee is zero. */
    amountPayable: v.number(),
    amountReceived: v.number(),
    /** Credited to the USD balance. Equals received while the inbound fee is 0. */
    amountCredited: v.optional(v.number()),
    feeAmount: v.number(),
    /** Fee terms as they stood when this deposit was quoted. */
    feePercentAtCreate: v.optional(v.number()),
    depositAddress: v.string(),
    payerAddress: v.optional(v.string()),
    status: v.string(), // awaiting_payment | detected | confirmed | underpaid | expired | cancelled
    txHash: v.optional(v.string()),
    blockNumber: v.optional(v.number()),
    confirmations: v.optional(v.number()),
    /** Set when a transfer arrived after `expiresAt` but inside the late window. */
    claimedAfterExpiry: v.optional(v.boolean()),
    creditedTransactionId: v.optional(v.id("transactions")),
    /**
     * Set when the player bought this deposit with EcoCash instead of sending
     * crypto themselves. The on-ramp delivers the tagged payable amount to the
     * agent wallet, so the ordinary watcher credits it — there is no second
     * crediting path, which is the whole point of routing it this way.
     */
    onrampProvider: v.optional(v.string()), // "chessa_ecocash"
    onrampReference: v.optional(v.string()), // Pesepay reference the payer sees
    onrampOrderId: v.optional(v.string()),
    onrampFiatAmount: v.optional(v.number()),
    onrampPhone: v.optional(v.string()),
    onrampStatus: v.optional(v.string()), // initiated | failed
    onrampError: v.optional(v.string()),
    /**
     * The provider's own response, as JSON, kept verbatim.
     *
     * Pesepay sees a stream of EcoCash collections arriving against Chessa's
     * merchant account with no indication that they belong to Penny Game. When
     * they ask -- and they will -- the answer has to be a record tying their
     * reference to our player, our amount and our timestamp. Reconstructing
     * that afterwards from three systems is the kind of task that gets answered
     * with "we think so".
     *
     * Stored as a string rather than a shaped object on purpose: it is
     * evidence, and normalising evidence into fields we happen to care about
     * today is how the field that settles the dispute gets dropped.
     */
    onrampRaw: v.optional(v.string()),
    /** When the prompt was pushed, for matching against the provider's clock. */
    onrampInitiatedAt: v.optional(v.number()),
    /**
     * The conversion actually used, recorded per deposit.
     *
     * A dollar is not a USDT. Chessa quotes ~0.9975 USD per USDT, so $3 buys
     * 3.007519 USDT — and releasing a flat 3 against a $3 deposit quietly
     * under-funds the float by a quarter of a percent every time. The rate
     * moves, so the figure that was used is stored rather than recomputed
     * later from a rate that has since changed.
     */
    usdtReleased: v.optional(v.number()),
    rateUsdPerUsdt: v.optional(v.number()),
    expiresAt: v.number(),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_tx_hash", ["txHash"])
    // Watcher lookup: open deposits for one asset, matched on payable amount.
    .index("by_open_amount", ["status", "asset", "amountPayable"]),

  /** Transfers that reached the agent wallet and matched no open deposit. */
  unclaimedDeposits: defineTable({
    txHash: v.string(),
    fromAddress: v.string(),
    amountToken: v.string(),
    symbol: v.string(),
    chain: v.string(),
    depositAddress: v.string(),
    blockNumber: v.number(),
    status: v.string(), // "unclaimed" | "claimed"
    claimedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_tx_hash", ["txHash"])
    .index("by_from_address", ["fromAddress"])
    .index("by_status", ["status"]),

  /** Watcher cursor and cached addresses. Strings, so a Node action can hold state. */
  railConfig: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ---------------------------------------------------------------------
  // Outbound rail — crypto payouts from the agent wallet
  // ---------------------------------------------------------------------

  cryptoPayouts: defineTable({
    userId: v.id("users"),
    transactionId: v.id("transactions"),
    idempotencyKey: v.string(),
    /** The player's own wallet. */
    toAddress: v.string(),
    asset: v.string(),
    chain: v.string(),
    /** Debited from the balance, gross. */
    amountUsd: v.number(),
    /** Withdrawal fee kept by the house. */
    feeUsd: v.number(),
    /** Tokens actually sent = amountUsd - feeUsd. */
    amountToken: v.number(),
    status: v.string(), // queued | sending | sent | failed
    txHash: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_status", ["status"]),

  // ---------------------------------------------------------------------
  // Outbound rail — EcoCash, routed through Chessa
  // ---------------------------------------------------------------------

  ecocashPayouts: defineTable({
    userId: v.id("users"),
    transactionId: v.id("transactions"),
    idempotencyKey: v.string(),
    ecocashPhone: v.string(), // E.164 e.g. +263771234567
    /**
     * The name EcoCash returned for this number, captured at quote time.
     *
     * Not something the player types. Chessa's name-enquiry is authoritative and
     * `v0public.cryptoToEcocash` overwrites any name we send with the real one,
     * so a typed name never reached the payout -- it was decoration on a form.
     * This is the name the player was actually shown and confirmed.
     */
    recipientName: v.optional(v.string()),
    /** Legacy: split name from the old form. Kept for rows written before the check. */
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    /** Debited from the balance, gross (fee included). */
    amountUsd: v.number(),
    /** Withdrawal fee kept by the house. Absent on rows written before fees. */
    feeUsd: v.optional(v.number()),
    /** USD the recipient should actually receive = amountUsd - feeUsd. */
    netUsd: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("sgx_submitted"),
      v.literal("ecocash_paid"),
      v.literal("failed"),
    ),
    sgxError: v.optional(v.string()),
    sgxOrderId: v.optional(v.string()),
    /** Chessa v0 (crypto-to-ecocash) — returned after the quote. */
    sgxPaymentAddress: v.optional(v.string()),
    sgxNetwork: v.optional(v.string()),
    sgxSendAmount: v.optional(v.number()),
    sgxSendCurrency: v.optional(v.string()),
    sgxReceiveAmount: v.optional(v.number()),
    sgxReceiveCurrency: v.optional(v.string()),
    sgxFee: v.optional(v.number()),
    chessaOrderId: v.optional(v.string()),
    chessaShortId: v.optional(v.string()),
    /** Agent-wallet tx funding Chessa's deposit address (audit, not the player's). */
    tronFloatTxid: v.optional(v.string()),
    /**
     * Where the order actually ended up at Chessa, read back after the fact.
     *
     * A payout we marked failed is our side of the story; the order may still
     * be sitting there `awaiting_payment` until it expires, or -- if we funded
     * it short -- `underpaid`, which is money stopped between two companies and
     * needs somebody to move it.
     */
    chessaOrderStatus: v.optional(v.string()),
    chessaCheckedAt: v.optional(v.number()),
    /** Set once a refund of our funding leg has been asked for. */
    refundRequestedAt: v.optional(v.number()),
    refundReference: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_transaction", ["transactionId"]),
});
