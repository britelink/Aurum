"use node";

/**
 * Move earned fees out of the float and into the fee wallet.
 *
 * Deliberately **not** a second transfer on the payout path. Sending the fee at
 * the moment of each payout would put another broadcast, another nonce and
 * another failure mode between a player and their money — and the failure it
 * introduces is the worst kind, because a fee transfer that reverts after the
 * payout succeeded leaves the books saying something the chain does not.
 * Separating them means a fee sweep can fail all week without a single player
 * noticing, which is the correct blast radius for the house's own accounting.
 *
 * Takes the same lease over the agent wallet that payouts take. Two senders on
 * one key produce nonce conflicts, and a nonce conflict on the payout side is
 * somebody's withdrawal stuck.
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  FALLBACK_USD_PER_USDT,
  USDT_RATE_KEY,
  agentPrivateKey,
  isNonceConflict,
} from "./railLib";
import { AGENT_WALLET_LOCK } from "./sendLock";

const USDT_BEP20 = "0x55d398326f99059fF775485246999027B3197955";
const ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

type SweepPlan = {
  earnedUsdt: number;
  sweptUsdt: number;
  unsweptUsdt: number;
  floatUsdt: number;
  owedUsdt: number;
  surplusUsdt: number;
  amountUsdt: number;
  blockedBy: "nothing_earned" | "float_short" | "below_minimum" | null;
};

type SweepResult =
  | { skipped: true; reason: string; plan?: SweepPlan }
  | { dryRun: true; plan: SweepPlan }
  | { swept: true; amountUsdt: number; txHash: string }
  | { swept: false; reason?: string; error?: string };

export const sweepFees = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<SweepResult> => {
    const to = process.env.FEESHOLDINGWALLET_ADDRESS?.trim();
    if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
      // A configuration, not a fault. Nothing is wrong with the float; there is
      // simply nowhere to put the fees yet.
      return { skipped: true, reason: "no fee wallet configured" };
    }

    const key = agentPrivateKey();
    if (!key) return { skipped: true, reason: "no agent key configured" };

    const { ethers } = await import("ethers");
    const rpc =
      process.env.AURUM_BSC_RPC_URL?.split(",")[0]?.trim() ||
      "https://bsc-rpc.publicnode.com";
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(key, provider);
    const token = new ethers.Contract(USDT_BEP20, ABI, wallet);

    if (wallet.address.toLowerCase() === to.toLowerCase()) {
      // Sweeping a wallet into itself burns gas to achieve nothing, and means
      // the fee wallet was configured as the float. Worth saying out loud.
      console.error(
        "[aurum-rail] FEESHOLDINGWALLET_ADDRESS is the agent wallet. Fees cannot be separated from the float.",
      );
      return { skipped: true, reason: "fee wallet is the agent wallet" };
    }

    const decimals = Number(await token.decimals());
    const raw = await token.balanceOf(wallet.address);
    const floatUsdt = Number(ethers.formatUnits(raw, decimals));

    const rateRow = (await ctx.runQuery(internal.deposits.getConfig, {
      key: USDT_RATE_KEY,
    })) as string | null;
    let usdPerUsdt = FALLBACK_USD_PER_USDT;
    try {
      const parsed = rateRow ? JSON.parse(rateRow) : null;
      if (parsed?.usdPerUsdt > 0) usdPerUsdt = parsed.usdPerUsdt;
    } catch {
      /* fallback stands */
    }

    const plan = (await ctx.runQuery(internal.fees.takeable, {
      floatUsdt,
      usdPerUsdt,
    })) as SweepPlan;

    if (plan.blockedBy || plan.amountUsdt <= 0) {
      return { skipped: true, reason: plan.blockedBy ?? "nothing takeable", plan };
    }
    if (args.dryRun) return { dryRun: true as const, plan };

    /*
     * Take the lease before opening the row, and hold it across the broadcast.
     * The payout path uses the same key; without this, a sweep and a withdrawal
     * can build transactions against the same nonce and one of them is dropped.
     */
    const lease = (await ctx.runMutation(internal.sendLock.acquire, {
      key: AGENT_WALLET_LOCK,
      ttlMs: 120_000,
    })) as { acquired: boolean; token?: string; retryInMs?: number };

    if (!lease.acquired) {
      // A payout is mid-flight. Fees can wait; a player cannot.
      return { skipped: true, reason: "agent wallet busy", plan };
    }

    const sweepId = (await ctx.runMutation(internal.fees.openSweep, {
      amountUsdt: plan.amountUsdt,
      toAddress: to,
    })) as Id<"feeSweeps">;

    try {
      const amount = ethers.parseUnits(plan.amountUsdt.toFixed(decimals), decimals);
      const tx = await token.transfer(to, amount);
      const receipt = await tx.wait();

      if (receipt?.status !== 1) {
        await ctx.runMutation(internal.fees.closeSweep, {
          sweepId,
          error: `transfer reverted in block ${receipt?.blockNumber}`,
        });
        return { swept: false as const, reason: "reverted" };
      }

      await ctx.runMutation(internal.fees.closeSweep, { sweepId, txHash: tx.hash });
      console.log(
        `[aurum-rail] swept ${plan.amountUsdt} USDT of fees to ${to} (${tx.hash}).`,
      );
      return { swept: true as const, amountUsdt: plan.amountUsdt, txHash: tx.hash };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      /*
       * A nonce conflict means somebody else was signing with this key despite
       * the lease — worth naming distinctly, because the fix is to find that
       * sender, not to retry harder.
       */
      await ctx.runMutation(internal.fees.closeSweep, {
        sweepId,
        error: isNonceConflict(e) ? `nonce conflict: ${message}` : message,
      });
      return { swept: false as const, error: message };
    } finally {
      await ctx.runMutation(internal.sendLock.release, {
        key: AGENT_WALLET_LOCK,
        token: lease.token!,
      });
    }
  },
});
