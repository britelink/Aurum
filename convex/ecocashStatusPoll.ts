"use node";

/**
 * Close the loop on EcoCash payouts by asking, instead of waiting to be told.
 *
 * A payout reaches `sgx_submitted` once Chessa has the order and the agent
 * wallet has funded its payment address. From there Chessa pays the recipient
 * — that part needs nothing from us. What was missing was Aurum ever learning
 * the outcome, so rows sat at `sgx_submitted` forever and a player who had
 * been paid still saw "in progress".
 *
 * The obvious fix is a callback from Chessa to `/sgx/withdrawal-callback`, and
 * that route exists. But it needs a shared secret configured on both sides,
 * which makes our status display depend on someone else's deployment being
 * changed — a coordination step for information we can simply go and read.
 *
 * `chessa:getOrderStatus` takes the order id we already store. Polling it is
 * strictly better here: no shared secret, no inbound endpoint to secure, no
 * silent failure if the far side forgets to call. The callback stays supported
 * for when it is configured; this makes it optional rather than required.
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getChessaConvexUrl } from "./chessaBridge";

/**
 * Chessa's vocabulary, mapped onto the only two answers that matter.
 *
 * Anything not listed is treated as still in flight. That asymmetry is
 * deliberate: an unrecognised status left pending costs a player a slightly
 * stale screen, while an unrecognised status guessed as `failed` refunds money
 * that was actually paid out — the platform would be down twice.
 */
const PAID = new Set(["completed", "complete", "paid", "success", "successful", "settled"]);
const FAILED = new Set(["failed", "failure", "cancelled", "canceled", "expired", "rejected"]);

const orderStatusRef = makeFunctionReference<
  "action",
  { orderId: string },
  { status: string | null; order?: unknown; notFound?: boolean } | null
>("chessa:getOrderStatus");

export const pollEcocashPayouts = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const pending = (await ctx.runQuery(
      internal.withdrawals.listAwaitingSettlement,
      { limit: Math.min(args.limit ?? 25, 50) },
    )) as Doc<"ecocashPayouts">[];

    if (pending.length === 0) return { checked: 0, paid: 0, failed: 0 };

    const client = new ConvexHttpClient(getChessaConvexUrl());
    let paid = 0;
    let failed = 0;
    let checked = 0;

    for (const row of pending) {
      const orderId = row.chessaOrderId || row.sgxOrderId;
      if (!orderId) continue;
      checked++;

      let status: string | null = null;
      try {
        const res = (await ctx.runAction(internal.chessaClient.getOrderStatus, {
          orderId,
        })) as { status: string | null };
        status = res.status;
      } catch (e) {
        // One unreachable order must not stop the rest of the batch; the next
        // tick retries it anyway.
        console.warn(
          `[aurum-rail] status poll failed for ${orderId}:`,
          e instanceof Error ? e.message : e,
        );
        continue;
      }

      if (!status) continue;

      if (PAID.has(status)) {
        await ctx.runMutation(internal.withdrawals.completeOrFailFromCallback, {
          idempotencyKey: row.idempotencyKey,
          outcome: "ecocash_paid",
          detail: `Chessa reported ${status}`,
        });
        paid++;
      } else if (FAILED.has(status)) {
        /*
         * Chessa could not deliver, so the balance goes back. The USDT we sent
         * to fund the order is a separate matter — it is sitting with Chessa
         * and is reconciled with them, not clawed back from the player, who did
         * nothing wrong and should not be left short while that is sorted out.
         */
        await ctx.runMutation(internal.withdrawals.completeOrFailFromCallback, {
          idempotencyKey: row.idempotencyKey,
          outcome: "failed",
          detail: `Chessa reported ${status}`,
        });
        failed++;
      }
    }

    return { checked, paid, failed };
  },
});
