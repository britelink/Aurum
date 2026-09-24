"use node";

/**
 * EcoCash deposits collected on Aurum's own Pesepay merchant account.
 *
 * Ported from SGX's `pesepaySeamlessInternal.ts` rather than called through it.
 * Aurum is a child product with its own Pesepay credentials, so going via SGX's
 * partner bridge bought nothing and cost everything: the bridge asserts Pesepay
 * is open *on SGX*, and when SGX switched Pesepay off in favour of ZB, Aurum's
 * deposits went dark while our own merchant account was working fine. A
 * dependency that can be turned off by someone solving an unrelated problem is
 * not a dependency worth having for a collection we can make ourselves.
 *
 * This file is now one of two collectors — see `zbDeposit.ts` for the ZB
 * Smile&Pay express push and `ecocashDeposit.ts` for the router that chooses.
 * It no longer creates deposit rows; it pushes against one it is handed, so a
 * failed attempt at one provider can be retried at the other **on the same
 * row**. Two rows for one intent is how a player pays twice and is credited
 * once.
 *
 * **This path does not touch the chain**, and that is the one thing to
 * understand about it. A crypto deposit is matched on-chain and backed by USDT
 * in the agent wallet. An EcoCash deposit is USD landing in our Pesepay
 * account, credited on Pesepay's confirmation. Both produce the same balance,
 * but they are backed by two separate floats — and withdrawals draw on the USDT
 * one. See the note on `creditPaidDeposit`.
 */

import { internalAction } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

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

/**
 * Push an EcoCash prompt for a deposit row that already exists.
 *
 * Throws on refusal. Unlike ZB, Pesepay's seamless call does not have a habit
 * of failing the response after creating the charge, so a thrown error here can
 * be taken at face value — there is no probe leg to mirror.
 */
export const pushPesepayEcocash = internalAction({
  args: {
    depositId: v.id("cryptoDeposits"),
    reference: v.string(),
    amount: v.number(),
    phone: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ reference: string; redirectUrl: string | null }> => {
    const { integrationKey, encryptionKey } = credentials();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pesepay } = require("pesepay");
    const pesepay = new Pesepay(integrationKey, encryptionKey);
    pesepay.resultUrl = `${process.env.CONVEX_SITE_URL ?? ""}/pesepay/webhook`;
    pesepay.returnUrl = `${process.env.SITE_URL ?? "https://aurum-nu.vercel.app"}/wallet`;

    const payment = pesepay.createPayment(
      "USD",
      ECOCASH_USD_METHOD,
      args.email?.trim() || "player@pennygame.app",
      args.phone,
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
      `Penny Game deposit ${args.reference}`,
      args.amount,
      { customerPhoneNumber: args.phone, phoneNumber: args.phone },
    );

    const reference = res?.referenceNumber || res?.merchantReference || null;
    if (!res?.success || !reference) {
      throw new ConvexError(
        res?.message?.trim() ||
          "EcoCash declined the payment request. Check the number and try again.",
      );
    }

    await ctx.runMutation(internal.pesepayDepositInternal.markPesepayInitiated, {
      depositId: args.depositId,
      reference,
      phone: args.phone,
      amount: args.amount,
      // Verbatim: Pesepay sees collections with nothing marking them as ours,
      // and when they ask, the answer has to be a record tying their reference
      // to our player, amount and timestamp.
      raw: JSON.stringify({ provider: "pesepay", response: res, at: new Date().toISOString() }),
    });

    await ctx.scheduler.runAfter(
      POLL_INTERVAL_MS,
      internal.pesepayDeposit.pollEcocashDeposit,
      { depositId: args.depositId, attempt: 1 },
    );

    return {
      reference,
      redirectUrl: res.redirectUrl || res.paymentUrl || res.url || null,
    };
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
    /*
     * The router may have moved this row to the other collector after the
     * schedule was laid down. Polling Pesepay for a reference that now belongs
     * to ZB reads as "not paid" forever and would eventually cancel a deposit
     * ZB is actively collecting.
     */
    if (row.onrampProvider && row.onrampProvider !== "pesepay") {
      return { done: true, reason: "provider changed" };
    }
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
