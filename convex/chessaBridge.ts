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
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: `Chessa off-ramp: ${msg}`,
      });
    }
  },
});
