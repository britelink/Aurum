/**
 * One EcoCash deposit, two collectors, and the rule for choosing between them.
 *
 * Penny Game can collect EcoCash through its own Pesepay merchant account
 * (`pesepayDeposit.ts`) or through ZB Smile&Pay express checkout
 * (`zbDeposit.ts`). Both are single USSD pushes: no hosted checkout, no
 * redirect, no OTP leg. From here they are interchangeable.
 *
 * Having two is not gold-plating. Deposits have already gone dark once because
 * a provider was switched off for reasons that had nothing to do with this
 * product, and an on-ramp with one provider is an on-ramp with a single point
 * of failure whoever owns it. This file makes that failure a fallback instead
 * of an outage.
 *
 * **The rule that matters:** a fallback may only fire when the first provider
 * has *confirmed* that nothing is in flight. ZB in particular will create the
 * transaction, prompt the payer, and then fail the HTTP response — falling back
 * on that would push a second prompt for the same deposit and debit the player
 * twice. `zbDeposit.pushZbEcocash` therefore probes before it throws, and only
 * throws when it is certain. A throw from either collector means "nothing
 * happened"; anything less certain is not allowed to be a throw.
 */

import { action } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_DEPOSIT, MIN_DEPOSIT, roundMoney } from "./railLib";
import {
  isValidZwEcocashNineDigits,
  toZwEcocashLocalNineDigits,
} from "./britelinkSgx";
import {
  type EcocashProvider as Provider,
  ecocashProviderOrder as providerOrder,
} from "./zbLib";

/** Is the EcoCash deposit route usable at all? Our own keys, our own answer. */
export const ecocashDepositStatus = action({
  args: {},
  handler: async (): Promise<{
    available: boolean;
    message: string | null;
    providers: string[];
  }> => {
    const order = providerOrder();
    return {
      available: order.length > 0,
      message:
        order.length > 0
          ? null
          : "EcoCash deposits are not configured on this deployment yet.",
      providers: order,
    };
  },
});

/**
 * Quote a deposit, then push the prompt.
 *
 * The row is created before any provider is called, so a refusal leaves a
 * cancelled quote rather than money in flight toward a record that does not
 * exist. The same row is reused across the fallback.
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
    provider: Provider;
    amount: number;
    payerPhone: string;
    redirectUrl: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const userId = identity.subject.split("|")[0] as Id<"users">;

    const order = providerOrder();
    if (order.length === 0) {
      throw new ConvexError(
        "EcoCash deposits are not configured on this deployment yet.",
      );
    }

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

    const email = args.email?.trim() || identity.email || undefined;

    const quote = (await ctx.runMutation(
      internal.pesepayDepositInternal.createEcocashDeposit,
      { userId, amount, phone, provider: order[0] },
    )) as { depositId: Id<"cryptoDeposits">; reference: string };

    const failures: string[] = [];

    for (let i = 0; i < order.length; i++) {
      const provider = order[i];

      if (i > 0) {
        await ctx.runMutation(internal.pesepayDepositInternal.switchProvider, {
          depositId: quote.depositId,
          provider,
          reason: failures[failures.length - 1] ?? "previous provider refused",
        });
      }

      try {
        if (provider === "zb") {
          const out = await ctx.runAction(internal.zbDeposit.pushZbEcocash, {
            depositId: quote.depositId,
            reference: quote.reference,
            amount,
            phone,
          });
          return {
            depositId: quote.depositId,
            reference: quote.reference,
            pesepayReference: out.reference,
            provider,
            amount,
            payerPhone: phone,
            // ZB's express push has nothing to redirect to; the prompt is the
            // whole interaction.
            redirectUrl: null,
          };
        }

        const out = await ctx.runAction(internal.pesepayDeposit.pushPesepayEcocash, {
          depositId: quote.depositId,
          reference: quote.reference,
          amount,
          phone,
          email,
        });
        return {
          depositId: quote.depositId,
          reference: quote.reference,
          pesepayReference: out.reference,
          provider,
          amount,
          payerPhone: phone,
          redirectUrl: out.redirectUrl,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failures.push(`${provider}: ${message}`);
        console.warn(`[aurum-rail] ${quote.reference} ${provider} push failed: ${message}`);
      }
    }

    /*
     * Everyone refused, and each refusal was certain. Cancel the quote so the
     * player is not left looking at a deposit that is waiting for a prompt
     * nobody ever sent.
     */
    await ctx.runMutation(internal.pesepayDepositInternal.markPesepayFailed, {
      depositId: quote.depositId,
      error: failures.join(" | "),
    });

    throw new ConvexError(
      failures.length === 1
        ? failures[0].replace(/^(zb|pesepay): /, "")
        : "EcoCash is not accepting payments right now. Please try again shortly.",
    );
  },
});
