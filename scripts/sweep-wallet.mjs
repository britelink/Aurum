#!/usr/bin/env node
/**
 * Move a token balance out of a wallet you are retiring.
 *
 * Written for the handover from the old agent wallet to the Penny Game wallet,
 * but deliberately general: it takes the key and the destination as arguments
 * rather than hard-coding a migration that happens once.
 *
 * The key is read from the **environment**, never from a command-line flag.
 * Arguments end up in shell history, in `ps` output and in any terminal
 * recording; an env var assigned inline does not persist the same way. It is a
 * small difference and it is the difference between a key you rotated and a key
 * somebody can still read next week.
 *
 * Sends the **whole** token balance. A partial sweep leaves dust in a wallet
 * nobody is watching any more, which is how a retired address quietly keeps
 * hold of money — and the point of retiring one is that it stops mattering.
 *
 * Usage
 *   SWEEP_KEY=0x… node scripts/sweep-wallet.mjs --to 0x… [--asset USDT]
 *   SWEEP_KEY=0x… node scripts/sweep-wallet.mjs --to 0x… --confirm
 *
 * Without --confirm it reports what it would do and sends nothing.
 */

import { ethers } from "ethers";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const CONFIRM = argv.includes("--confirm");
const TO = flag("to");
const ASSET = (flag("asset") || "USDT").toUpperCase();

const RPC =
  process.env.AURUM_BSC_RPC_URL?.split(",")[0]?.trim() ||
  "https://bsc-rpc.publicnode.com";

const TOKENS = {
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
};

const ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

const key = process.env.SWEEP_KEY?.trim();
if (!key) {
  die(
    "Set SWEEP_KEY to the private key of the wallet being emptied, e.g.\n" +
      "    SWEEP_KEY=0xabc… node scripts/sweep-wallet.mjs --to 0xdef…",
  );
}
if (!TO || !/^0x[a-fA-F0-9]{40}$/.test(TO)) {
  die("Pass --to with the destination address (0x + 40 hex).");
}
if (!TOKENS[ASSET]) {
  die(`Unknown asset ${ASSET}. Use USDT or USDC.`);
}

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(key, provider);
const token = new ethers.Contract(TOKENS[ASSET], ABI, wallet);

if (wallet.address.toLowerCase() === TO.toLowerCase()) {
  die("Source and destination are the same wallet — nothing to sweep.");
}

const decimals = Number(await token.decimals());
const raw = await token.balanceOf(wallet.address);
const balance = ethers.formatUnits(raw, decimals);
const gas = await provider.getBalance(wallet.address);

console.log(`
  from     ${wallet.address}
  to       ${TO}
  asset    ${ASSET}
  balance  ${balance}
  gas      ${ethers.formatEther(gas)} BNB
`);

if (raw === 0n) die("Nothing to sweep — the balance is zero.");

/*
 * A BEP-20 transfer is ~60k gas. Checking first turns "transaction failed" into
 * a sentence naming the missing thing, which matters on a wallet somebody is
 * about to stop paying attention to.
 */
const fee = await provider.getFeeData();
const needed = (fee.gasPrice ?? 0n) * 80000n;
if (gas < needed) {
  die(
    `Not enough BNB for gas: has ${ethers.formatEther(gas)}, ` +
      `needs about ${ethers.formatEther(needed)}. Send a little BNB to ${wallet.address} first.`,
  );
}

if (!CONFIRM) {
  console.log("  Nothing sent. Re-run with --confirm to move the full balance.\n");
  process.exit(0);
}

console.log("  sending…");
const tx = await token.transfer(TO, raw);
console.log(`  tx       ${tx.hash}`);
console.log(`  explorer https://bscscan.com/tx/${tx.hash}`);

const receipt = await tx.wait();
console.log(
  `  ${receipt.status === 1 ? "confirmed" : "FAILED"} in block ${receipt.blockNumber}\n`,
);
process.exit(receipt.status === 1 ? 0 : 1);
