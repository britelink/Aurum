"use node";
/**
 * Aurum outbound rail — the actual BEP-20 transfer.
 *
 * Signs from the agent wallet: the same wallet inbound deposits land in, so the
 * float a player deposits is the float another player is paid from and there is
 * no separate treasury to keep topped up.
 *
 * Two rules this file exists to hold:
 *
 *  - Claim before send. `queued → sending` is won by exactly one run, so a
 *    retried or overlapping invocation cannot broadcast a second transfer. On
 *    chain there is no undo.
 *  - Only fail a payout that definitely did not go out. Anything after the
 *    transaction has been broadcast is left in `sending` for a person to
 *    reconcile against the chain, because refunding a payout that actually
 *    landed pays the player twice.
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  agentPrivateKey,
  bscRpcUrls,
  tokenAddresses,
  type RailAsset,
} from "./railLib";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
];

/** One endpoint is enough to broadcast a signed transfer; take the best. */
function rpcUrl(): string {
  return bscRpcUrls(process.env.IS_LIVE === "true")[0];
}

export const sendCryptoPayout = internalAction({
  args: { payoutId: v.id("cryptoPayouts") },
  handler: async (ctx, { payoutId }) => {
    const row = (await ctx.runQuery(
      internal.cryptoWithdrawals.getPayoutForAction,
      { payoutId },
    )) as Doc<"cryptoPayouts"> | null;
    if (!row || row.status !== "queued") return { skipped: true };

    const fail = async (error: string) => {
      await ctx.runMutation(internal.cryptoWithdrawals.markPayoutFailed, {
        payoutId,
        error,
      });
    };

    const privateKey = agentPrivateKey();
    if (!privateKey) {
      await fail(
        "Agent wallet is not configured: set AURUM_AGENT_PRIVATE_KEY on Convex.",
      );
      return { failed: true };
    }

    // Claim it before anything can be broadcast. Losing this race means another
    // run already owns the payout; do nothing rather than send it twice.
    const claim = (await ctx.runMutation(
      internal.cryptoWithdrawals.claimForSending,
      { payoutId },
    )) as { claimed: boolean; reason?: string };
    if (!claim.claimed) return { skipped: true, reason: claim.reason };

    const { ethers } = await import("ethers");

    let txHash: string | null = null;
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl());
      const wallet = new ethers.Wallet(privateKey, provider);

      const expected = process.env.AURUM_AGENT_WALLET_ADDRESS?.trim();
      if (expected && wallet.address.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(
          "Agent private key does not match AURUM_AGENT_WALLET_ADDRESS",
        );
      }

      const tokens = tokenAddresses(process.env.IS_LIVE === "true");
      const tokenAddress = tokens[row.asset as RailAsset];
      if (!tokenAddress) throw new Error(`No contract for asset ${row.asset}`);

      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      const decimals = Number(await contract.decimals());
      const amount = ethers.parseUnits(row.amountToken.toFixed(6), decimals);

      // Check the float before broadcasting. A revert costs gas and tells the
      // player nothing; "the house is short" is a sentence an operator can act
      // on, and the refund puts the money back where the player left it.
      const balance: bigint = await contract.balanceOf(wallet.address);
      if (balance < amount) {
        throw new Error(
          `Agent wallet holds ${ethers.formatUnits(balance, decimals)} ${row.asset}, ` +
            `needs ${row.amountToken}. Top up the float and retry.`,
        );
      }

      const tx = await contract.transfer(row.toAddress, amount);
      txHash = tx.hash as string;

      await ctx.runMutation(internal.cryptoWithdrawals.markPayoutSent, {
        payoutId,
        txHash,
      });
      return { sent: true, txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (txHash) {
        /*
         * The transfer is already on the wire. Refunding here would credit the
         * player for money that is also arriving in their wallet, so the row
         * stays in `sending` with the hash attached and a person reconciles it
         * against the chain.
         */
        await ctx.runMutation(internal.cryptoWithdrawals.markPayoutSent, {
          payoutId,
          txHash,
        });
        console.error(
          `[aurum-rail] payout ${payoutId} broadcast as ${txHash} but then failed: ${msg}`,
        );
        return { sent: true, txHash, warning: msg };
      }
      await fail(`Crypto payout failed: ${msg}`);
      return { failed: true, error: msg };
    }
  },
});

/**
 * The agent wallet's live float, for the admin page.
 *
 * Read-only: it derives the address from the key but never signs. The number
 * matters because every queued payout is drawn from it, and the first sign of
 * trouble is payouts failing one after another with "needs more than it holds".
 */
export const agentWalletBalance = internalAction({
  args: {},
  handler: async () => {
    const { ethers } = await import("ethers");
    const key = agentPrivateKey();
    const override = process.env.AURUM_DEPOSIT_ADDRESS?.trim();
    const address =
      override && /^0x[a-fA-F0-9]{40}$/.test(override)
        ? ethers.getAddress(override)
        : key
          ? new ethers.Wallet(key).address
          : null;
    if (!address) return { configured: false as const };

    const provider = new ethers.JsonRpcProvider(rpcUrl());
    const tokens = tokenAddresses(process.env.IS_LIVE === "true");
    const balances: Record<string, number> = {};
    for (const [symbol, tokenAddress] of Object.entries(tokens)) {
      try {
        const c = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const raw: bigint = await c.balanceOf(address);
        balances[symbol] = parseFloat(
          ethers.formatUnits(raw, Number(await c.decimals())),
        );
      } catch {
        balances[symbol] = NaN;
      }
    }
    let gas = 0;
    try {
      gas = parseFloat(ethers.formatEther(await provider.getBalance(address)));
    } catch {
      gas = NaN;
    }
    return { configured: true as const, address, balances, bnb: gas };
  },
});
