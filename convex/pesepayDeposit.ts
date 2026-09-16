"use node";

/**
 * EcoCash deposits, collected by Aurum directly.
 *
 * Ported from SGX's `pesepaySeamlessInternal.ts` rather than called through it.
 * Aurum is a child product with its own Pesepay merchant credentials, so going
 * via SGX's partner bridge bought nothing and cost everything: the bridge
 * asserts Pesepay is open *on SGX*, and when SGX switched Pesepay off in favour
 * of ZB, Aurum's deposits went dark while our own merchant account was working
 * fine. A dependency that can be turned off by someone solving an unrelated
 * problem is not a dependency worth having for a collection we can make
 * ourselves.
 *
 * **This path does not touch the chain**, and that is the one thing to
 * understand about it. A crypto deposit is matched on-chain and backed by USDT
 * in the agent wallet. An EcoCash deposit is USD landing in our Pesepay
 * account, credited on Pesepay's confirmation. Both produce the same balance,
 * but they are backed by two separate floats — and withdrawals draw on the
 * USDT one. See the note on `creditPaidDeposit`.
 */

import { action, internalAction } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_DEPOSIT, MIN_DEPOSIT, roundMoney } from "./railLib";
import {
  isValidZwEcocashNineDigits,
  toZwEcocashLocalNineDigits,
} from "./britelinkSgx";

/** Pesepay's code for EcoCash USD. Same constant SGX uses. */
const ECOCASH_USD_METHOD = "PZW211";

/** Poll cadence and ceiling — ~10 minutes, which outlasts any real EcoCash prompt. */
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120;

function credentials(): { integrationKey: string; encryptionKey: string } {
  const integrationKey = process.env.PESEPAY_INTEGRATION_KEY?.trim();
  const encryptionKey = process.env.PESEPAY_ENCRYPTION_KEY?.trim();
  if (!integrationKey || !encryptionKey) {
    throw new ConvexError(
      "EcoCash deposits are not configured: set PESEPAY_INTEGRATION_KEY and PESEPAY_ENCRYPTION_KEY on Convex.",
    );
  }
  return { integrationKey, encryptionKey };
}

/** Is the EcoCash deposit route usable at all? Our own keys, our own answer. */
export const ecocashDepositStatus = action({
  args: {},
  handler: async (): Promise<{ available: boolean; message: string | null }> => {
    const ok = Boolean(
      process.env.PESEPAY_INTEGRATION_KEY?.trim() &&
        process.env.PESEPAY_ENCRYPTION_KEY?.trim(),
    );
    return {
      available: ok,
      message: ok
        ? null
        : "EcoCash deposits are not configured on this deployment yet.",
    };
  },
});

/**
 * Push an EcoCash prompt and wait for it.
 *
 * The deposit row is created first and the charge second, so a Pesepay failure
 * leaves a cancelled quote rather than money in flight toward a record that
 * does not exist.
 */
export const startEcocashDeposit = action({
  args: {
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
    pesepayReference: string;
    amount: number;
    payerPhone: string;
    redirectUrl: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;

    const { integrationKey, encryptionKey } = credentials();

    const amount = roundMoney(args.amount);
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
      throw new ConvexError(`Minimum deposit is $${MIN_DEPOSIT}.`);
    }
    if (amount > MAX_DEPOSIT) {
      throw new ConvexError(`Maximum deposit is $${MAX_DEPOSIT}.`);
    }

    const phone = toZwEcocashLocalNineDigits(args.payerPhone);
    if (!isValidZwEcocashNineDigits(phone)) {
      throw new ConvexError(
        "Enter a valid Zimbabwe EcoCash number, e.g. 0771234567.",
      );
    }

    const quote = (await ctx.runMutation(
      internal.pesepayDepositInternal.createEcocashDeposit,
      { userId, amount, phone },
    )) as { depositId: Id<"cryptoDeposits">; reference: string };

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pesepay } = require("pesepay");
      const pesepay = new Pesepay(integrationKey, encryptionKey);
      pesepay.resultUrl = `${process.env.CONVEX_SITE_URL ?? ""}/pesepay/webhook`;
      pesepay.returnUrl = `${process.env.SITE_URL ?? "https://aurum-nu.vercel.app"}/wallet`;

      const payment = pesepay.createPayment(
        "USD",
        ECOCASH_USD_METHOD,
        args.email?.trim() || identity.email || "player@pennygame.app",
        phone,
      );

      const res: {
        success?: boolean;
        referenceNumber?: string;
        merchantReference?: string;
        redirectUrl?: string;
        paymentUrl?: string;
        url?: string;
        message?: string;
      } = await pesepay.makeSeamlessPayment(
        payment,
        `Penny Game deposit ${quote.reference}`,
        amount,
        { customerPhoneNumber: phone, phoneNumber: phone },
      );

      const reference = res?.referenceNumber || res?.merchantReference || null;
      if (!res?.success || !reference) {
        throw new ConvexError(
          res?.message?.trim() ||
            "EcoCash declined the payment request. Check the number and try again.",
        );
      }

      await ctx.runMutation(
        internal.pesepayDepositInternal.markPesepayInitiated,
        {
          depositId: quote.depositId,
          reference,
          phone,
          amount,
          // Verbatim: Pesepay sees collections with nothing marking them as
          // ours, and when they ask, the answer has to be a record tying their
          // reference to our player, amount and timestamp.
          raw: JSON.stringify({ response: res, at: new Date().toISOString() }),
        },
      );

      await ctx.scheduler.runAfter(
        POLL_INTERVAL_MS,
        internal.pesepayDeposit.pollEcocashDeposit,
        { depositId: quote.depositId, attempt: 1 },
      );

      return {
        depositId: quote.depositId,
        reference: quote.reference,
        pesepayReference: reference,
        amount,
        payerPhone: phone,
        redirectUrl: res.redirectUrl || res.paymentUrl || res.url || null,
      };
    } catch (e) {
      await ctx.runMutation(internal.pesepayDepositInternal.markPesepayFailed, {
        depositId: quote.depositId,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e instanceof ConvexError
        ? e
        : new ConvexError(
            `EcoCash deposit could not start: ${e instanceof Error ? e.message : String(e)}`,
          );
    }
  },
});

/**
 * Ask Pesepay whether the prompt was paid, and keep asking.
 *
 * A scheduled chain rather than a cron: a deposit that nobody is paying should
 * not cost anything, and each link reschedules only while the answer is still
 * "not yet". The attempt ceiling is what stops a cancelled prompt polling
 * forever.
 */
export const pollEcocashDeposit = internalAction({
  args: { depositId: v.id("cryptoDeposits"), attempt: v.number() },
  handler: async (ctx, args) => {
    const row = (await ctx.runQuery(
      internal.pesepayDepositInternal.getDeposit,
      { depositId: args.depositId },
    )) as Doc<"cryptoDeposits"> | null;

    if (!row || row.status !== "awaiting_ecocash") return { done: true };
    const reference = row.onrampReference;
    if (!reference) return { done: true, reason: "no reference" };

    let paid = false;
    try {
      const { integrationKey, encryptionKey } = credentials();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pesepay } = require("pesepay");
      const pesepay = new Pesepay(integrationKey, encryptionKey);
      const status = await pesepay.checkPayment(reference);
      paid = Boolean(status?.paid);
    } catch (e) {
      // A failed status read is not a failed payment. Keep polling.
      console.warn(
        `[aurum-rail] pesepay poll ${reference}:`,
        e instanceof Error ? e.message : e,
      );
    }

    if (paid) {
      await ctx.runMutation(internal.pesepayDepositInternal.creditPaidDeposit, {
        depositId: args.depositId,
      });
      return { done: true, paid: true };
    }

    if (args.attempt >= MAX_POLL_ATTEMPTS) {
      await ctx.runMutation(internal.pesepayDepositInternal.markPesepayFailed, {
        depositId: args.depositId,
        error: "EcoCash prompt was not completed in time.",
      });
      return { done: true, timedOut: true };
    }

    await ctx.scheduler.runAfter(
      POLL_INTERVAL_MS,
      internal.pesepayDeposit.pollEcocashDeposit,
      { depositId: args.depositId, attempt: args.attempt + 1 },
    );
    return { done: false, attempt: args.attempt };
  },
});
