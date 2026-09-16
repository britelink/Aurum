"use node";

/**
 * Penny → Chessa off-ramp without HTTP calls to sgxremit.com.
 * Invokes Chessa Convex `v0public.cryptoToEcocash` (same path as Chessa’s own UI / Next bridge).
 */
import { action, internalAction } from "./_generated/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeE164Zimbabwe } from "./railLib";

type ChessaCryptoToEcocashResult = {
  success: true;
  convexOrderId: string;
  chessaOrderId: string;
  chessaShortId: string;
  paymentAddress: string | null;
  network: string | null;
  sendAmount: number;
  sendCurrency: string;
  receiveAmount: number;
  receiveCurrency: string;
  fee: number;
};

const cryptoToEcocashRef = makeFunctionReference<
  "action",
  {
    internalSecret: string;
    firstName: string;
    lastName: string;
    phone: string;
    intendedUsdAmount: number;
    originAsset: string;
    chain: string;
    clientReference?: string;
  },
  ChessaCryptoToEcocashResult
>("v0public:cryptoToEcocash");

export function getChessaConvexUrl(): string {
  const url =
    process.env.CHESSA_CONVEX_URL?.trim() ||
    process.env.SGX_CONVEX_URL?.trim();
  if (!url) {
    throw new Error(
      "Set CHESSA_CONVEX_URL on Penny Convex to Chessa’s deployment URL (same as Chessa NEXT_PUBLIC_CONVEX_URL).",
    );
  }
  return url;
}

export function getChessaV0InternalSecret(): string {
  const secret =
    process.env.CHESSA_V0_INTERNAL_SECRET?.trim() ||
    process.env.SGX_V0_INTERNAL_ACTION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Set CHESSA_V0_INTERNAL_SECRET on Penny Convex (must match Chessa V0_API_INTERNAL_SECRET).",
    );
  }
  return secret;
}

export async function invokeChessaCryptoToEcocash(args: {
  firstName: string;
  lastName: string;
  phone: string;
  intendedUsdAmount: number;
  clientReference?: string;
  originAsset?: string;
  chain?: string;
}): Promise<ChessaCryptoToEcocashResult> {
  const client = new ConvexHttpClient(getChessaConvexUrl());
  const originAsset = args.originAsset?.trim() || "USDT";
  const chain =
    args.chain?.trim() ||
    process.env.PENNY_WITHDRAW_CHAIN?.trim() ||
    "BNB Smart Chain (BEP20)";

  return await client.action(cryptoToEcocashRef, {
    internalSecret: getChessaV0InternalSecret(),
    firstName: args.firstName,
    lastName: args.lastName,
    phone: args.phone,
    intendedUsdAmount: args.intendedUsdAmount,
    originAsset,
    chain,
    clientReference: args.clientReference,
  });
}

/**
 * Ask Chessa who owns an EcoCash number.
 *
 * `chessa:validateRecipient` hits the provider's name-enquiry and returns the
 * **real** account name. That makes asking the player to type their own name
 * pointless theatre: whatever they type is discarded — `v0public.cryptoToEcocash`
 * overwrites it with `actualAccountName` before the order is created — so a
 * typed name could never have prevented a misdirected payout, it only looked
 * like it could.
 *
 * What does prevent one is showing them the name the network returns *before*
 * they commit. A wrong digit stops being an invisible mistake and becomes an
 * unfamiliar name on the confirmation screen.
 *
 * Public, and deliberately harmless: it writes nothing, moves nothing, and
 * returns only a name the caller already has the number for.
 */
export const validateEcocashRecipient = action({
  args: { phone: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    validated: boolean;
    name: string | null;
    phone: string;
    error: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // Chessa's own formatter wants E.164; it prepends the dialling code only
    // when the number does not already carry one, so sending +263… straight
    // through is the unambiguous form.
    const phone = normalizeE164Zimbabwe(args.phone);
    if (!/^\+263[0-9]{9}$/.test(phone)) {
      return {
        validated: false,
        name: null,
        phone,
        error: "Enter a Zimbabwean mobile number, e.g. 0771234567.",
      };
    }

    try {
      const client = new ConvexHttpClient(getChessaConvexUrl());
      const validateRef = makeFunctionReference<
        "action",
        {
          phone: string;
          country: string;
          providerCode: string;
          payoutMethod: string;
        },
        { validated: boolean; name: string | null; error?: string }
      >("chessa:validateRecipient");

      const res = await client.action(validateRef, {
        phone,
        country: "ZW",
        providerCode: "zw_ecocash",
        payoutMethod: "mobile_money",
      });

      if (!res?.validated || !res.name) {
        return {
          validated: false,
          name: null,
          phone,
          error:
            "EcoCash did not recognise that number. Check the digits and try again.",
        };
      }
      return { validated: true, name: res.name, phone, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        validated: false,
        name: null,
        phone,
        error: `Could not reach EcoCash to check that number: ${msg}`,
      };
    }
  },
});

export const ECOCASH_LIMITS_KEY = "chessaEcocashLimits";

/**
 * Read Chessa's live Zimbabwe limits and cache them.
 *
 * The floor was a constant here, and a constant is a copy of somebody else's
 * number that starts going stale the moment it is written. Chessa publishes it
 * in their config (`limits: { min, max }` on the ZW route) and enforces it on
 * the amount the recipient receives — so the honest thing is to read it and
 * follow it, and keep the constant only as the answer when they cannot be
 * reached.
 *
 * Cached rather than fetched per quote: the withdraw form prices on every
 * keystroke, and a quote is a query, which cannot make a network call at all.
 */
export const refreshEcocashLimits = internalAction({
  args: {},
  handler: async (ctx): Promise<{ min: number; max: number } | null> => {
    try {
      const client = new ConvexHttpClient(getChessaConvexUrl());
      const configRef = makeFunctionReference<
        "action",
        Record<string, never>,
        { payouts?: Array<Record<string, unknown>> }
      >("chessa:getConfig");
      const cfg = await client.action(configRef, {});

      const routes = Array.isArray(cfg?.payouts) ? cfg.payouts : [];
      const zw = routes.find((r) => {
        const country = r?.country as { code?: string } | undefined;
        return String(country?.code ?? "").toUpperCase() === "ZW";
      });
      const limits = zw?.limits as { min?: number; max?: number } | undefined;
      const min = Number(limits?.min);
      const max = Number(limits?.max);
      if (!Number.isFinite(min) || min <= 0) return null;

      await ctx.runMutation(internal.deposits.setConfig, {
        key: ECOCASH_LIMITS_KEY,
        value: JSON.stringify({
          min,
          max: Number.isFinite(max) && max > 0 ? max : 10000,
          at: Date.now(),
        }),
      });
      return { min, max };
    } catch (e) {
      // A stale cached limit beats no limit; leave whatever is there.
      console.warn(
        "[aurum-rail] could not refresh Chessa EcoCash limits:",
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  },
});

/** Create Chessa remit order + payment address, then auto-fund from Penny treasury. */
export const runCryptoToEcocashForPayout = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p || p.status !== "queued") return;

    try {
      // `netUsd` is what the recipient was quoted: the gross left the player's
      // balance, the fee stayed with the house, and Chessa is only ever asked
      // to deliver the difference. Rows written before withdrawal fees existed
      // have no `netUsd`, and for those the gross *is* the net.
      const deliverUsd = p.netUsd ?? p.amountUsd;
      /*
       * The name is Chessa's to decide, not ours.
       *
       * `v0public.cryptoToEcocash` runs its own name-enquiry and replaces
       * whatever we send with the account's real name, so these two fields are
       * a required argument whose value is discarded. They are filled from the
       * name the player was shown and confirmed at quote time; rows predating
       * that check fall back to their old split-name fields.
       */
      const shown = (p.recipientName ?? "").trim();
      const shownParts = shown ? shown.split(/\s+/) : [];
      const firstName = shownParts[0] || p.firstName || "Player";
      const lastName = shownParts.slice(1).join(" ") || p.lastName || "User";

      const out = await invokeChessaCryptoToEcocash({
        firstName,
        lastName,
        // E.164. Chessa's formatter passes a number that already carries a
        // dialling code straight through, so this is the unambiguous form.
        phone: p.ecocashPhone,
        intendedUsdAmount: deliverUsd,
        clientReference: p.idempotencyKey,
        originAsset: process.env.PENNY_WITHDRAW_ORIGIN_ASSET?.trim() || "USDT",
        chain:
          process.env.PENNY_WITHDRAW_CHAIN?.trim() ||
          "BNB Smart Chain (BEP20)",
      });

      const orderId = out.chessaOrderId || out.convexOrderId;
      if (!orderId) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "Chessa off-ramp response missing order id",
        });
        return;
      }

      const paymentAddress = out.paymentAddress?.trim() ?? "";
      const sendAmount = out.sendAmount;
      if (!paymentAddress) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "Chessa off-ramp response missing paymentAddress",
        });
        return;
      }
      if (!Number.isFinite(sendAmount) || sendAmount <= 0) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error: "Chessa off-ramp response missing or invalid sendAmount",
        });
        return;
      }

      /*
       * Refuse an address on a chain we cannot pay from.
       *
       * We ask Chessa for BNB Smart Chain because that is where the float is.
       * When it answers with a Tron address anyway, the funding step routes to
       * the Tron signer — and that account has never been activated, so the
       * send dies with "Contract validate error : account [T…] does not exist".
       * A real player saw that sentence.
       *
       * The address itself is unambiguous: BEP-20 is `0x` + 40 hex, Tron is
       * base58 starting `T`. Checking it here stops the payout while it is
       * still only a database row, and the refund puts the money back where the
       * player left it — instead of failing later with a chain error that
       * reads like the platform is broken.
       */
      const wantsBep20 = (
        process.env.PENNY_WITHDRAW_CHAIN?.trim() || "BNB Smart Chain (BEP20)"
      )
        .toLowerCase()
        .match(/bep|bnb|bsc|smart chain/);
      const gotEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(paymentAddress);

      if (wantsBep20 && !gotEvmAddress) {
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error:
            `Chessa quoted a ${out.network ?? "non-BSC"} address (${paymentAddress.slice(0, 8)}…) ` +
            "but this platform settles on BNB Smart Chain. Nothing was sent and your balance is unchanged.",
        });
        console.error(
          `[aurum-rail] payout ${payoutId}: asked for BSC, Chessa returned ` +
            `network=${out.network} address=${paymentAddress}. Check PENNY_WITHDRAW_CHAIN ` +
            "is reaching Chessa, or enable a Tron float.",
        );
        return;
      }

      /*
       * Never fund an order that costs more than the player paid for it.
       *
       * Chessa charges its own service fee on top of the rate, and it is
       * charged in the asset we send: a $2.00 EcoCash payout has been quoted at
       * **3.01 USDT** on this account. The player's balance was debited $2.05.
       * Funding that order would move 3.01 USDT out of the agent wallet against
       * a $2.05 claim — and the agent wallet is one pool holding every player's
       * deposits, so the extra ~1 USDT is somebody else's money. Do it a few
       * times and the pool no longer covers what it owes.
       *
       * So the order is checked against the debit before a token moves. Over
       * budget means nothing is sent, the payout fails, and the player is
       * refunded in full — they are told the real cost and can decide, which is
       * the only honest place to put that decision.
       *
       * `AURUM_PAYOUT_SPREAD_TOLERANCE_USD` lets the house knowingly absorb a
       * small quote drift. It defaults to zero, because absorbing a cost you
       * have not measured is how a float disappears quietly.
       */
      const debited = p.amountUsd;
      const tolerance = Number(
        process.env.AURUM_PAYOUT_SPREAD_TOLERANCE_USD?.trim() || "0",
      );
      const budget = debited + (Number.isFinite(tolerance) ? tolerance : 0);

      if (sendAmount > budget + 1e-9) {
        const shortfall = Math.round((sendAmount - debited) * 100) / 100;
        console.error(
          `[aurum-rail] payout ${payoutId}: Chessa wants ${sendAmount} USDT to deliver ` +
            `$${deliverUsd}, but only $${debited} was debited. Refusing to fund a ` +
            `${shortfall} USDT shortfall from the shared float.`,
        );
        await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
          payoutId,
          error:
            `EcoCash costs more than this withdrawal covers right now — ` +
            `$${sendAmount.toFixed(2)} is needed to deliver $${deliverUsd.toFixed(2)}. ` +
            `Your balance is unchanged. Withdraw about $${(sendAmount + 0.05).toFixed(2)} to cover it, or take it out as crypto.`,
        });
        return;
      }

      await ctx.runMutation(internal.withdrawals.markPayoutSgxSuccess, {
        payoutId,
        sgxOrderId: orderId,
        sgxV0: {
          paymentAddress,
          network: out.network ?? "Tron",
          sendAmount,
          sendCurrency: out.sendCurrency,
          receiveAmount: out.receiveAmount,
          receiveCurrency: out.receiveCurrency,
          fee: out.fee,
          chessaOrderId: out.chessaOrderId,
          chessaShortId: out.chessaShortId,
        },
      });

      await ctx.scheduler.runAfter(
        0,
        internal.treasuryPayout.fundChessaPaymentAddress,
        { payoutId },
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      /*
       * What the player is shown is not what the log records.
       *
       * The raw text is a Convex request id and a stack line -- "Chessa
       * off-ramp: [Request ID: dabd1e...] Server Error" -- which tells the
       * person whose money just came back precisely nothing. Where the provider
       * says something actionable, say that instead; otherwise say plainly that
       * it failed and the money is back. The raw message still goes to the
       * server log, where the person who can act on it is looking.
       */
      console.error(`[aurum-rail] payout ${payoutId} off-ramp failed: ${raw}`);
      const limit = raw.match(/below the minimum limit of ([\d.]+) (\w+)/i);
      const friendly = limit
        ? `EcoCash payouts start at ${limit[1]} ${limit[2]} received. Your balance is unchanged — withdraw a little more, or take it out as crypto.`
        : /insufficient|balance/i.test(raw)
          ? "The payout could not be funded right now. Your balance is unchanged; try again shortly."
          : "EcoCash could not complete this payout. Your balance is unchanged.";
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: friendly,
      });
    }
  },
});
