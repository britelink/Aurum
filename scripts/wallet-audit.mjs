#!/usr/bin/env node
/**
 * What do we actually hold, and can we spend it?
 *
 * Reads every private key this project has configured, derives the address it
 * controls, and reports the balance. Keys are read from `.env.local` and from
 * the environment — never from arguments, and **never printed**. Only addresses
 * and balances reach the terminal.
 *
 * The distinction it exists to draw is between money we *have* and money we can
 * *move*. A wallet holding tokens with no BNB cannot send them, and a wallet
 * holding tokens with no key is not ours at all — it is a number on a screen.
 * Both look identical on a balance sheet and neither is spendable, so both are
 * called out by name.
 *
 *   node scripts/wallet-audit.mjs
 *
 * To check a key that is not configured yet — a recovery candidate, say — add it
 * to .env.local as RECOVER_KEY and re-run. It is derived and checked like any
 * other, and reported by the address it turns out to control.
 */

import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";

const RPC =
  process.env.AURUM_BSC_RPC_URL?.split(",")[0]?.trim() ||
  "https://bsc-rpc.publicnode.com";

const TOKENS = {
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
};

const ABI = ["function balanceOf(address owner) view returns (uint256)"];

/** Addresses we know of but hold no key for. Worth naming: they are not ours. */
const WATCH_ONLY = {
  "PENNY_ONRAMP_WALLET_BEP20": "0x0d487685aa79fea908ef5973f0a076ac76ba7980",
  "old agent (key sought)": "0x8123181A3Ff5E60a4d8fd459C29d595016Cf94cF",
};

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").split(" #")[0].trim();
  }
  return out;
}

const env = {
  ...loadEnvFile(path.join(process.cwd(), ".env.local")),
  ...process.env,
};

/** A secp256k1 key is 0x + 64 hex, or bare 64 hex. Nothing else is one. */
function asEvmKey(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return `0x${v}`;
  return null;
}

const provider = new ethers.JsonRpcProvider(RPC);

async function report(label, address, hasKey) {
  const bnb = await provider.getBalance(address);
  const balances = {};
  for (const [sym, addr] of Object.entries(TOKENS)) {
    const c = new ethers.Contract(addr, ABI, provider);
    balances[sym] = Number(ethers.formatUnits(await c.balanceOf(address), 18));
  }

  const gas = Number(ethers.formatEther(bnb));
  const value = balances.USDT + balances.USDC;

  // ~60k gas at a generous price. Below this, tokens here cannot be moved.
  const canSend = gas >= 0.0001;

  const flags = [];
  if (!hasKey && value > 0) flags.push("NO KEY — cannot spend");
  if (hasKey && value > 0 && !canSend) flags.push("NO GAS — cannot send");

  console.log(
    `  ${label.padEnd(30)} ${address}\n` +
      `  ${"".padEnd(30)} ${balances.USDT.toFixed(2).padStart(10)} USDT  ` +
      `${balances.USDC.toFixed(2).padStart(8)} USDC  ` +
      `${gas.toFixed(6)} BNB${flags.length ? `   ← ${flags.join(", ")}` : ""}\n`,
  );

  return { value, gas, hasKey, canSend };
}

console.log(`\n  BSC wallet audit — ${new Date().toISOString().slice(0, 16)}\n`);

const seen = new Map();

for (const [name, value] of Object.entries(env)) {
  const key = asEvmKey(value);
  if (!key) continue;
  let address;
  try {
    address = new ethers.Wallet(key).address;
  } catch {
    continue;
  }
  // One wallet reached by two variable names is one wallet, not two.
  const prior = seen.get(address);
  if (prior) {
    seen.set(address, { ...prior, names: [...prior.names, name] });
  } else {
    seen.set(address, { names: [name], hasKey: true });
  }
}

for (const [address, meta] of seen) {
  await report(meta.names.join(" / "), address, true);
}

for (const [label, address] of Object.entries(WATCH_ONLY)) {
  if (seen.has(ethers.getAddress(address))) continue;
  await report(label, ethers.getAddress(address), false);
}

let total = 0;
let spendable = 0;

/*
 * Recomputed rather than accumulated above, because the interesting number is
 * not "what do we hold" but "what could we pay out with right now" — and those
 * differ by every wallet that is missing a key or missing gas.
 */
for (const [address, meta] of seen) {
  const c = new ethers.Contract(TOKENS.USDT, ABI, provider);
  const usdt = Number(ethers.formatUnits(await c.balanceOf(address), 18));
  const gas = Number(ethers.formatEther(await provider.getBalance(address)));
  total += usdt;
  if (meta.hasKey && gas >= 0.0001) spendable += usdt;
}
for (const address of Object.values(WATCH_ONLY)) {
  const a = ethers.getAddress(address);
  if (seen.has(a)) continue;
  const c = new ethers.Contract(TOKENS.USDT, ABI, provider);
  total += Number(ethers.formatUnits(await c.balanceOf(a), 18));
}

console.log(`  ${"─".repeat(60)}`);
console.log(`  held on BSC        ${total.toFixed(2)} USDT`);
console.log(`  spendable today    ${spendable.toFixed(2)} USDT`);
console.log(
  `  stuck              ${(total - spendable).toFixed(2)} USDT (no key or no gas)\n`,
);
console.log(
  "  Not covered here: Tron and Solana. Those keys use different curves and\n" +
    "  address formats; their balances are read separately.\n",
);
