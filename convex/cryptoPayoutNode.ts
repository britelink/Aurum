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
  isNonceConflict,
  tokenAddresses,
  type RailAsset,
} from "./railLib";
import { AGENT_WALLET_LOCK } from "./sendLock";

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

    /*
     * One sender at a time from this wallet.
     *
     * `claimForSending` stops the *same* payout going twice; it says nothing
     * about two different payouts broadcasting together, which is the case that
     * collides on the nonce. If the lease is held, put this payout back in
     * `queued` and try shortly — losing the lease is a wait, not a failure, and
     * must not refund a player whose money never moved.
     */
    const lease = (await ctx.runMutation(internal.sendLock.acquire, {
      key: AGENT_WALLET_LOCK,
    })) as { acquired: boolean; token?: string; retryInMs?: number };
    if (!lease.acquired) {
      await ctx.runMutation(internal.cryptoWithdrawals.returnToQueue, {
        payoutId,
      });
      await ctx.scheduler.runAfter(
        Math.min(lease.retryInMs ?? 5_000, 30_000),
        internal.cryptoPayoutNode.sendCryptoPayout,
        { payoutId },
      );
      return { skipped: true, reason: "wallet busy" };
    }

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

      /*
       * Send with an explicit nonce, and retry if the chain says it was taken.
       *
       * SGX signs from this same wallet on its own schedule, so between reading
       * the pending nonce and broadcasting, it may have used it. Every error
       * `isNonceConflict` matches is a transaction the node **refused** — it
       * never entered the mempool — which is what makes retrying safe here.
       * Anything else falls straight through to the catch and is never retried,
       * because a transaction that did reach the mempool must not be sent twice.
       */
      let lastNonceError: unknown = null;
      for (let attempt = 0; attempt < 3 && !txHash; attempt++) {
        const nonce = await provider.getTransactionCount(
          wallet.address,
          "pending",
        );
        try {
          const tx = await contract.transfer(row.toAddress, amount, { nonce });
          txHash = tx.hash as string;
        } catch (err) {
          if (!isNonceConflict(err)) throw err;
          lastNonceError = err;
          console.warn(
            `[aurum-rail] payout ${payoutId}: nonce ${nonce} taken (attempt ${attempt + 1}), refetching`,
          );
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      if (!txHash) throw lastNonceError ?? new Error("Could not claim a nonce");

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
    } finally {
      if (lease.token) {
        await ctx.runMutation(internal.sendLock.release, {
          key: AGENT_WALLET_LOCK,
          token: lease.token,
        });
      }
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
