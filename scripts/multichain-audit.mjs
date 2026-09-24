#!/usr/bin/env node
/**
 * The same wallet, on every chain it exists on.
 *
 * One secp256k1 key produces the same address on every EVM chain, and a
 * different-looking one on Tron from the same maths. A wallet provider that
 * lists fifty chains is listing fifty *networks*, not fifty wallets — so the
 * honest question is not "which wallet holds what" but "does this one address
 * hold anything anywhere".
 *
 * That matters because value stranded on a chain nobody is watching is
 * indistinguishable from value that was never there. Tokens bridged to the
 * wrong network, an exchange withdrawal sent over Arbitrum instead of BSC, a
 * test transfer on Polygon — all of it sits there quietly, and none of it shows
 * up in a balance check that only ever asks one chain.
 *
 * Reads the key from `.env.local`/env, never an argument. Nothing is printed
 * but addresses and balances.
 *
 *   node scripts/multichain-audit.mjs
 */

import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";

/**
 * Public endpoints, no key required.
 *
 * Chains are skipped rather than retried when one is unreachable: a free RPC
 * refusing a request says nothing about the balance, and a run that dies on
 * chain three tells you less than one that reports forty-seven.
 */
const EVM_CHAINS = [
  ["Ethereum", "https://ethereum-rpc.publicnode.com", "ETH"],
  ["BSC", "https://bsc-rpc.publicnode.com", "BNB"],
  ["Polygon", "https://polygon-bor-rpc.publicnode.com", "POL"],
  ["Arbitrum", "https://arbitrum-one-rpc.publicnode.com", "ETH"],
  ["Optimism", "https://optimism-rpc.publicnode.com", "ETH"],
  ["Base", "https://base-rpc.publicnode.com", "ETH"],
  ["Avalanche", "https://avalanche-c-chain-rpc.publicnode.com", "AVAX"],
  ["Linea", "https://linea-rpc.publicnode.com", "ETH"],
  ["Scroll", "https://scroll-rpc.publicnode.com", "ETH"],
  ["opBNB", "https://opbnb-rpc.publicnode.com", "BNB"],
  ["Celo", "https://celo-rpc.publicnode.com", "CELO"],
  ["Gnosis", "https://gnosis-rpc.publicnode.com", "xDAI"],
  ["Fantom", "https://fantom-rpc.publicnode.com", "FTM"],
  ["Sonic", "https://sonic-rpc.publicnode.com", "S"],
  ["Mantle", "https://rpc.mantle.xyz", "MNT"],
  ["Blast", "https://rpc.blast.io", "ETH"],
  ["zkSync Era", "https://mainnet.era.zksync.io", "ETH"],
  ["Mode", "https://mainnet.mode.network", "ETH"],
  ["Metis", "https://andromeda.metis.io/?owner=1088", "METIS"],
  ["Manta", "https://pacific-rpc.manta.network/http", "ETH"],
  ["Zircuit", "https://mainnet.zircuit.com", "ETH"],
  ["Sei", "https://evm-rpc.sei-apis.com", "SEI"],
  ["ZetaChain", "https://zetachain-evm.blockpi.network/v1/rpc/public", "ZETA"],
  ["Ronin", "https://api.roninchain.com/rpc", "RON"],
  ["X Layer", "https://rpc.xlayer.tech", "OKB"],
  ["Cyber", "https://cyber.alt.technology", "ETH"],
  ["Hemi", "https://rpc.hemi.network/rpc", "ETH"],
];

/** Stablecoins are where value actually sits; natives are usually just gas. */
const STABLES = {
  Ethereum: {
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  BSC: {
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  },
  Polygon: {
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  Arbitrum: {
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  Optimism: {
    USDT: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  Base: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  Avalanche: {
    USDT: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  },
};

const ERC20 = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").split(" #")[0].trim();
  }
  return out;
}

const env = { ...loadEnvFile(path.join(process.cwd(), ".env.local")), ...process.env };
const rawKey = (env.AURUM_AGENT_PRIVATE_KEY || env.PENNY_TREASURY_BEP20_PRIVATE_KEY || "").trim();
if (!/^(0x)?[0-9a-fA-F]{64}$/.test(rawKey)) {
  console.error("\n  Set AURUM_AGENT_PRIVATE_KEY in .env.local first.\n");
  process.exit(1);
}
const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
const evmAddress = new ethers.Wallet(key).address;

/**
 * Tron from the same key.
 *
 * Identical curve and identical keccak-of-pubkey as Ethereum — Tron just tags
 * the result with 0x41 and base58check-encodes it. So a key advertised as a
 * "Tron wallet" alongside an "Ethereum wallet" is frequently one key holding
 * two addresses, and checking only the familiar-looking one misses half of it.
 */
function tronAddressFrom(privKey) {
  const pub = ethers.SigningKey.computePublicKey(privKey, false); // 0x04 + X + Y
  const hash = ethers.keccak256("0x" + pub.slice(4));
  const body = "0x41" + hash.slice(-40);
  const checksum = ethers.sha256(ethers.sha256(body)).slice(2, 10);
  return ethers.encodeBase58(body + checksum);
}

const tron = tronAddressFrom(key);

console.log(`\n  Multi-chain audit — ${new Date().toISOString().slice(0, 16)}`);
console.log(`\n  EVM address   ${evmAddress}`);
console.log(`  Tron address  ${tron}`);
console.log(
  `\n  Every EVM chain on the wallet's list resolves to that one address.\n` +
    `  ${"─".repeat(64)}\n`,
);

let found = 0;
let unreachable = 0;

for (const [name, rpc, symbol] of EVM_CHAINS) {
  let provider;
  try {
    /*
     * `staticNetwork` with an explicit chainId of null still makes ethers probe
     * for the network, and a provider that never resolves keeps retrying on a
     * timer forever -- which kept this process alive long after it had printed
     * its answer. Destroying each provider below is what actually ends the run.
     */
    provider = new ethers.JsonRpcProvider(rpc, undefined, {
      staticNetwork: true,
    });
    const native = await Promise.race([
      provider.getBalance(evmAddress),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 12000)),
    ]);
    const nativeAmt = Number(ethers.formatEther(native));

    const holdings = [];
    if (nativeAmt > 0) holdings.push(`${nativeAmt.toFixed(6)} ${symbol}`);

    for (const [sym, addr] of Object.entries(STABLES[name] ?? {})) {
      try {
        const c = new ethers.Contract(addr, ERC20, provider);
        const [bal, dec] = await Promise.all([c.balanceOf(evmAddress), c.decimals()]);
        const amt = Number(ethers.formatUnits(bal, dec));
        if (amt > 0) holdings.push(`${amt.toFixed(2)} ${sym}`);
      } catch {
        /* one token read failing is not the chain failing */
      }
    }

    if (holdings.length) {
      found++;
      console.log(`  ${name.padEnd(14)} ${holdings.join("  ")}`);
    } else {
      console.log(`  ${name.padEnd(14)} empty`);
    }
  } catch {
    unreachable++;
    console.log(`  ${name.padEnd(14)} — RPC unreachable, not checked`);
  } finally {
    provider?.destroy();
  }
}

// Tron, read over HTTP rather than JSON-RPC.
try {
  const res = await fetch(`https://api.trongrid.io/v1/accounts/${tron}`);
  const json = await res.json();
  const acct = (json.data ?? [])[0];
  if (!acct) {
    console.log(`  ${"Tron".padEnd(14)} account not activated — holds nothing`);
  } else {
    const trx = (acct.balance ?? 0) / 1e6;
    const toks = (acct.trc20 ?? []).flatMap((o) =>
      Object.entries(o).map(([k, v]) => `${Number(v) / 1e6} @${k.slice(0, 6)}…`),
    );
    const parts = [trx > 0 ? `${trx} TRX` : null, ...toks].filter(Boolean);
    console.log(`  ${"Tron".padEnd(14)} ${parts.length ? parts.join("  ") : "empty"}`);
    if (parts.length) found++;
  }
} catch {
  console.log(`  ${"Tron".padEnd(14)} — could not reach TronGrid`);
}

console.log(`\n  ${"─".repeat(64)}`);
console.log(
  `  ${found === 0 ? "Nothing found on any reachable chain." : `Value found on ${found} chain(s) — see above.`}` +
    `${unreachable ? `  (${unreachable} chain(s) unreachable, not checked)` : ""}\n`,
);
console.log(
  "  Not covered: Solana, Sui, TON and the Bitcoin-family chains. Those use\n" +
    "  different curves and key formats, so they are genuinely separate wallets\n" +
    "  with separate keys — not this one address under another name.\n",
);

// Nothing further is pending; anything still holding the loop open is a
// provider retry we no longer care about.
process.exit(0);
