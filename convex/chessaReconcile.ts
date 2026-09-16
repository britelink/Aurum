"use node";

/**
 * Close the books on orders we opened at Chessa and did not complete.
 *
 * Ported from SGX's `orderSync.ts`, which draws the distinction that matters
 * here and that a naive reading misses:
 *
 *  - **`expired` / `cancelled`** — the order died holding nothing. We created
 *    it, refused to fund it, and it timed out. There is no money anywhere to
 *    reclaim; a refund call would be asking for the return of something that
 *    was never sent.
 *
 *  - **`underpaid` / `underfunded`** — we *did* send crypto and it did not
 *    cover the invoice. Chessa will not release the payout and will not keep
 *    waiting; the money is stopped between two companies. This is the only case
 *    where `requestRefund` means anything, and it is the case that quietly
 *    loses funds if nobody looks.
 *
 * SGX's comment on that second state is worth keeping in mind: filing it as
 * "failed" makes it read like an order that never happened, next to a customer
 * who really did pay. So it keeps its own name here too.
 *
 * Aurum's guard means we should never fund short — the payout is refused before
 * a token moves — so `underpaid` should not occur. This exists because "should
 * not occur" is not a reconciliation policy, and the day it does occur is the
 * day somebody needs the money back.
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getChessaConvexUrl } from "./chessaBridge";
import { agentPrivateKey } from "./railLib";

const orderStatusRef = makeFunctionReference<
  "action",
  { orderId: string },
  { status: string | null; notFound?: boolean } | null
>("chessa:getOrderStatus");

const refundRef = makeFunctionReference<
  "action",
  { orderId: string; address: string; tag?: string },
  unknown
>("chessa:requestRefund");

/** Nothing was ever sent — the order simply died. */
const DEAD = new Set(["expired", "cancelled", "canceled"]);
/** Our funding leg fell short: real money, stopped, reclaimable. */
const SHORT = new Set(["underpaid", "underfunded"]);

export const reconcileOrphanOrders = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const funded = (await ctx.runQuery(
      internal.withdrawals.listFundedOrphans,
      {},
    )) as Array<{ payoutId: string; chessaOrderId: string; fundedTx: string }>;
    const unfunded = (await ctx.runQuery(
      internal.withdrawals.listUnfundedOrphans,
      {},
    )) as Array<{ payoutId: string; chessaOrderId: string }>;

    const rows = [
      ...funded.map((r) => ({ ...r, wasFunded: true })),
      ...unfunded.map((r) => ({ ...r, wasFunded: false, fundedTx: null })),
    ].slice(0, Math.min(args.limit ?? 25, 50));

    if (rows.length === 0) {
      return { checked: 0, dead: 0, refunded: 0, stillOpen: 0 };
    }

    const client = new ConvexHttpClient(getChessaConvexUrl());

    // Refunds come back to the wallet that funded them, never to a player.
    const { ethers } = await import("ethers");
    const key = agentPrivateKey();
    const refundAddress =
      process.env.AURUM_DEPOSIT_ADDRESS?.trim() ||
      (key ? new ethers.Wallet(key).address : null);

    let dead = 0;
    let refunded = 0;
    let stillOpen = 0;
    let checked = 0;

    for (const row of rows) {
      checked++;
      let status: string | null = null;
      let notFound = false;
      try {
        const res = await client.action(orderStatusRef, {
          orderId: row.chessaOrderId,
        });
        status = res?.status?.toLowerCase() ?? null;
        notFound = res?.notFound === true;
      } catch (e) {
        console.warn(
          `[aurum-rail] reconcile ${row.chessaOrderId}:`,
          e instanceof Error ? e.message : e,
        );
        continue;
      }

      // A 404 means Chessa has forgotten it. Same outcome as expired.
      const effective = notFound ? "expired" : (status ?? "");

      if (DEAD.has(effective)) {
        dead++;
        await ctx.runMutation(internal.withdrawals.markOrderReconciled, {
          payoutId: row.payoutId as Doc<"ecocashPayouts">["_id"],
          chessaOrderStatus: effective,
        });
        continue;
      }

      if (SHORT.has(effective) && row.wasFunded) {
        if (!refundAddress) {
          console.error(
            `[aurum-rail] ${row.chessaOrderId} is ${effective} but no refund address is configured.`,
          );
          continue;
        }
        try {
          const res = await client.action(refundRef, {
            orderId: row.chessaOrderId,
            address: refundAddress,
          });
          refunded++;
          await ctx.runMutation(internal.withdrawals.markRefundRequested, {
            payoutId: row.payoutId as Doc<"ecocashPayouts">["_id"],
            chessaOrderStatus: effective,
            reference: JSON.stringify(res).slice(0, 300),
          });
          console.error(
            `[aurum-rail] ${row.chessaOrderId} was ${effective} after we funded it ` +
              `(${row.fundedTx}); refund requested to ${refundAddress}.`,
          );
        } catch (e) {
          console.error(
            `[aurum-rail] refund request failed for ${row.chessaOrderId}:`,
            e instanceof Error ? e.message : e,
          );
        }
        continue;
      }

      /*
       * Still open, or a state we do not have a rule for. Record what Chessa
       * said and leave it — guessing at an unknown status is how an order that
       * still holds money gets written off.
       */
      stillOpen++;
      await ctx.runMutation(internal.withdrawals.markOrderReconciled, {
        payoutId: row.payoutId as Doc<"ecocashPayouts">["_id"],
        chessaOrderStatus: effective || "unknown",
      });
    }

    return { checked, dead, refunded, stillOpen };
  },
});
