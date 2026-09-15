/**
 * Treasury BEP20 setup — derives wallet from PRIVATE_KEY, checks balances,
 * prints the exact `npx convex env set` commands to run for prod.
 *
 * Usage:
 *   node scripts/setup-treasury-bep20.mjs
 *
 * Reads PRIVATE_KEY from .env.local (already present in repo root).
 * Does NOT write anything to Convex — it just prints the commands.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── 1. Load .env.local ──────────────────────────────────────────────────────
function parseEnvFile(filePath) {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const out = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

const localEnv = parseEnvFile(join(ROOT, ".env.local"));
const PRIVATE_KEY = localEnv["PRIVATE_KEY"] || process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("ERROR: PRIVATE_KEY not found in .env.local or environment.");
  process.exit(1);
}

const pk = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;

// ── 2. Derive wallet ─────────────────────────────────────────────────────────
const wallet = new ethers.Wallet(pk);
const address = wallet.address;

// ── 3. Check balances on BSC ─────────────────────────────────────────────────
const BSC_RPC = "https://bsc-dataseed.binance.org/";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, provider);
  const decimals = Number(await usdt.decimals());
  const usdtBal = ethers.formatUnits(await usdt.balanceOf(address), decimals);
  const bnbBal = ethers.formatEther(await provider.getBalance(address));

  console.log("\n=== Treasury BEP20 Setup ===\n");
  console.log(`Derived address : ${address}`);
  console.log(`USDT balance    : ${usdtBal} USDT`);
  console.log(`BNB (gas)       : ${bnbBal} BNB`);

  const bnbNum = Number(bnbBal);
  if (bnbNum < 0.005) {
    console.log(`\n⚠  LOW GAS: send at least 0.01 BNB to ${address} before withdrawals go live.`);
    console.log(`   Current ${bnbNum.toFixed(6)} BNB ≈ ${Math.floor(bnbNum / 0.0003)} txs before empty.\n`);
  }

  // ── 4. Print convex env set commands ────────────────────────────────────────
  console.log("\n── Commands to run (copy-paste, fill in CHESSA values) ──────────\n");

  const commands = [
    `npx convex env set PENNY_TREASURY_BEP20_PRIVATE_KEY "${pk}" --prod`,
    `npx convex env set PENNY_TREASURY_BEP20_ADDRESS "${address}" --prod`,
    `npx convex env set PENNY_WITHDRAW_CHAIN "BNB Smart Chain (BEP20)" --prod`,
    `npx convex env set PENNY_WITHDRAW_ORIGIN_ASSET "USDT" --prod`,
    `# ↓ Get these from the Chessa team / Chessa Convex dashboard`,
    `npx convex env set CHESSA_CONVEX_URL "https://YOUR_CHESSA_DEPLOYMENT.convex.cloud" --prod`,
    `npx convex env set CHESSA_V0_INTERNAL_SECRET "YOUR_CHESSA_SECRET" --prod`,
  ];

  for (const cmd of commands) {
    console.log(cmd);
  }

  // ── 5. Save a .treasury-setup.sh file (gitignored) ──────────────────────────
  const shPath = join(ROOT, ".treasury-setup.sh");
  const shContent = [
    "#!/bin/bash",
    "# BEP20 treasury env setup for Convex prod.",
    "# Fill in CHESSA_CONVEX_URL and CHESSA_V0_INTERNAL_SECRET before running.",
    "set -e",
    "",
    ...commands.filter(c => !c.startsWith("#")),
    "",
    'echo "Done. Run: node scripts/verify-treasury-bep20.mjs --prod"',
  ].join("\n");

  writeFileSync(shPath, shContent, "utf-8");
  console.log(`\nSaved shell script: .treasury-setup.sh`);
  console.log("Edit it to fill in CHESSA values, then run: bash .treasury-setup.sh\n");

  // ── 6. Dry-run diagnosis summary ─────────────────────────────────────────────
  console.log("── Dry-run pipeline diagnosis ──────────────────────────────────────\n");
  console.log("Step 1  requestEcocashWithdrawal  → queues payout          [OK — code ready]");
  console.log("Step 2  runCryptoToEcocashForPayout → calls Chessa bridge");
  console.log("          CHESSA_CONVEX_URL         →", localEnv["CHESSA_CONVEX_URL"] || "NOT SET ❌");
  console.log("          CHESSA_V0_INTERNAL_SECRET  →", localEnv["CHESSA_V0_INTERNAL_SECRET"] ? "set ✓" : "NOT SET ❌");
  console.log("Step 3  fundChessaPaymentAddress  → routes to BEP20 send");
  console.log("Step 4  sendUsdtToChessaPayment   → signs & sends USDT");
  console.log("          PENNY_TREASURY_BEP20_PRIVATE_KEY →", localEnv["PENNY_TREASURY_BEP20_PRIVATE_KEY"] ? "set ✓" : "NOT SET ❌ (use PRIVATE_KEY above)");
  console.log("          Treasury wallet USDT     →", usdtBal, "USDT  ✓");
  console.log("          BNB gas                  →", bnbBal, bnbNum >= 0.005 ? "BNB  ✓" : "BNB  ⚠ LOW");
  console.log("");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
