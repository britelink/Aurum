"use node";

/**
 * Buy crypto with EcoCash — SGX's on-ramp, pointed at the game.
 *
 * This is a port of SGX's `v0public:ecocashToUsdt`, invoked directly on
 * Chessa's Convex with the shared bridge secret (the same route
 * `chessaBridge.ts` uses for the off-ramp — no HTTP hop through sgxremit.com).
 *
 * The interesting part is where the crypto is delivered.
 *
 * The obvious design is "buy USDT to your own wallet, then send it to the game"
 * — two payments, two waits, and a wallet the player may not have. Instead the
 * on-ramp is told to deliver **the deposit quote's exact tagged amount to the
 * agent wallet**. That transfer is indistinguishable from a player sending
 * their own USDT, so the ordinary watcher matches the tag and credits them. One
 * payment, and no second crediting path to trust: EcoCash money reaches a
 * balance through exactly the same code an on-chain deposit does.
 *
 * `buyToOwnWallet` keeps the plain version for a player who does want the coins
 * themselves rather than a game balance.
 */

import { internalAction, action } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getChessaConvexUrl, getChessaV0InternalSecret } from "./chessaBridge";
import {
  isEvmAddress,
  MAX_DEPOSIT,
  MIN_DEPOSIT,
  roundAmount,
  roundMoney,
} from "./railLib";
import {
  isValidZwEcocashNineDigits,
  toZwEcocashLocalNineDigits,
} from "./britelinkSgx";

type EcocashToUsdtResult = {
  success: true;
  referenceNumber: string;
  redirectUrl: string | null;
  orderId: string;
};

const ecocashToUsdtRef = makeFunctionReference<
  "action",
  {
    internalSecret: string;
    walletAddress: string;
    fiatAmount: string;
    cryptoAmount?: string;
    email?: string;
    payerPhone: string;
  },
  EcocashToUsdtResult
>("v0public:ecocashToUsdt");

/**
 * What the player pays in USD to receive `cryptoAmount` USDT.
 *
 * SGX quotes the on-ramp at a 2% fee taken off the fiat, so delivering an exact
 * figure means dividing rather than adding — the same correction the deposit
 * gross-up makes, for the same reason: adding 2% to 10 gives 10.20, of which 2%
 * is 0.204, leaving 9.996. Short every time.
 *
 * Aurum adds nothing on top. The house takes its cut on withdrawal, not on the
 * way in, so this figure is SGX's fee and nothing else.
 */
const SGX_ONRAMP_FEE_RATE = 0.02;

export function fiatForCrypto(cryptoAmount: number): number {
  return roundMoney(cryptoAmount / (1 - SGX_ONRAMP_FEE_RATE) + 0.005);
}

async function invokeEcocashToUsdt(args: {
  walletAddress: string;
  fiatAmount: number;
  cryptoAmount: number;
  payerPhone: string;
  email?: string;
}): Promise<EcocashToUsdtResult> {
  const client = new ConvexHttpClient(getChessaConvexUrl());
  return await client.action(ecocashToUsdtRef, {
    internalSecret: getChessaV0InternalSecret(),
    walletAddress: args.walletAddress,
    fiatAmount: args.fiatAmount.toFixed(2),
    cryptoAmount: args.cryptoAmount.toFixed(6),
    payerPhone: args.payerPhone,
    ...(args.email ? { email: args.email } : {}),
  });
}

/**
 * Top up the game balance with EcoCash.
 *
 * Quotes a deposit, then asks SGX to deliver that quote's exact amount to the
 * agent wallet. The player approves one EcoCash prompt; the watcher does the
 * rest.
 */
export const topUpWithEcocash = action({
  args: {
    /** USDT the player wants credited. They pay this plus SGX's on-ramp fee. */
    amount: v.number(),
    payerPhone: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    depositId: Id<"cryptoDeposits">;
    reference: string;
    amountToCredit: number;
    fiatAmount: number;
    onrampFee: number;
    referenceNumber: string;
    redirectUrl: string | null;
    payerPhone: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;

    const amount = roundMoney(args.amount);
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
      throw new ConvexError(`Minimum top-up is ${MIN_DEPOSIT} USDT.`);
    }
    if (amount > MAX_DEPOSIT) {
      throw new ConvexError(`Maximum top-up is ${MAX_DEPOSIT} USDT.`);
    }

    const phone = toZwEcocashLocalNineDigits(args.payerPhone);
    if (!isValidZwEcocashNineDigits(phone)) {
      throw new ConvexError(
        "Enter a valid Zimbabwe EcoCash number, e.g. 0771234567.",
      );
    }

    // Quote first. If the on-ramp call then fails the quote is simply never
    // paid and expires on its own — harmless. Doing it the other way round
    // would mean money in flight toward a deposit that does not exist.
    const quote = (await ctx.runMutation(
      internal.buyCryptoInternal.quoteForOnramp,
      { userId, amount },
    )) as {
      depositId: Id<"cryptoDeposits">;
      reference: string;
      amountPayable: number;
      depositAddress: string;
    };

    const fiatAmount = fiatForCrypto(quote.amountPayable);

    try {
      const out = await invokeEcocashToUsdt({
        walletAddress: quote.depositAddress,
        fiatAmount,
        cryptoAmount: quote.amountPayable,
        payerPhone: phone,
        email: args.email?.trim() || undefined,
      });

      await ctx.runMutation(internal.buyCryptoInternal.markOnrampInitiated, {
        depositId: quote.depositId,
        reference: out.referenceNumber,
        orderId: String(out.orderId ?? ""),
        fiatAmount,
        phone,
        // Verbatim, so a later reconciliation with Pesepay is a lookup rather
        // than an archaeology exercise across three systems.
        raw: JSON.stringify({
          response: out,
          requested: {
            walletAddress: quote.depositAddress,
            cryptoAmount: quote.amountPayable,
            fiatAmount,
            payerPhone: phone,
            depositReference: quote.reference,
          },
          at: new Date().toISOString(),
        }),
      });

      return {
        depositId: quote.depositId,
        reference: quote.reference,
        amountToCredit: quote.amountPayable,
        fiatAmount,
        onrampFee: roundMoney(fiatAmount - quote.amountPayable),
        referenceNumber: out.referenceNumber,
        redirectUrl: out.redirectUrl ?? null,
        payerPhone: phone,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.buyCryptoInternal.markOnrampFailed, {
        depositId: quote.depositId,
        error: msg,
      });
      throw new ConvexError(`EcoCash top-up could not start: ${msg}`);
    }
  },
});

/**
 * Buy USDT to an address the player owns — the plain on-ramp, no game deposit.
 *
 * Nothing is credited by this; it is a purchase, and the coins are the player's
 * to do as they like with. Kept because "I want the USDT, not a balance" is a
 * real answer, and because it is the escape hatch if the top-up path ever has
 * to be switched off.
 */
export const buyToOwnWallet = action({
  args: {
    amount: v.number(),
    walletAddress: v.string(),
    payerPhone: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    referenceNumber: string;
    redirectUrl: string | null;
    cryptoAmount: number;
    fiatAmount: number;
    walletAddress: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const cryptoAmount = roundAmount(args.amount);
    if (!Number.isFinite(cryptoAmount) || cryptoAmount < MIN_DEPOSIT) {
      throw new ConvexError(`Minimum purchase is ${MIN_DEPOSIT} USDT.`);
    }
    const walletAddress = args.walletAddress.trim();
    if (!isEvmAddress(walletAddress)) {
      throw new ConvexError(
        "Enter a BNB Smart Chain (BEP20) address — 0x followed by 40 hex characters.",
      );
    }
    const phone = toZwEcocashLocalNineDigits(args.payerPhone);
    if (!isValidZwEcocashNineDigits(phone)) {
      throw new ConvexError(
        "Enter a valid Zimbabwe EcoCash number, e.g. 0771234567.",
      );
    }

    const fiatAmount = fiatForCrypto(cryptoAmount);
    const out = await invokeEcocashToUsdt({
      walletAddress,
      fiatAmount,
      cryptoAmount,
      payerPhone: phone,
      email: args.email?.trim() || undefined,
    });

    return {
      referenceNumber: out.referenceNumber,
      redirectUrl: out.redirectUrl ?? null,
      cryptoAmount,
      fiatAmount,
      walletAddress,
    };
  },
});

/**
 * Is the on-ramp open, and by which route.
 *
 * Asks Chessa rather than guessing. A player should be told the EcoCash route
 * is down before they enter an amount and a phone number, not after — and
 * *which* provider is carrying the traffic is SGX's operational detail, so only
 * the availability is surfaced.
 */
export const onrampStatus = internalAction({
  args: {},
  handler: async (): Promise<{
    available: boolean;
    known: boolean;
    message: string | null;
  }> => {
    try {
      const client = new ConvexHttpClient(getChessaConvexUrl());
      const statusRef = makeFunctionReference<
        "query",
        Record<string, never>,
        {
          available: boolean;
          message: string | null;
          pesepay?: boolean;
          zb?: boolean;
        }
      >("v0public:onrampStatus");
      const res = await client.query(statusRef, {});

      /*
       * `available` is not the flag that governs us.
       *
       * SGX reports the on-ramp open when *any* provider is carrying traffic,
       * and today that is ZB with Pesepay switched off. But
       * `v0public.ecocashToUsdt` asserts Pesepay specifically and throws before
       * it reaches a payment, so trusting `available` here offers the player a
       * route that cannot complete and fails them after they have entered an
       * amount and a phone number.
       *
       * So: the provider our call actually needs, when the deployment reports
       * it. Older deployments do not, and there we fall back to `available`.
       */
      const pesepayKnown = typeof res?.pesepay === "boolean";
      const usable = pesepayKnown ? res.pesepay === true : Boolean(res?.available);

      return {
        available: usable,
        known: true,
        message: usable
          ? null
          : pesepayKnown
            ? "EcoCash top-ups are paused by the payment provider. Send crypto instead."
            : (res?.message ?? "EcoCash top-ups are unavailable right now."),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A missing status query is "cannot ask", not "down" — older Chessa
      // deployments answer the on-ramp but predate this endpoint.
      if (msg.includes("Could not find public function")) {
        return { available: true, known: false, message: null };
      }
      return {
        available: false,
        known: true,
        message: `On-ramp unreachable: ${msg}`,
      };
    }
  },
});

/** Public form, so the deposit wizard can hide a route that cannot complete. */
export const ecocashTopUpStatus = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ available: boolean; message: string | null }> => {
    const res = (await ctx.runAction(internal.buyCrypto.onrampStatus, {})) as {
      available: boolean;
      message: string | null;
    };
    return { available: res.available, message: res.message };
  },
});
