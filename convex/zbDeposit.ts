/**
 * EcoCash deposits over ZB Smile&Pay express checkout.
 *
 * Ported from SGX's `zbEcocash.ts` / `zbExpressRecovery.ts` / `zbNodeCheck.ts`.
 * Same shape as the Pesepay seamless push already in `pesepayDeposit.ts`: one
 * call, one USSD prompt on the payer's phone, no hosted checkout page, no
 * redirect, no second OTP leg. From Aurum's side the two providers are
 * interchangeable, which is the entire point of having both — SGX switching
 * Pesepay off is what took Aurum's deposits down once already, and a single
 * collection rail is a single point of failure whoever owns it.
 *
 * No `"use node"`: ZB is plain HTTP with two header credentials, so this runs
 * in the default runtime. Pesepay needs Node only because of its SDK.
 *
 * Crediting lives in `pesepayDepositInternal.creditPaidDeposit`, shared with
 * the Pesepay path. One credit path, one place a balance can be invented.
 */

import { internalAction, type ActionCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ZB_USD_CURRENCY_CODE,
  isZbPaid,
  isZbPushAccepted,
  isZbTerminalFailure,
  zbBaseUrl,
  zbProbeSaysLive,
  zbReturnUrl,
} from "./zbLib";

/** Matches the Pesepay path: ~10 minutes, longer than any live EcoCash prompt. */
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120;

function credentials(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.ZB_API_KEY?.trim();
  const apiSecret = process.env.ZB_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new ConvexError(
      "ZB deposits are not configured: set ZB_API_KEY and ZB_API_SECRET on Convex.",
    );
  }
  return { apiKey, apiSecret };
}

export type ZbProbe = {
  /**
   * True only when the transaction exists at ZB *and* is still live. A
   * transaction that exists but has already terminally failed is not something
   * to carry on with — it would show the player a payment screen for a payment
   * that can never complete.
   */
  exists: boolean;
  httpStatus: number;
  reference?: string;
  status?: string;
};

/**
 * Ask ZB whether a transaction exists, regardless of what the push call said.
 *
 * This is the safety net the whole port is built around. ZB demonstrably
 * creates a transaction, sends the USSD prompt, and *then* fails the HTTP
 * response. Believing that failure is harmful twice over: the player can still
 * complete a payment nothing is polling, so their money leaves and no balance
 * ever appears; and the caller falls back to Pesepay, pushing a **second**
 * prompt for the same deposit — a real double-debit.
 */
export async function probeZbTransaction(args: {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  orderReference: string;
}): Promise<ZbProbe> {
  try {
    const res = await fetch(
      `${args.baseUrl}/payments/transaction/${encodeURIComponent(args.orderReference)}/status/check`,
      {
        method: "GET",
        headers: { "x-api-key": args.apiKey, "x-api-secret": args.apiSecret },
      },
    );
    const text = await res.text();
    let body: { reference?: string; status?: string } = {};
    try {
      body = JSON.parse(text);
    } catch {
      /*
       * A non-JSON body means we cannot confirm anything. Report "not found" so
       * the caller fails loudly rather than silently stranding a payment on a
       * transaction we only assumed was there.
       */
      return { exists: false, httpStatus: res.status };
    }
    return {
      exists: zbProbeSaysLive({
        ok: res.ok,
        reference: body.reference,
        status: body.status,
      }),
      httpStatus: res.status,
      reference: body.reference,
      status: body.status,
    };
  } catch {
    return { exists: false, httpStatus: 0 };
  }
}

/**
 * Push the EcoCash prompt for a deposit row that already exists.
 *
 * Takes a row rather than creating one so the router can try ZB and fall back
 * to Pesepay against a single deposit — two rows for one intent is how a player
 * ends up paying twice and being credited once.
 *
 * Throws only when we are **certain** nothing is in flight at ZB. That
 * certainty is what makes the fallback safe.
 */
export const pushZbEcocash = internalAction({
  args: {
    depositId: v.id("cryptoDeposits"),
    reference: v.string(),
    amount: v.number(),
    phone: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ reference: string; zbStatus: string | null; recovered: boolean }> => {
    const { apiKey, apiSecret } = credentials();
    const baseUrl = zbBaseUrl();

    /*
     * ZB wants the local 09-prefixed number, the same form Pesepay takes. The
     * caller has already normalised and validated it; re-stripping whitespace
     * is cheap insurance against a space reaching the wire.
     */
    const ecocashMobile = args.phone.replace(/\s+/g, "");

    const response = await fetch(`${baseUrl}/payments/express-checkout/ecocash`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "x-api-secret": apiSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderReference: args.reference,
        amount: args.amount,
        currencyCode: ZB_USD_CURRENCY_CODE,
        itemName: "Penny Game deposit",
        itemDescription: `Penny Game deposit ${args.reference}`,
        resultUrl: `${process.env.CONVEX_SITE_URL ?? ""}/zb/webhook`,
        // Mandatory even though nothing redirects. See zbReturnUrl.
        returnUrl: zbReturnUrl(),
        ecocashMobile,
      }),
    });

    const text = await response.text();
    let parsed: {
      responseCode?: string;
      responseMessage?: string;
      transactionReference?: string;
    } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }

    let recovered = false;

    if (!isZbPushAccepted(response.ok, parsed.responseCode)) {
      const probe = await probeZbTransaction({
        baseUrl,
        apiKey,
        apiSecret,
        orderReference: args.reference,
      });

      if (!probe.exists) {
        throw new ConvexError(
          parsed.responseMessage?.trim() ||
            `ZB declined the EcoCash request (HTTP ${response.status}).`,
        );
      }

      recovered = true;
      console.warn(
        `[aurum-rail] ZB returned HTTP ${response.status} for ${args.reference} ` +
          `but the transaction exists (ref=${probe.reference}, status=${probe.status}); ` +
          `the payer has been prompted, so continuing rather than pushing a second prompt.`,
      );
    }

    await ctx.runMutation(internal.pesepayDepositInternal.markPesepayInitiated, {
      depositId: args.depositId,
      // ZB keys the status check on *our* order reference, not on a reference
      // it mints, so that is what the poll needs to carry.
      reference: args.reference,
      phone: ecocashMobile,
      amount: args.amount,
      raw: JSON.stringify({
        provider: "zb",
        httpStatus: response.status,
        response: parsed,
        recoveredFrom500: recovered,
        at: new Date().toISOString(),
      }),
    });

    await ctx.scheduler.runAfter(POLL_INTERVAL_MS, internal.zbDeposit.pollZbDeposit, {
      depositId: args.depositId,
      attempt: 1,
    });

    return {
      reference: args.reference,
      zbStatus: parsed.transactionReference ?? null,
      recovered,
    };
  },
});

/**
 * Ask ZB whether the prompt was paid, and keep asking.
 *
 * A scheduled chain rather than a cron, for the same reason as the Pesepay
 * poll: a prompt nobody is paying should cost nothing, and each link only
 * reschedules while the answer is still "not yet".
 *
 * Only the literal `PAID` credits. Everything unrecognised is treated as still
 * in flight — an unknown status left pending costs a stale screen, while an
 * unknown status guessed as paid invents money.
 */
/**
 * One status read, and whatever it settles.
 *
 * Kept separate from the scheduled loop because two callers need the *check*
 * and only one of them may extend the *chain*. Folding the reschedule in here
 * would mean ZB's callback quietly started a second poll loop alongside the
 * first, and two loops racing on one deposit is how a credit gets attempted
 * twice.
 */
async function checkZbOnce(
  ctx: ActionCtx,
  depositId: Id<"cryptoDeposits">,
): Promise<{ settled: boolean; paid?: boolean; status?: string }> {
  const row = (await ctx.runQuery(internal.pesepayDepositInternal.getDeposit, {
    depositId,
  })) as Doc<"cryptoDeposits"> | null;

  if (!row || row.status !== "awaiting_ecocash") return { settled: true };
  /*
   * The router may have handed this row to Pesepay after our schedule was laid
   * down. Asking ZB about a reference that now belongs to Pesepay reads as
   * "not paid" forever, and would eventually cancel a deposit the other
   * collector is actively working.
   */
  if (row.onrampProvider && row.onrampProvider !== "zb") return { settled: true };
  const reference = row.onrampReference;
  if (!reference) return { settled: true };

  let raw: string | null = null;
  let reachable = false;
  try {
    const { apiKey, apiSecret } = credentials();
    const res = await fetch(
      `${zbBaseUrl()}/payments/transaction/${encodeURIComponent(reference)}/status/check`,
      { method: "GET", headers: { "x-api-key": apiKey, "x-api-secret": apiSecret } },
    );
    const text = await res.text();
    if (res.ok) {
      try {
        const body = JSON.parse(text) as { status?: string };
        raw = body.status ?? "";
        reachable = true;
      } catch {
        // Non-JSON on a 200 is ZB being odd, not the payer failing.
      }
    }
  } catch (e) {
    // A failed status read is not a failed payment. Keep polling.
    console.warn(
      `[aurum-rail] zb poll ${reference}:`,
      e instanceof Error ? e.message : e,
    );
  }

  if (!reachable) return { settled: false };

  if (isZbPaid(raw)) {
    await ctx.runMutation(internal.pesepayDepositInternal.creditPaidDeposit, {
      depositId,
    });
    return { settled: true, paid: true, status: raw ?? undefined };
  }

  if (isZbTerminalFailure(raw)) {
    await ctx.runMutation(internal.pesepayDepositInternal.markPesepayFailed, {
      depositId,
      error: `EcoCash payment ${(raw ?? "").toLowerCase()}.`,
    });
    return { settled: true, paid: false, status: raw ?? undefined };
  }

  return { settled: false, status: raw ?? undefined };
}

export const pollZbDeposit = internalAction({
  args: { depositId: v.id("cryptoDeposits"), attempt: v.number() },
  handler: async (ctx, args) => {
    const out = await checkZbOnce(ctx, args.depositId);
    if (out.settled) return { done: true, paid: out.paid, status: out.status };

    if (args.attempt >= MAX_POLL_ATTEMPTS) {
      await ctx.runMutation(internal.pesepayDepositInternal.markPesepayFailed, {
        depositId: args.depositId,
        error: "EcoCash prompt was not completed in time.",
      });
      return { done: true, timedOut: true };
    }

    await ctx.scheduler.runAfter(POLL_INTERVAL_MS, internal.zbDeposit.pollZbDeposit, {
      depositId: args.depositId,
      attempt: args.attempt + 1,
    });
    return { done: false, attempt: args.attempt };
  },
});

/**
 * Re-check one deposit now, off the back of ZB's callback.
 *
 * The callback is a nudge, never an instruction: it says when to look, and
 * `status/check` says what happened. So an unauthenticated POST to our endpoint
 * cannot credit anybody — it can only make us ask ZB a question the poll was
 * going to ask anyway. It does not reschedule; the existing chain is still
 * running and owns that.
 */
export const recheckByReference = internalAction({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    const row = (await ctx.runQuery(
      internal.pesepayDepositInternal.getDepositByOnrampReference,
      { reference },
    )) as Doc<"cryptoDeposits"> | null;
    if (!row || row.status !== "awaiting_ecocash") return { checked: false };

    const out = await checkZbOnce(ctx, row._id as Id<"cryptoDeposits">);
    return { checked: true, ...out };
  },
});
