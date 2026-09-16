"use node";

/**
 * BEP-20 USDT from Penny treasury → Chessa payment address (when Chessa order network is BSC).
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { agentPrivateKey, isNonceConflict } from "./railLib";
import { AGENT_WALLET_LOCK } from "./sendLock";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

export const sendUsdtToChessaPayment = internalAction({
  args: { payoutId: v.id("ecocashPayouts") },
  handler: async (ctx, { payoutId }) => {
    const p = await ctx.runQuery(internal.withdrawals.getPayoutForAction, {
      payoutId,
    });
    if (!p) return;
    if (p.status !== "sgx_submitted" || p.tronFloatTxid) return;

    if (!p.sgxPaymentAddress || p.sgxSendAmount == null) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: "Treasury BEP20: payout missing payment address or send amount",
      });
      return;
    }

    /*
     * The agent wallet, under whichever name it is configured.
     *
     * This read only `PENNY_TREASURY_BEP20_PRIVATE_KEY`, which is not set on
     * production — so every EcoCash payout that Chessa quoted a BSC address for
     * died here with "set PENNY_TREASURY_BEP20_PRIVATE_KEY", a message about a
     * variable nobody uses any more. `agentPrivateKey()` is the one resolver
     * the rest of the rail already goes through.
     */
    const privateKey = agentPrivateKey();
    if (!privateKey) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error:
          "Agent wallet is not configured: set AURUM_AGENT_PRIVATE_KEY on Convex.",
      });
      return;
    }

    // @ts-ignore — ethers is a Node dependency for this action only
    const { ethers } = require("ethers") as typeof import("ethers");

    const bscUsdt =
      process.env.PENNY_BSC_USDT_CONTRACT?.trim() ||
      "0x55d398326f99059fF775485246999027B3197955";
    const bscRpc =
      process.env.PENNY_BSC_RPC_URL?.trim() || "https://bsc-dataseed.binance.org/";

    const provider = new ethers.JsonRpcProvider(bscRpc);
    const wallet = new ethers.Wallet(privateKey, provider);
    const expectedFrom =
      process.env.AURUM_AGENT_WALLET_ADDRESS?.trim() ||
      process.env.PENNY_TREASURY_BEP20_ADDRESS?.trim();
    if (expectedFrom && wallet.address.toLowerCase() !== expectedFrom.toLowerCase()) {
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error:
          "Treasury BEP20: private key does not match the configured agent wallet address",
      });
      return;
    }

    const contract = new ethers.Contract(bscUsdt, ERC20_ABI, wallet);
    const decimals = await contract.decimals();
    const amount = ethers.parseUnits(
      String(p.sgxSendAmount),
      Number(decimals),
    );

    try {
      const tx = await contract.transfer(p.sgxPaymentAddress.trim(), amount);
      const txHash = tx.hash as string;
      await ctx.runMutation(internal.withdrawals.markTreasuryFundingSuccess, {
        payoutId,
        tronFloatTxid: txHash,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.withdrawals.markPayoutFailed, {
        payoutId,
        error: `Treasury BEP20 send failed: ${msg}`,
      });
    }
  },
});
