"use node";

/**
 * The crypto leg of an EcoCash deposit: reserve → player float.
 *
 * Ported from SGX's `web3.ts`, which sends USDT from its treasury once Pesepay
 * confirms. Aurum sits on both ends of that transfer: the player pays EcoCash
 * into our Pesepay account, and the matching USDT moves from the **reserve**
 * wallet into the **agent** wallet that backs player balances.
 *
 * Why bother moving tokens between two wallets we both control: it is what
 * makes a balance real. Without it an EcoCash deposit credits a number backed
 * by cash sitting at Pesepay, while withdrawals pay out of the agent wallet —
 * so net EcoCash-in / crypto-out quietly drains the float and nothing on chain
 * says it is happening. With it, the agent wallet always holds what the
 * platform owes, the fiat accumulating at Pesepay is visibly the reserve's
 * money to reclaim, and the rebalancing is a settlement rather than a rescue.
 *
 * The credit is **not** conditional on this transfer. A player who has paid
 * gets their balance immediately; a reserve that is empty or out of gas is the
 * platform's problem, not theirs. A failed release is logged loudly and left
 * for an operator — it is an accounting shortfall, never a reason to hold
 * somebody's money.
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
} from "./railLib";
import { AGENT_WALLET_LOCK } from "./sendLock";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
];

/**
 * The wallet the crypto comes *from*.
 *
 * Distinct from `agentPrivateKey()`, which is the wallet it goes *to*. Named
 * explicitly so a deployment that points both at the same key is obvious rather
 * than silently self-transferring.
 */
function reservePrivateKey(): string | undefined {
  return (
    process.env.AURUM_RESERVE_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim() ||
    undefined
  );
}

export const releaseForEcocashDeposit = internalAction({
  args: { depositId: v.id("cryptoDeposits") },
  handler: async (ctx, { depositId }) => {
    const row = (await ctx.runQuery(
      internal.pesepayDepositInternal.getDeposit,
      { depositId },
    )) as Doc<"cryptoDeposits"> | null;

    // Only a paid EcoCash deposit, and only once.
    if (!row || row.status !== "confirmed" || row.onrampProvider !== "pesepay") {
      return { skipped: true };
    }
    if (row.txHash) return { skipped: true, reason: "already released" };

    const note = async (error: string) => {
      await ctx.runMutation(internal.pesepayDepositInternal.markReleaseFailed, {
        depositId,
        error,
      });
      console.error(`[aurum-rail] reserve release for ${row.reference}: ${error}`);
    };

    const reserveKey = reservePrivateKey();
    const agentKey = agentPrivateKey();
    if (!reserveKey) {
      await note("No reserve wallet configured (AURUM_RESERVE_PRIVATE_KEY).");
      return { failed: true };
    }

    const { ethers } = await import("ethers");
    const reserve = new ethers.Wallet(reserveKey);
    const destination =
      process.env.AURUM_DEPOSIT_ADDRESS?.trim() ||
      (agentKey ? new ethers.Wallet(agentKey).address : null);

    if (!destination) {
      await note("No agent wallet configured to release into.");
      return { failed: true };
    }
    if (destination.toLowerCase() === reserve.address.toLowerCase()) {
      /*
       * Same wallet on both ends. The transfer would burn gas to move money to
       * itself and prove nothing, so it is skipped — but said out loud, because
       * it means balances are not reserve-backed and somebody should know.
       */
      await note(
        "Reserve and agent wallet are the same address — nothing to release. " +
          "Set AURUM_RESERVE_PRIVATE_KEY to a separate funded wallet.",
      );
      return { skipped: true, reason: "same wallet" };
    }

    // Serialise against every other sender: the reserve and the agent wallet
    // share a chain, and two transfers racing is the same nonce problem.
    const lease = (await ctx.runMutation(internal.sendLock.acquire, {
      key: AGENT_WALLET_LOCK,
    })) as { acquired: boolean; token?: string; retryInMs?: number };
    if (!lease.acquired) {
      await ctx.scheduler.runAfter(
        Math.min(lease.retryInMs ?? 5_000, 30_000),
        internal.reserveReleaseNode.releaseForEcocashDeposit,
        { depositId },
      );
      return { deferred: true };
    }

    try {
      const provider = new ethers.JsonRpcProvider(
        bscRpcUrls(process.env.IS_LIVE === "true")[0],
      );
      const signer = new ethers.Wallet(reserveKey, provider);
      const token = tokenAddresses(process.env.IS_LIVE === "true").USDT;
      const contract = new ethers.Contract(token, ERC20_ABI, signer);

      const decimals = Number(await contract.decimals());
      const amount = ethers.parseUnits(
        row.amountRequested.toFixed(6),
        decimals,
      );

      const held: bigint = await contract.balanceOf(signer.address);
      if (held < amount) {
        await note(
          `Reserve holds ${ethers.formatUnits(held, decimals)} USDT, needs ${row.amountRequested}. ` +
            "The player was credited; top up the reserve and re-run the release.",
        );
        return { failed: true, reason: "reserve short" };
      }

      let txHash: string | null = null;
      let lastNonceError: unknown = null;
      for (let attempt = 0; attempt < 3 && !txHash; attempt++) {
        const nonce = await provider.getTransactionCount(
          signer.address,
          "pending",
        );
        try {
          const tx = await contract.transfer(destination, amount, { nonce });
          txHash = tx.hash as string;
        } catch (err) {
          if (!isNonceConflict(err)) throw err;
          lastNonceError = err;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      if (!txHash) throw lastNonceError ?? new Error("Could not claim a nonce");

      await ctx.runMutation(internal.pesepayDepositInternal.markReleased, {
        depositId,
        txHash,
      });
      return { released: true, txHash, amount: row.amountRequested };
    } catch (e) {
      await note(e instanceof Error ? e.message : String(e));
      return { failed: true };
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

/** Reserve health, for the admin panel — the number that limits EcoCash deposits. */
export const reserveBalance = internalAction({
  args: {},
  handler: async () => {
    const key = reservePrivateKey();
    if (!key) return { configured: false as const };
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(
      bscRpcUrls(process.env.IS_LIVE === "true")[0],
    );
    const wallet = new ethers.Wallet(key, provider);
    const token = tokenAddresses(process.env.IS_LIVE === "true").USDT;
    const c = new ethers.Contract(token, ERC20_ABI, provider);
    let usdt = NaN;
    let bnb = NaN;
    try {
      usdt = parseFloat(
        ethers.formatUnits(await c.balanceOf(wallet.address), 18),
      );
    } catch {
      /* leave NaN */
    }
    try {
      bnb = parseFloat(
        ethers.formatEther(await provider.getBalance(wallet.address)),
      );
    } catch {
      /* leave NaN */
    }
    return { configured: true as const, address: wallet.address, usdt, bnb };
  },
});
