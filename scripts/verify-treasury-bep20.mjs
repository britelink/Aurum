/**
 * Verify BEP20 treasury key ↔ 0x address ↔ USDT/BNB balances.
 * Usage: node scripts/verify-treasury-bep20.mjs --prod
 */
import { spawnSync } from "child_process";
import { ethers } from "ethers";

const USE_PROD = process.argv.includes("--prod");
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const ONRAMP = "0x0d487685aa79fea908ef5973f0a076ac76ba7980";
const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

function getEnv(name) {
  const prodFlag = USE_PROD ? " --prod" : "";
  const r = spawnSync(`npx convex env get${prodFlag} ${name}`, {
    encoding: "utf-8",
    shell: true,
    cwd: process.cwd(),
  });
  if (r.status !== 0) return null;
  return (r.stdout || "").trim() || null;
}

async function balances(provider, address) {
  const c = new ethers.Contract(USDT, ABI, provider);
  const d = await c.decimals();
  const usdt = await c.balanceOf(address);
  const bnb = await provider.getBalance(address);
  return {
    usdt: ethers.formatUnits(usdt, d),
    bnb: ethers.formatEther(bnb),
  };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(
    "https://bsc-dataseed.binance.org/",
  );
  const pk = getEnv("PENNY_TREASURY_BEP20_PRIVATE_KEY");
  const configured = getEnv("PENNY_TREASURY_BEP20_ADDRESS");
  const onramp = getEnv("PENNY_ONRAMP_WALLET_BEP20") || ONRAMP;

  console.log("\n=== Penny BEP20 treasury check ===\n");
  console.log("Deployment:", USE_PROD ? "prod" : "dev");
  console.log("PENNY_ONRAMP_WALLET_BEP20 (where USDT shows in admin):", onramp);

  const onrampBal = await balances(provider, onramp);
  console.log("  USDT:", onrampBal.usdt, "| BNB (gas):", onrampBal.bnb);

  if (!pk) {
    console.log("\nPENNY_TREASURY_BEP20_PRIVATE_KEY: NOT SET");
    console.log(
      "Export the private key for",
      onramp,
      "from MetaMask/Trust and run:",
    );
    console.log(
      '  npx convex env set PENNY_TREASURY_BEP20_PRIVATE_KEY "0xYOUR_KEY" --prod',
    );
    console.log(
      `  npx convex env set PENNY_TREASURY_BEP20_ADDRESS "${onramp}" --prod`,
    );
    console.log(
      '  npx convex env set PENNY_WITHDRAW_CHAIN "BNB Smart Chain (BEP20)" --prod',
    );
    if (Number(onrampBal.bnb) < 0.001) {
      console.log("\nAlso send ~0.01 BNB to", onramp, "for gas (currently 0).");
    }
    return;
  }

  const wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
  const derived = wallet.address;
  console.log("\nPENNY_TREASURY_BEP20_ADDRESS (Convex):", configured || "(not set)");
  console.log("Address from BEP20 private key:", derived);
  console.log("Matches onramp wallet?", derived.toLowerCase() === onramp.toLowerCase() ? "YES" : "NO");
  if (configured) {
    console.log("Key matches configured address?", derived.toLowerCase() === configured.toLowerCase() ? "YES" : "NO");
  }

  const derivedBal = await balances(provider, derived);
  console.log("Derived wallet USDT:", derivedBal.usdt, "| BNB:", derivedBal.bnb);
  console.log("");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
