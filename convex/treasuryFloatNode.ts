"use node";

/**
 * Read what the payout wallet holds, and write it down.
 *
 * Exists because `floatGate` has to answer "can we pay this?" inside a
 * mutation, and a mutation cannot reach a chain. So the chain is read here, on
 * a cron, and the answer is cached for the gate to consult.
 *
 * A cached reading is a compromise and worth naming as one: it can be wrong for
 * as long as the interval. The gate handles that by refusing to act on a stale
 * reading at all — see `MAX_SNAPSHOT_AGE_MS`. The failure mode that matters is
 * not "we were a few minutes out of date", it is "the cron died and we kept
 * believing a number from Tuesday".
 *
 * Which is also why a failed read does **not** overwrite the snapshot with
 * zero. Zero is a claim about the wallet; an RPC refusing to answer is a claim
 * about the RPC. Writing the first when we only know the second would close
 * withdrawals over somebody else's outage — and, worse, would look exactly like
 * a drained treasury to anyone reading the logs.
 */

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { agentPrivateKey } from "./railLib";
import { FLOAT_SNAPSHOT_KEY } from "./floatGate";

const USDT_BEP20 = "0x55d398326f99059fF775485246999027B3197955";
const ABI = ["function balanceOf(address owner) view returns (uint256)"];

export const snapshotFloat = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; usdt?: number; bnb?: number; reason?: string }> => {
    const key = agentPrivateKey();
    const configured = process.env.AURUM_DEPOSIT_ADDRESS?.trim();

    const { ethers } = await import("ethers");
    let address: string | null = configured ?? null;
    if (!address && key) {
      try {
        address = new ethers.Wallet(key).address;
      } catch {
        address = null;
      }
    }
    if (!address) return { ok: false, reason: "no payout wallet configured" };

    try {
      const rpc =
        process.env.AURUM_BSC_RPC_URL?.split(",")[0]?.trim() ||
        "https://bsc-rpc.publicnode.com";
      const provider = new ethers.JsonRpcProvider(rpc);
      const token = new ethers.Contract(USDT_BEP20, ABI, provider);

      const [rawUsdt, rawBnb] = await Promise.all([
        token.balanceOf(address),
        provider.getBalance(address),
      ]);

      const usdt = Number(ethers.formatUnits(rawUsdt, 18));
      const bnb = Number(ethers.formatEther(rawBnb));

      await ctx.runMutation(internal.deposits.setConfig, {
        key: FLOAT_SNAPSHOT_KEY,
        value: JSON.stringify({ usdt, bnb, address, at: Date.now() }),
      });

      return { ok: true, usdt, bnb };
    } catch (e) {
      /*
       * Leave the previous reading alone and let it age out. The gate closes on
       * staleness by itself, so an outage still stops payouts — it just does it
       * for the honest reason rather than by inventing a balance.
       */
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[aurum-rail] float snapshot failed: ${message}`);
      return { ok: false, reason: message };
    }
  },
});
