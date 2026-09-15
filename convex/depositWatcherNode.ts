"use node";
/**
 * Aurum inbound rail — on-chain deposit watcher.
 *
 * Reads ERC-20 Transfer logs into the agent wallet (the same wallet the payout
 * rail signs from), matches each transfer to an open deposit by its unique
 * payable amount, and moves the deposit detected → confirmed.
 *
 * Runs on a cron. Every tick is idempotent: transfers are deduped by tx hash
 * and a deposit is only credited once.
 *
 * Ported from SGX Pay's `merchantWatcherNode.ts`, including the durability
 * rules it was written to uphold — each of which is a production incident:
 *
 *  - The cursor is written as soon as a starting point is chosen, and again
 *    after every chunk that fully succeeds. A tick that dies partway resumes
 *    from the last chunk it finished rather than restarting from `latest`.
 *    Without this a persistently failing RPC meant the cursor was never written
 *    at all, so every tick re-scanned the same recent blocks forever and no
 *    deposit older than a couple of minutes could ever be seen.
 *  - A chunk only advances the cursor once *every* token has been read for it,
 *    so one token rate-limiting can never skip a range for the others.
 *  - Every address the rail has ever quoted stays watched. The moment a
 *    treasury moves, money sent to the old one becomes invisible otherwise:
 *    quotes issued before the switch still name it, and wallets send from saved
 *    addresses. SGX had 695 USDT stranded at a retired address when this rule
 *    was written.
 */
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  INBOUND_CHAIN,
  KNOWN_DECIMALS,
  RAIL_ASSETS,
  agentPrivateKey,
  bscRpcUrls,
  roundAmount,
  tokenAddresses,
} from "./railLib";

const LAST_BLOCK_KEY = "watcherLastBlock";
const DEPOSIT_ADDRESS_KEY = "depositAddress";
const DEPOSIT_ADDRESS_HISTORY_KEY = "depositAddressHistory";

/** Never scan more than this many blocks in one tick. */
const MAX_BLOCK_SPAN = 20_000;
/** Blocks per `eth_getLogs` call. Public RPCs reject or throttle wide ranges. */
const CHUNK_SIZE = 500;
/**
 * Cold start: how far back to look the very first time. BSC blocks are
 * sub-second, so a few hundred covers under two minutes and makes a first run
 * useless. ~6h of blocks is cheap to scan once and only happens when the
 * cursor is missing.
 */
const COLD_START_LOOKBACK = 40_000;
/** Attempts per RPC call before giving up on the chunk. */
const MAX_ATTEMPTS = 4;
/**
 * Below this a transfer is address-poisoning spam, not a deposit. A shared
 * wallet is a standing target and the smallest deposit the rail quotes is two
 * orders of magnitude above this.
 */
const DUST_THRESHOLD = 0.01;

const isLive = process.env.IS_LIVE === "true";
const TOKENS = tokenAddresses(isLive);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reject if an endpoint has not answered in time.
 *
 * A refusal is an error and gets caught; silence is not, and silence is what a
 * degraded public endpoint actually does. Without a deadline the first quiet
 * provider in the list holds the tick open until the platform kills it, and
 * every endpoint behind it is never tried. It looks exactly like a cron that is
 * not running — and it is not: it is waiting.
 */
function withEndpointDeadline<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not answer in ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([work, deadline]).finally(() =>
    clearTimeout(timer),
  ) as Promise<T>;
}

export const watchInboundDeposits = internalAction({
  args: {},
  handler: async (ctx) => {
    const { ethers } = await import("ethers");

    // The deposit address is the agent wallet unless an override is set.
    const override = process.env.AURUM_DEPOSIT_ADDRESS?.trim();
    let depositAddress: string;
    if (override && /^0x[a-fA-F0-9]{40}$/.test(override)) {
      depositAddress = ethers.getAddress(override);
    } else {
      const key = agentPrivateKey();
      if (!key) {
        console.warn(
          "[aurum-rail] watcher: set AURUM_AGENT_PRIVATE_KEY or AURUM_DEPOSIT_ADDRESS",
        );
        return { skipped: "no-deposit-address" };
      }
      depositAddress = new ethers.Wallet(key).address;
    }

    const previous = (await ctx.runQuery(internal.deposits.getConfig, {
      key: DEPOSIT_ADDRESS_KEY,
    })) as string | null;
    const historyRaw = (await ctx.runQuery(internal.deposits.getConfig, {
      key: DEPOSIT_ADDRESS_HISTORY_KEY,
    })) as string | null;

    let history: string[] = [];
    try {
      const parsed = historyRaw ? (JSON.parse(historyRaw) as unknown) : [];
      if (Array.isArray(parsed)) {
        history = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      history = [];
    }

    const known = new Set(history.map((a) => a.toLowerCase()));
    for (const candidate of [previous, depositAddress]) {
      if (
        candidate &&
        /^0x[a-fA-F0-9]{40}$/.test(candidate) &&
        !known.has(candidate.toLowerCase())
      ) {
        history.push(ethers.getAddress(candidate));
        known.add(candidate.toLowerCase());
      }
    }
    await ctx.runMutation(internal.deposits.setConfig, {
      key: DEPOSIT_ADDRESS_HISTORY_KEY,
      value: JSON.stringify(history),
    });

    // New quotes always name the current address; the rest are watched only so
    // money already sent to them is still seen and credited.
    const watchedAddresses = history.length > 0 ? history : [depositAddress];

    // Cache it so `createDeposit` (plain runtime, no ethers) can quote it.
    await ctx.runMutation(internal.deposits.setConfig, {
      key: DEPOSIT_ADDRESS_KEY,
      value: depositAddress,
    });

    let provider: InstanceType<typeof ethers.JsonRpcProvider> | null = null;
    let latestBlock = 0;
    for (const url of bscRpcUrls(isLive)) {
      const host = new URL(url).host;
      try {
        const candidate = new ethers.JsonRpcProvider(url);
        latestBlock = await withEndpointDeadline(
          candidate.getBlockNumber(),
          6000,
          host,
        );
        provider = candidate;
        break;
      } catch (e) {
        console.warn(
          `[aurum-rail] watcher: RPC unreachable (${host})`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    if (!provider) {
      console.error(
        "[aurum-rail] watcher: every RPC endpoint failed; set AURUM_BSC_RPC_URL",
      );
      return { skipped: "rpc-unavailable" };
    }

    const stored = (await ctx.runQuery(internal.deposits.getConfig, {
      key: LAST_BLOCK_KEY,
    })) as string | null;
    const lastChecked = stored ? parseInt(stored, 10) : NaN;
    const coldStart = !Number.isFinite(lastChecked);
    const fromBlock = coldStart
      ? Math.max(latestBlock - COLD_START_LOOKBACK, 0)
      : lastChecked + 1;

    // Persist the starting point straight away. If this tick then fails, the
    // next one resumes here instead of cold-starting at `latest` again and
    // silently skipping everything in between.
    if (coldStart) {
      await ctx.runMutation(internal.deposits.setConfig, {
        key: LAST_BLOCK_KEY,
        value: String(fromBlock - 1),
      });
    }

    if (fromBlock > latestBlock) {
      await promoteDetected(ctx, latestBlock);
      return { skipped: "up-to-date", latestBlock };
    }
    const targetBlock = Math.min(latestBlock, fromBlock + MAX_BLOCK_SPAN);

    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    // An array in a topic position is an OR, so every watched address is
    // covered by the same call — no extra RPC cost for watching the old ones.
    const toTopics = watchedAddresses.map((a) =>
      ethers.zeroPadValue(a.toLowerCase(), 32),
    );
    const addressForTopic = new Map(
      watchedAddresses.map((a) => [
        ethers.zeroPadValue(a.toLowerCase(), 32).toLowerCase(),
        a,
      ]),
    );
    const iface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ]);

    type Log = {
      transactionHash: string;
      blockNumber: number;
      topics: string[];
      data: string;
    };

    /** One `eth_getLogs`, retried with backoff. Null means the chunk failed. */
    const getLogs = async (
      tokenAddress: string,
      a: number,
      b: number,
    ): Promise<Log[] | null> => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          return (await provider!.getLogs({
            fromBlock: a,
            toBlock: b,
            address: tokenAddress,
            topics: [transferTopic, null, toTopics],
          })) as never;
        } catch (e) {
          if (attempt === MAX_ATTEMPTS) {
            console.warn(
              `[aurum-rail] watcher: getLogs ${a}-${b} failed after ${attempt} attempts`,
              e instanceof Error ? e.message : e,
            );
            return null;
          }
          await sleep(400 * 2 ** (attempt - 1));
        }
      }
      return null;
    };

    let matched = 0;
    let unmatched = 0;
    let cursor = fromBlock - 1;
    let stoppedEarly = false;

    for (let a = fromBlock; a <= targetBlock; a += CHUNK_SIZE) {
      const b = Math.min(a + CHUNK_SIZE - 1, targetBlock);

      // Read every token for this chunk before committing to it, so a failure
      // on one token cannot advance the cursor past a range the others missed.
      const perToken: Array<{ symbol: string; logs: Log[] }> = [];
      let chunkOk = true;
      for (const symbol of RAIL_ASSETS) {
        const logs = await getLogs(TOKENS[symbol], a, b);
        if (logs === null) {
          chunkOk = false;
          break;
        }
        perToken.push({ symbol, logs });
      }
      if (!chunkOk) {
        stoppedEarly = true;
        break;
      }

      for (const { symbol, logs } of perToken) {
        for (const log of logs) {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (!parsed) continue;

          const txHash = log.transactionHash;
          const seen = (await ctx.runQuery(
            internal.deposits.isTxAlreadyRecorded,
            { txHash },
          )) as boolean;
          if (seen) continue;

          const amount = roundAmount(
            parseFloat(
              ethers.formatUnits(
                parsed.args.value,
                KNOWN_DECIMALS[symbol] ?? 18,
              ),
            ),
          );
          const fromAddress = (parsed.args.from as string).toLowerCase();
          const confirmations = Math.max(latestBlock - log.blockNumber + 1, 0);

          const deposit = (await ctx.runQuery(
            internal.deposits.findOpenDepositByAmount,
            { asset: symbol, amount, fromAddress },
          )) as Doc<"cryptoDeposits"> | null;

          if (!deposit) {
            // Filing spam as unmatched buries the real unattributed payments an
            // operator needs to find, and no quote is ever this small anyway.
            if (amount < DUST_THRESHOLD) continue;
            unmatched++;
            await ctx.runMutation(internal.deposits.recordUnmatchedDeposit, {
              txHash,
              fromAddress,
              amountToken: String(amount),
              symbol,
              chain: INBOUND_CHAIN,
              // Which wallet it actually landed on, not whichever is current —
              // a retired address is exactly where the awkward deposits turn
              // up, and the books need to say so.
              depositAddress:
                addressForTopic.get(log.topics[2]?.toLowerCase()) ??
                depositAddress,
              blockNumber: log.blockNumber,
            });
            continue;
          }

          matched++;
          await ctx.runMutation(internal.deposits.recordDeposit, {
            depositId: deposit._id,
            txHash,
            blockNumber: log.blockNumber,
            amount,
            fromAddress,
            confirmations,
          });
        }
      }

      // Chunk fully scanned for every token — safe to remember.
      cursor = b;
      await ctx.runMutation(internal.deposits.setConfig, {
        key: LAST_BLOCK_KEY,
        value: String(cursor),
      });
    }

    const confirmed = await promoteDetected(ctx, latestBlock);

    return {
      fromBlock,
      scannedTo: cursor,
      targetBlock,
      latestBlock,
      matched,
      unmatched,
      confirmed,
      stoppedEarly,
    };
  },
});

/** Second pass: promote detected deposits that now have enough confirmations. */
async function promoteDetected(
  ctx: { runQuery: Function; runMutation: Function },
  latestBlock: number,
): Promise<number> {
  const detected = (await ctx.runQuery(
    internal.deposits.listDetected,
    {},
  )) as Doc<"cryptoDeposits">[];
  let confirmed = 0;
  for (const row of detected) {
    if (row.blockNumber === undefined) continue;
    const confirmations = Math.max(latestBlock - row.blockNumber + 1, 0);
    // Below the threshold this just records progress; at or above it credits.
    const res = (await ctx.runMutation(internal.deposits.confirmDeposit, {
      depositId: row._id,
      confirmations,
    })) as { ok: boolean };
    if (res.ok) confirmed++;
  }
  return confirmed;
}
