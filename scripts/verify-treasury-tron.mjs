/**
 * Verify Tron treasury key ↔ address ↔ on-chain balances (no secrets printed).
 * Usage: node scripts/verify-treasury-tron.mjs --prod
 */
import { spawnSync } from "child_process";
import { TronWeb } from "tronweb";

const USE_PROD = process.argv.includes("--prod");
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function getEnv(name) {
  const prodFlag = USE_PROD ? " --prod" : "";
  const r = spawnSync(`npx convex env get${prodFlag} ${name}`, {
    encoding: "utf-8",
    shell: true,
    cwd: process.cwd(),
  });
  if (r.status !== 0) throw new Error(r.stderr || `env get ${name} failed`);
  return (r.stdout || "").trim();
}

async function usdtBalance(tronWeb, address) {
  const c = await tronWeb.contract().at(USDT);
  const raw = await c.balanceOf(address).call();
  const n = Number(raw) / 1e6;
  return n;
}

async function trxBalance(tronWeb, address) {
  const sun = await tronWeb.trx.getBalance(address);
  return Number(sun) / 1e6;
}

async function accountExists(tronWeb, address) {
  try {
    const acc = await tronWeb.trx.getAccount(address);
    return Boolean(acc?.address);
  } catch {
    return false;
  }
}

async function main() {
  const configuredAddr = getEnv("PENNY_TREASURY_TRC20_ADDRESS");
  let pk = getEnv("PENNY_TREASURY_TRON_PRIVATE_KEY");
  if (pk.startsWith("0x")) pk = pk.slice(2);

  const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });
  const derivedAddr = tronWeb.address.fromPrivateKey(pk);

  const userExpected = "TDthn8zX57YiKkZGqjMKwvAdp527btmcFA";

  console.log("\n=== Penny Tron treasury check ===\n");
  console.log("Deployment:", USE_PROD ? "prod" : "dev");
  console.log("PENNY_TREASURY_TRC20_ADDRESS (Convex):", configuredAddr);
  console.log("Address from PENNY_TREASURY_TRON_PRIVATE_KEY:", derivedAddr);
  console.log("Your funded wallet (Wilmot / deposit):", userExpected);
  console.log("");

  const keyMatchesConfigured = derivedAddr === configuredAddr;
  const keyMatchesFunded = derivedAddr === userExpected;
  const configuredMatchesFunded = configuredAddr === userExpected;

  console.log("Private key matches Convex TRC20_ADDRESS?", keyMatchesConfigured ? "YES" : "NO — FIX ENV");
  console.log("Private key matches TDthn8… funded wallet?", keyMatchesFunded ? "YES" : "NO");
  console.log("Convex address matches funded wallet?", configuredMatchesFunded ? "YES" : "NO — THIS WAS THE BUG");

  for (const label of [
    ["From private key", derivedAddr],
    ["Convex env address", configuredAddr],
    ["Funded deposit address", userExpected],
  ]) {
    const [name, addr] = label;
    if (!addr?.startsWith("T")) continue;
    const exists = await accountExists(tronWeb, addr);
    const trx = exists ? await trxBalance(tronWeb, addr) : 0;
    const usdt = exists ? await usdtBalance(tronWeb, addr) : 0;
    console.log(`\n${name} (${addr}):`);
    console.log("  Activated on Tron?", exists ? "yes" : "no (needs TRX first)");
    console.log("  TRX:", trx.toFixed(4));
    console.log("  USDT:", usdt.toFixed(2));
  }

  const onrampBep20 = "0x0d487685aa79fea908ef5973f0a076ac76ba7980";
  console.log("\nNote: If your USDT is on BSC at", onrampBep20);
  console.log("  use BEP20 treasury (PENNY_TREASURY_BEP20_*) + PENNY_WITHDRAW_CHAIN=BEP20.");
  console.log("  Run: node scripts/verify-treasury-bep20.mjs --prod\n");

  console.log("=== What to do (Tron) ===\n");
  if (!keyMatchesConfigured) {
    console.log(
      "Set PENNY_TREASURY_TRC20_ADDRESS to:",
      derivedAddr,
      "\n  npx convex env set PENNY_TREASURY_TRC20_ADDRESS",
      `"${derivedAddr}"`,
      USE_PROD ? "--prod" : "",
    );
  }
  if (!keyMatchesFunded && derivedAddr !== userExpected) {
    console.log(
      "WARNING: The key in Convex does NOT control TDthn8…. Either update the key or fund the derived address.",
    );
  }
  const fundedExists = await accountExists(tronWeb, userExpected);
  if (fundedExists) {
    const trx = await trxBalance(tronWeb, userExpected);
    if (trx < 1) {
      console.log("Funded wallet needs TRX for fees (~10–30 TRX recommended for TRC20 sends).");
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
