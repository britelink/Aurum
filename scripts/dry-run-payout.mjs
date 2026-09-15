/**
 * Dry-run the full EcoCash payout pipeline end-to-end WITHOUT touching Convex DB.
 *
 * Tests:
 *  1. Chessa bridge (v0public:cryptoToEcocash) — real API call
 *  2. BEP20 treasury wallet — balance + gas check
 *  3. Simulate USDT send (estimateGas only, no real tx)
 *
 * Usage:
 *   node scripts/dry-run-payout.mjs
 *
 * Reads keys directly from .env.local (no Convex CLI needed).
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { ConvexHttpClient } from "convex/browser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf-8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx === -1) continue;
    env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const e = loadEnv();

const CHESSA_CONVEX_URL    = e.CHESSA_CONVEX_URL;
const CHESSA_SECRET        = e.CHESSA_V0_INTERNAL_SECRET;
const PRIVATE_KEY          = e.PRIVATE_KEY?.startsWith("0x") ? e.PRIVATE_KEY : `0x${e.PRIVATE_KEY}`;
const BSC_RPC              = "https://bsc-dataseed.binance.org/";
const USDT_BSC             = "0x55d398326f99059fF775485246999027B3197955";
const ERC20_ABI            = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// ── test config (change phone / amount for real user test) ───────────────────
const TEST_PHONE     = "0771234567";   // Zim EcoCash number
const TEST_AMOUNT    = 2;             // USD
const TEST_FIRST     = "Test";
const TEST_LAST      = "User";
const CLIENT_REF     = `dry-run-${Date.now()}`;

function ok(msg)   { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.log(`  ✗ ${msg}`); }
function hdr(msg)  { console.log(`\n── ${msg} ${"─".repeat(Math.max(0, 54 - msg.length))}`); }

async function step1_checkEnv() {
  hdr("Step 1: env var check");
  let allGood = true;
  const check = (name, val) => {
    if (val) { ok(`${name} = ${val.slice(0, 30)}...`); }
    else      { fail(`${name} NOT SET`); allGood = false; }
  };
  check("CHESSA_CONVEX_URL",       CHESSA_CONVEX_URL);
  check("CHESSA_V0_INTERNAL_SECRET", CHESSA_SECRET);
  check("PRIVATE_KEY (→ BEP20 treasury)", PRIVATE_KEY);
  return allGood;
}

async function step2_chessaBridge() {
  hdr("Step 2: Chessa bridge call (v0public:cryptoToEcocash)");
  console.log(`  Calling ${CHESSA_CONVEX_URL}`);
  console.log(`  phone=${TEST_PHONE}  amount=$${TEST_AMOUNT}  chain=BNB Smart Chain (BEP20)`);

  const client = new ConvexHttpClient(CHESSA_CONVEX_URL);
  let result;
  try {
    result = await client.action("v0public:cryptoToEcocash", {
      internalSecret: CHESSA_SECRET,
      firstName: TEST_FIRST,
      lastName: TEST_LAST,
      phone: TEST_PHONE,
      intendedUsdAmount: TEST_AMOUNT,
      originAsset: "USDT",
      chain: "BNB Smart Chain (BEP20)",
      clientReference: CLIENT_REF,
    });
  } catch (err) {
    fail(`Chessa call threw: ${err.message}`);
    if (err.message?.includes("Unauthorized") || err.message?.includes("secret")) {
      console.log("    → Check CHESSA_V0_INTERNAL_SECRET matches Chessa's V0_API_INTERNAL_SECRET");
    }
    if (err.message?.includes("ECONNREFUSED") || err.message?.includes("fetch")) {
      console.log("    → Check CHESSA_CONVEX_URL is correct and reachable");
    }
    return null;
  }

  console.log("\n  Raw Chessa response:");
  console.log("  " + JSON.stringify(result, null, 2).split("\n").join("\n  "));

  if (!result?.success) {
    fail(`Chessa returned success=false`);
    return null;
  }

  const { paymentAddress, network, sendAmount, sendCurrency, receiveAmount, receiveCurrency, fee } = result;
  ok(`Order created: ${result.chessaShortId || result.chessaOrderId}`);
  ok(`Payment address: ${paymentAddress}`);
  ok(`Network: ${network}`);
  ok(`Send: ${sendAmount} ${sendCurrency}`);
  ok(`Receive: ${receiveAmount} ${receiveCurrency}  (fee: ${fee})`);

  if (!paymentAddress) {
    fail("paymentAddress is null/empty — cannot fund");
    return null;
  }
  return result;
}

function isTronAddress(addr) {
  return typeof addr === "string" && addr.startsWith("T") && addr.length === 34;
}

async function step3_tronWalletCheck(sendAmount) {
  hdr("Step 3: Tron treasury wallet");
  const TRON_PK   = e.PENNY_TREASURY_TRON_PRIVATE_KEY?.replace(/^0x/, "");
  const TRON_ADDR = e.PENNY_TREASURY_TRC20_ADDRESS;
  const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

  if (!TRON_PK) { fail("PENNY_TREASURY_TRON_PRIVATE_KEY not set"); return { ok: false }; }

  const { TronWeb } = await import("tronweb");
  const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });
  const derived = tronWeb.address.fromPrivateKey(TRON_PK);

  ok(`Key → address : ${derived}`);
  if (TRON_ADDR) {
    if (derived === TRON_ADDR) ok(`PENNY_TREASURY_TRC20_ADDRESS matches key ✓`);
    else fail(`PENNY_TREASURY_TRC20_ADDRESS (${TRON_ADDR}) does NOT match key (${derived})`);
  }

  // fetch balance via trongrid v1
  let trx = 0, usdt = 0, activated = false;
  try {
    const r = await fetch(`https://api.trongrid.io/v1/accounts/${derived}`);
    const d = await r.json();
    if (d.data?.[0]) {
      const acct = d.data[0];
      trx = (acct.balance ?? 0) / 1e6;
      const trc20list = acct.trc20 ?? [];
      const usdtEntry = trc20list.find(t => t[USDT_TRC20]);
      usdt = usdtEntry ? Number(usdtEntry[USDT_TRC20]) / 1e6 : 0;
      activated = true;
    }
  } catch (err) {
    fail(`Balance fetch failed: ${err.message}`);
    return { ok: false };
  }

  if (!activated) {
    fail(`Tron wallet NOT ACTIVATED — send TRX to ${derived} first`);
    console.log(`    → Get TRX from an exchange and send 20–50 TRX to ${derived}`);
    console.log(`    → Then bridge or send TRC20 USDT to the same address`);
    return { ok: false, derived };
  }

  ok(`TRX  : ${trx.toFixed(4)} (need ≥10 for gas)`);
  ok(`USDT : ${usdt.toFixed(2)}`);

  let walletOk = true;
  if (trx < 10) { fail(`TRX too low for gas — send ≥20 TRX to ${derived}`); walletOk = false; }
  if (sendAmount != null && usdt < sendAmount) {
    fail(`Insufficient USDT: have ${usdt.toFixed(2)}, need ${sendAmount.toFixed(2)}`);
    walletOk = false;
  }
  return { ok: walletOk, derived, trx, usdt, tronWeb, TRON_PK };
}

async function step3_bep20WalletCheck(sendAmount) {
  hdr("Step 3: BEP20 treasury wallet");
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(USDT_BSC, ERC20_ABI, provider);
  const decimals = Number(await contract.decimals());
  const address  = wallet.address;
  const usdtRaw  = await contract.balanceOf(address);
  const bnbRaw   = await provider.getBalance(address);
  const usdt     = Number(ethers.formatUnits(usdtRaw, decimals));
  const bnb      = Number(ethers.formatEther(bnbRaw));

  ok(`Address : ${address}`);
  ok(`USDT    : ${usdt.toFixed(6)}`);
  if (bnb < 0.005) fail(`BNB (gas): ${bnb.toFixed(6)} — TOO LOW. Send ≥0.01 BNB to ${address}`);
  else              ok(`BNB (gas): ${bnb.toFixed(6)}`);

  const walletOk = usdt >= (sendAmount ?? 0) && bnb >= 0.001;
  return { wallet, provider, contract, decimals, usdt, bnb, ok: walletOk };
}

async function step4_tronSimulate(walletCtx, paymentAddress, sendAmount) {
  hdr("Step 4: Simulate TRC20 USDT send (no real tx)");
  const { derived, trx, usdt, tronWeb, TRON_PK } = walletCtx;
  const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

  console.log(`  From   : ${derived}`);
  console.log(`  To     : ${paymentAddress}`);
  console.log(`  Amount : ${sendAmount} USDT (TRC20)`);

  if (!walletCtx.ok) { fail("Wallet not ready — see Step 3"); return; }

  // TRC20 transfer costs ~15–30 TRX in energy/bandwidth. With enough TRX this works.
  if (trx >= 10 && usdt >= sendAmount) {
    ok(`Has ${trx.toFixed(2)} TRX for energy+bandwidth`);
    ok(`Has ${usdt.toFixed(2)} USDT ≥ ${sendAmount} needed`);
    ok(`READY TO SEND — this tx would succeed`);
  }
}

async function step4_bep20Simulate(walletCtx, paymentAddress, sendAmount) {
  hdr("Step 4: Simulate BEP20 USDT send (estimateGas only — no real tx)");
  const { wallet, contract, decimals, bnb } = walletCtx;
  const connectedContract = contract.connect(wallet);
  const amount = ethers.parseUnits(String(sendAmount), decimals);

  console.log(`  From   : ${wallet.address}`);
  console.log(`  To     : ${paymentAddress}`);
  console.log(`  Amount : ${sendAmount} USDT`);

  try {
    const gasEst = await connectedContract.transfer.estimateGas(paymentAddress, amount);
    const feeData = await wallet.provider.getFeeData();
    const gasCost = gasEst * (feeData.gasPrice ?? 3000000000n);
    const gasCostBNB = Number(ethers.formatEther(gasCost));
    ok(`Gas estimate : ${gasEst.toString()} units (~${gasCostBNB.toFixed(6)} BNB)`);
    if (bnb < gasCostBNB) fail(`Not enough BNB for gas. Have ${bnb.toFixed(6)}, need ${gasCostBNB.toFixed(6)}`);
    else ok(`READY TO SEND`);
  } catch (err) {
    fail(`estimateGas failed: ${err.message}`);
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║     Aurum → Chessa payout DRY RUN                   ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  const envOk = await step1_checkEnv();
  if (!envOk) {
    console.log("\n✗ Fix missing env vars above before continuing.\n");
    process.exit(1);
  }

  const chessaResult = await step2_chessaBridge();

  const paymentAddress = chessaResult?.paymentAddress ?? null;
  const network        = chessaResult?.network ?? "";
  const sendAmount     = chessaResult?.sendAmount ?? TEST_AMOUNT;
  const isTron         = !network || network.toLowerCase().includes("tron");

  let walletCtx;
  if (isTron) {
    walletCtx = await step3_tronWalletCheck(sendAmount);
  } else {
    walletCtx = await step3_bep20WalletCheck(sendAmount);
  }

  if (paymentAddress && walletCtx.ok) {
    if (isTron) await step4_tronSimulate(walletCtx, paymentAddress, sendAmount);
    else        await step4_bep20Simulate(walletCtx, paymentAddress, sendAmount);
  } else if (!paymentAddress) {
    hdr("Step 4: skipped (no payment address from Chessa)");
  }

  hdr("Summary");
  const chessaOk = !!chessaResult?.paymentAddress;
  const walletOk = walletCtx.ok;
  const allReady = chessaOk && walletOk;
  const tronAddr = isTron ? (walletCtx.derived ?? e.PENNY_TREASURY_TRC20_ADDRESS) : null;

  console.log(`  Chessa bridge     : ${chessaOk ? "✓ working" : "✗ failed"}`);
  console.log(`  Network           : ${network || "(unknown — defaulting to Tron)"}`);
  console.log(`  Treasury wallet   : ${walletOk ? "✓ ready"   : "✗ needs attention"}`);
  console.log(`  Pipeline ready    : ${allReady ? "✓ YES" : "✗ NO — see failures above"}`);

  if (!allReady && isTron && tronAddr) {
    console.log(`\n  ACTION REQUIRED — fund Tron treasury wallet:`);
    console.log(`    Address : ${tronAddr}`);
    console.log(`    Send    : ≥20 TRX (for gas/energy)`);
    console.log(`    Send    : ≥50 USDT (TRC20) so payouts can be funded`);
    console.log(`    Source  : buy TRX on Binance/Gate and withdraw to this address`);
    console.log(`    OR      : bridge USDT from BSC → Tron via https://www.multichain.org`);
  }

  console.log("");
}

main().catch((e) => {
  console.error("\nFATAL:", e.message || e);
  process.exit(1);
});
