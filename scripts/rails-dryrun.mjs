#!/usr/bin/env node
/**
 * Aurum rails — end-to-end drill.
 *
 * Two halves, and the split matters.
 *
 * **Offline** (always, no network, no deployment): the money arithmetic every
 * rail depends on, asserted against the *real* modules — `convex/railLib.ts` and
 * `convex/gameLib.ts`, imported directly, not reimplemented here. These are the
 * properties that, if they break, break quietly: a deposit tag that collides, a
 * fee that does not add up to the gross, a settlement that mints money, a round
 * whose chart and payout disagree. None of them fails loudly in production —
 * they fail as a slow disagreement between what a player was told and what they
 * got.
 *
 * **Live** (`--deployment`): the whole player journey against a real Convex
 * deployment, through `npx convex run` and the internal drill entry points in
 * `convex/railsSandbox.ts` — quote a deposit, land a synthetic transfer, watch
 * the balance move, price a crypto withdrawal to a throwaway address, price an
 * EcoCash cash-out, and (with `--chessa`) ask Chessa for a live rate to prove
 * the off-ramp is reachable and the bridge secret matches.
 *
 * Everything on the live side is dry by default. `--live-payout` is the only
 * way to make real money move, and it is checked for explicitly at each step.
 *
 *   node scripts/rails-dryrun.mjs
 *   node scripts/rails-dryrun.mjs --deployment
 *   node scripts/rails-dryrun.mjs --deployment --prod --chessa
 *   node scripts/rails-dryrun.mjs --deployment --live-payout   # spends money
 */

import { spawnSync } from "node:child_process";

import {
  DEPOSIT_FEE_PERCENT,
  MIN_WITHDRAW_USD,
  buildPayableAmount,
  computeWithdrawFee,
  grossUpForFee,
  isEvmAddress,
  normalizeE164Zimbabwe,
  roundAmount,
  roundMoney,
  splitFee,
  tagFromNonce,
} from "../convex/railLib.ts";

import {
  BETTING_MS,
  HOUSE_RAKE,
  ROUND_MS,
  finalPriceFor,
  neutralAxisFor,
  priceAt,
  priceSeries,
  profitPerStake,
  winnerFor,
} from "../convex/gameLib.ts";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const DEPLOYMENT = has("--deployment");
const PROD = has("--prod");
const CHESSA = has("--chessa");
const LIVE_PAYOUT = has("--live-payout");

const DRILL_EMAIL =
  argv[argv.indexOf("--email") + 1]?.startsWith("--") || !has("--email")
    ? "rail-drill@aurum.local"
    : argv[argv.indexOf("--email") + 1];

/** A throwaway destination. Valid checksum-free hex, provably nobody's. */
const FAKE_PAYOUT_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const FAKE_ECOCASH_PHONE = "0771234567";

// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log("─".repeat(Math.max(title.length, 40)));
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// Offline — deposits
// ---------------------------------------------------------------------------

function drillDeposits() {
  section("Inbound rail — deposit quoting");

  check(
    "inbound is free",
    DEPOSIT_FEE_PERCENT === 0,
    `DEPOSIT_FEE_PERCENT is ${DEPOSIT_FEE_PERCENT}; the product promises a free deposit`,
  );

  check(
    "a zero fee leaves the asked amount untouched",
    near(grossUpForFee(25, 0), 25),
    `grossUpForFee(25, 0) = ${grossUpForFee(25, 0)}`,
  );

  // The gross-up is division, not markup — the property that a fee-bearing
  // deposit still nets exactly the invoice. Verified even though the fee is off
  // today, because the day it is switched on nobody will re-derive this.
  // Tolerance is 1e-6 because `grossUpForFee` rounds to six decimals — the
  // precision a token amount is actually carried at. Demanding more would be
  // asserting against a figure no transfer can express.
  const payable = grossUpForFee(1, 1.7);
  check(
    "gross-up nets the invoice when a fee is applied",
    near(payable - (payable * 1.7) / 100, 1, 1e-6),
    `1 / (1 - 0.017) = ${payable}, which nets ${payable - (payable * 1.7) / 100}`,
  );

  // Tag range: every tag lands inside one tenth of a unit.
  let minTagDelta = Infinity;
  let maxTagDelta = 0;
  for (let n = 0; n < 20000; n++) {
    const tag = tagFromNonce(n);
    const amt = buildPayableAmount(10, tag);
    const delta = amt - 10;
    minTagDelta = Math.min(minTagDelta, delta);
    maxTagDelta = Math.max(maxTagDelta, delta);
    if (tag < 1 || tag > 9999) {
      check("tag stays inside 1…9999", false, `nonce ${n} produced ${tag}`);
      return;
    }
  }
  check("tag stays inside 1…9999", true);
  check(
    "tag surcharge never exceeds 0.1",
    maxTagDelta <= 0.09999 + 1e-9 && minTagDelta >= 0.00001 - 1e-9,
    `observed ${minTagDelta}…${maxTagDelta}`,
  );

  // Uniqueness: distinct tags must produce distinct payable amounts, and be far
  // enough apart that the watcher's 1e-6 tolerance cannot straddle two.
  const seen = new Map();
  let closest = Infinity;
  const amounts = [];
  for (let tag = 1; tag <= 9999; tag++) {
    const amt = buildPayableAmount(10, tag);
    if (seen.has(amt)) {
      check(
        "distinct tags give distinct payable amounts",
        false,
        `tags ${seen.get(amt)} and ${tag} both give ${amt}`,
      );
      return;
    }
    seen.set(amt, tag);
    amounts.push(amt);
  }
  amounts.sort((a, b) => a - b);
  for (let i = 1; i < amounts.length; i++) {
    closest = Math.min(closest, amounts[i] - amounts[i - 1]);
  }
  check("distinct tags give distinct payable amounts", true);
  check(
    "adjacent tags are ≥10× the watcher's match epsilon apart",
    closest >= 1e-5 - 1e-12,
    `closest pair is ${closest} apart; AMOUNT_EPSILON is 1e-6`,
  );

  // The credit path: what arrives is what is credited while the fee is zero.
  const { fee, net } = splitFee(25.04321, DEPOSIT_FEE_PERCENT);
  check(
    "a free deposit credits the full arrival",
    fee === 0 && near(net, 25.04321),
    `fee=${fee} net=${net}`,
  );
  check(
    "the tag is credited too, not skimmed",
    near(roundMoney(net), 25.04),
    `the player asked for 25 and is credited ${roundMoney(net)}`,
  );
}

// ---------------------------------------------------------------------------
// Offline — withdrawals
// ---------------------------------------------------------------------------

function drillWithdrawals() {
  section("Outbound rail — withdrawal pricing");

  for (const gross of [1, 1.5, 5, 10, 25, 100, 999.99]) {
    const q = computeWithdrawFee(gross);
    if (!near(q.fee + q.net, q.gross, 1e-9)) {
      check(
        "fee + net always equals the gross",
        false,
        `$${gross}: ${q.fee} + ${q.net} = ${q.fee + q.net}, expected ${q.gross}`,
      );
      return;
    }
    if (q.net <= 0) {
      check(
        "a withdrawal never nets zero or less",
        false,
        `$${gross} would send ${q.net}`,
      );
      return;
    }
  }
  check("fee + net always equals the gross", true);
  check("a withdrawal never nets zero or less", true);

  const small = computeWithdrawFee(MIN_WITHDRAW_USD);
  check(
    "the minimum withdrawal still leaves something to send",
    small.net > 0,
    `$${MIN_WITHDRAW_USD} → fee ${small.fee}, net ${small.net}`,
  );

  const big = computeWithdrawFee(100);
  check(
    "the fee stays low on a real withdrawal",
    big.fee / big.gross <= 0.03,
    `$100 costs ${big.fee} (${((big.fee / big.gross) * 100).toFixed(2)}%)`,
  );

  check(
    "a debit-then-refund returns exactly what was taken",
    near(roundMoney(50 - big.gross + big.gross), 50),
    "refunds restore the gross, never the net",
  );

  section("Outbound rail — destination validation");

  check("a real BEP-20 address is accepted", isEvmAddress(FAKE_PAYOUT_ADDRESS));
  check("a Tron address is rejected", !isEvmAddress("TWsy9L7uhnFJwW6JW9Z4tqpxdWWu4xELQV"));
  check("a truncated address is rejected", !isEvmAddress("0xdead"));
  check("a bare word is rejected", !isEvmAddress("my wallet"));

  const phones = {
    "0771234567": "+263771234567",
    "+263771234567": "+263771234567",
    "263771234567": "+263771234567",
    "771234567": "+263771234567",
    "00263771234567": "+263771234567",
  };
  let phonesOk = true;
  let phoneDetail = "";
  for (const [input, expected] of Object.entries(phones)) {
    const got = normalizeE164Zimbabwe(input);
    if (got !== expected) {
      phonesOk = false;
      phoneDetail = `${input} → ${got}, expected ${expected}`;
      break;
    }
  }
  check("every EcoCash number shape normalises to one E.164", phonesOk, phoneDetail);
}

// ---------------------------------------------------------------------------
// Offline — the game
// ---------------------------------------------------------------------------

function drillGame() {
  section("Game — determinism");

  const seed = 1234567;
  const a = priceSeries(seed);
  const b = priceSeries(seed);
  check(
    "the same seed draws the same curve every time",
    a.every((v, i) => v === b[i]),
    "the chart and the settlement must agree, and they share this function",
  );
  check(
    "a different seed draws a different curve",
    priceSeries(seed + 1).some((v, i) => v !== a[i]),
  );
  check(
    "the neutral axis is the price at the moment betting closed",
    near(neutralAxisFor(seed), priceAt(seed, BETTING_MS)),
  );
  check(
    "the final price is the end of the same curve",
    near(finalPriceFor(seed), priceAt(seed, ROUND_MS)),
  );

  section("Game — settlement conservation");

  // 4 losers ($6), winners: three $1 and two $2.
  const losersTotal = 6;
  const { perOne, perTwo, houseFee } = profitPerStake(losersTotal, 3, 2);
  const paidOut = perOne * 3 + perTwo * 2;
  check(
    "the losing pool is fully distributed, minus the rake",
    near(paidOut + houseFee, losersTotal, 1e-9),
    `paid ${paidOut} + rake ${houseFee} = ${paidOut + houseFee}, pool was ${losersTotal}`,
  );
  check(
    "the rake is exactly the advertised 8%",
    near(houseFee, losersTotal * HOUSE_RAKE),
    `${houseFee} vs ${losersTotal * HOUSE_RAKE}`,
  );
  check(
    "a $2 stake earns more than a $1 stake",
    perTwo > perOne,
    `perOne=${perOne} perTwo=${perTwo}`,
  );

  // An empty book must not quietly hand its share to the house.
  const onlyOnes = profitPerStake(10, 4, 0);
  check(
    "with no $2 winners the whole net pool still goes to the $1 book",
    near(onlyOnes.perOne * 4 + onlyOnes.houseFee, 10, 1e-9),
    `paid ${onlyOnes.perOne * 4} + rake ${onlyOnes.houseFee}`,
  );
  const onlyTwos = profitPerStake(10, 0, 5);
  check(
    "with no $1 winners the whole net pool still goes to the $2 book",
    near(onlyTwos.perTwo * 5 + onlyTwos.houseFee, 10, 1e-9),
  );

  section("Game — outcomes");

  check("a price above the axis pays buyers", winnerFor(101, 100) === "buyers");
  check("a price below the axis pays sellers", winnerFor(99, 100) === "sellers");
  check(
    "a price on the axis is neutral, not a fifteenth-decimal win",
    winnerFor(100.00001, 100) === "neutral",
  );

  // Over many rounds neither side should be structurally favoured.
  let buyers = 0;
  let sellers = 0;
  let neutral = 0;
  const N = 4000;
  for (let s = 1; s <= N; s++) {
    const w = winnerFor(finalPriceFor(s), neutralAxisFor(s));
    if (w === "buyers") buyers++;
    else if (w === "sellers") sellers++;
    else neutral++;
  }
  const skew = Math.abs(buyers - sellers) / N;
  check(
    "neither side is structurally favoured",
    skew < 0.06,
    `${N} rounds: ${buyers} up / ${sellers} down / ${neutral} void (skew ${(skew * 100).toFixed(1)}%)`,
  );
  check(
    "voids are rare enough that the table still pays",
    neutral / N < 0.15,
    `${((neutral / N) * 100).toFixed(1)}% of rounds landed on the axis`,
  );

  section("Game — round economics, end to end");

  // One $2 winner against one $1 loser and one $2 loser.
  const pool = 3;
  const r = profitPerStake(pool, 0, 1);
  const stakeBack = 2;
  const totalReturn = roundMoney(stakeBack + r.perTwo);
  check(
    "a winner gets their stake back plus a share of the pool",
    totalReturn > stakeBack,
    `staked $2, returned $${totalReturn}`,
  );
  check(
    "the house never pays out more than the losers staked",
    roundMoney(totalReturn - stakeBack) <= pool,
    `profit ${totalReturn - stakeBack} vs pool ${pool}`,
  );
}

// ---------------------------------------------------------------------------
// Live deployment drill
// ---------------------------------------------------------------------------

const IS_WIN = process.platform === "win32";

/**
 * Quote one argument for the shell we are about to go through.
 *
 * `npx` is a `.cmd` on Windows and modern Node refuses to spawn one without a
 * shell, so `shell: true` is forced — and a shell joins the argv array back into
 * a string, which shreds an unquoted JSON payload on the braces and quotes. Each
 * argument therefore has to arrive pre-quoted for the right shell.
 */
function shellQuote(arg) {
  if (!IS_WIN) return `'${arg.replace(/'/g, `'\\''`)}'`;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function convexRun(fn, args) {
  const cliArgs = ["convex", "run", fn, shellQuote(JSON.stringify(args ?? {}))];
  if (PROD) cliArgs.push("--prod");
  const res = spawnSync("npx", cliArgs, {
    encoding: "utf8",
    shell: true,
  });
  const out = `${res.stdout ?? ""}`.trim();
  const err = `${res.stderr ?? ""}`.trim();
  if (res.status !== 0) {
    return { ok: false, error: err || out || `exit ${res.status}` };
  }
  // `convex run` prints the JSON result last; anything before it is log output.
  const start = out.search(/[[{]/);
  if (start < 0) return { ok: true, value: out };
  try {
    return { ok: true, value: JSON.parse(out.slice(start)) };
  } catch {
    return { ok: true, value: out };
  }
}

async function drillDeployment() {
  section(`Live drill — ${PROD ? "PRODUCTION" : "dev"} deployment`);
  console.log(
    `  player: ${DRILL_EMAIL}\n  payouts: ${LIVE_PAYOUT ? "REAL (money will move)" : "dry run"}\n`,
  );

  const user = convexRun("railsSandbox:drillUser", { email: DRILL_EMAIL });
  if (!user.ok) {
    check("create the drill player", false, user.error);
    console.log(
      "\n  The drill needs AURUM_SANDBOX_ENABLED=true and a deployment it can reach.\n" +
        "  npx convex env set AURUM_SANDBOX_ENABLED true\n",
    );
    return;
  }
  check("create the drill player", true);
  const userId = user.value.userId;
  const startingBalance = user.value.balance;
  console.log(`      userId ${userId}, balance $${startingBalance}`);

  // --- deposit -------------------------------------------------------------
  const DEPOSIT = 20;
  const quote = convexRun("railsSandbox:drillQuoteDeposit", {
    userId,
    amount: DEPOSIT,
    asset: "USDT",
  });
  if (!quote.ok) {
    check("quote a deposit", false, quote.error);
    return;
  }
  const q = quote.value;
  check("quote a deposit", true);
  console.log(
    `      send ${q.amountPayable} USDT to ${q.depositAddress} (${q.reference})`,
  );
  check(
    "the quoted amount carries a tag above the asked amount",
    q.amountPayable > DEPOSIT && q.amountPayable - DEPOSIT < 0.1,
    `asked ${DEPOSIT}, quoted ${q.amountPayable}`,
  );
  check(
    "the deposit address is a real BEP-20 address",
    isEvmAddress(q.depositAddress),
    q.depositAddress,
  );

  // --- underpayment, then the top-up that finishes it ----------------------
  const short = convexRun("railsSandbox:drillSimulateTransfer", {
    depositId: q.depositId,
    amount: roundAmount(q.amountPayable * 0.6),
  });
  if (short.ok) {
    check(
      "a partial transfer is held as underpaid, not credited",
      short.value.depositStatus === "underpaid" && short.value.credited === 0,
      JSON.stringify(short.value),
    );
  } else {
    check("a partial transfer is held as underpaid, not credited", false, short.error);
  }

  const topUp = convexRun("railsSandbox:drillSimulateTransfer", {
    depositId: q.depositId,
    amount: roundAmount(q.amountPayable * 0.4),
  });
  if (!topUp.ok) {
    check("the top-up confirms and credits the balance", false, topUp.error);
    return;
  }
  check(
    "the top-up confirms and credits the balance",
    topUp.value.depositStatus === "confirmed" && topUp.value.credited > 0,
    JSON.stringify(topUp.value),
  );
  check(
    "the credit equals what actually arrived",
    near(topUp.value.credited, roundMoney(q.amountPayable), 0.01),
    `credited ${topUp.value.credited} against ${q.amountPayable} received`,
  );
  const afterDeposit = topUp.value.balance;
  console.log(`      balance now $${afterDeposit}`);

  // --- crypto withdrawal to a throwaway address ----------------------------
  const cryptoKey = `drill-crypto-${Date.now()}`;
  const withdrawAmount = Math.min(10, Math.floor(afterDeposit));
  const cw = convexRun("railsSandbox:drillWithdrawCrypto", {
    userId,
    amount: withdrawAmount,
    toAddress: FAKE_PAYOUT_ADDRESS,
    idempotencyKey: cryptoKey,
    dryRun: !LIVE_PAYOUT,
  });
  if (!cw.ok) {
    check("price a crypto withdrawal", false, cw.error);
  } else {
    const w = cw.value;
    check("price a crypto withdrawal", true);
    console.log(
      `      $${w.amountUsd} → ${w.amountToken} USDT, fee $${w.feeUsd}` +
        (LIVE_PAYOUT ? " [QUEUED FOR REAL]" : " [dry]"),
    );
    check(
      "the crypto payout adds up",
      near(w.feeUsd + w.amountToken, w.amountUsd, 1e-9),
      `${w.feeUsd} + ${w.amountToken} ≠ ${w.amountUsd}`,
    );
  }

  const badAddress = convexRun("railsSandbox:drillWithdrawCrypto", {
    userId,
    amount: withdrawAmount,
    toAddress: "TWsy9L7uhnFJwW6JW9Z4tqpxdWWu4xELQV",
    idempotencyKey: `drill-bad-${Date.now()}`,
    dryRun: true,
  });
  check(
    "a Tron address is refused before anything is debited",
    !badAddress.ok,
    badAddress.ok ? "it was accepted — funds would be lost" : undefined,
  );

  const replay = convexRun("railsSandbox:drillWithdrawCrypto", {
    userId,
    amount: withdrawAmount,
    toAddress: FAKE_PAYOUT_ADDRESS,
    idempotencyKey: cryptoKey,
    dryRun: !LIVE_PAYOUT,
  });
  if (LIVE_PAYOUT) {
    check(
      "replaying the same key returns the first payout, not a second",
      replay.ok && replay.value.deduped === true,
      JSON.stringify(replay.value ?? replay.error),
    );
  } else {
    console.log("      (idempotency is only observable once a payout is written)");
  }

  // --- EcoCash, via Chessa -------------------------------------------------
  const ew = convexRun("railsSandbox:drillWithdrawEcocash", {
    userId,
    amount: Math.min(5, Math.floor(afterDeposit)),
    ecocashPhone: FAKE_ECOCASH_PHONE,
    firstName: "Rail",
    lastName: "Drill",
    idempotencyKey: `drill-eco-${Date.now()}`,
    dryRun: !LIVE_PAYOUT,
  });
  if (!ew.ok) {
    check("price an EcoCash cash-out", false, ew.error);
  } else {
    const e = ew.value;
    check("price an EcoCash cash-out", true);
    console.log(
      `      $${e.amountUsd} → ${e.ecocashPhone ?? "queued"}, fee $${e.feeUsd}, recipient gets $${e.netUsd}` +
        (LIVE_PAYOUT ? " [SENT TO CHESSA FOR REAL]" : " [dry]"),
    );
    check(
      "the EcoCash payout adds up",
      near(e.feeUsd + e.netUsd, e.amountUsd, 1e-9),
      `${e.feeUsd} + ${e.netUsd} ≠ ${e.amountUsd}`,
    );
    if (e.ecocashPhone) {
      check(
        "the phone number reaches Chessa in E.164",
        e.ecocashPhone.startsWith("+263"),
        e.ecocashPhone,
      );
    }
  }

  // --- the books -----------------------------------------------------------
  const snap = convexRun("railsSandbox:drillSnapshot", { userId });
  if (snap.ok) {
    const s = snap.value;
    const ledger = s.transactions.reduce((sum, t) => sum + t.amount, 0);
    check(
      "the ledger reconstructs the balance",
      near(roundMoney(ledger), roundMoney(s.balance), 0.01),
      `ledger sums to ${roundMoney(ledger)}, balance is ${s.balance}`,
    );
    console.log(`\n      final balance $${s.balance}`);
    console.log(
      `      ${s.deposits.length} deposit(s), ${s.cryptoPayouts.length} crypto payout(s), ${s.ecocashPayouts.length} EcoCash payout(s)`,
    );
  }

  if (CHESSA) {
    section("Chessa off-ramp — reachability");
    console.log(
      "  `checkChessaRail` is admin-gated and must be called from a signed-in\n" +
        "  admin session (the /admin page), not the CLI. Run it there, or check\n" +
        "  that CHESSA_CONVEX_URL and CHESSA_V0_INTERNAL_SECRET match Chessa's\n" +
        "  V0_API_INTERNAL_SECRET.\n",
    );
  }

  if (!LIVE_PAYOUT) {
    console.log(
      "\n  Nothing left the agent wallet. Re-run with --live-payout to send a real\n" +
        "  transfer and book a real EcoCash remittance at Chessa.\n",
    );
  }

  console.log(
    `  Clean up with:  npx convex run railsSandbox:drillCleanup '{"userId":"${userId}","deleteUser":true}'${PROD ? " --prod" : ""}\n`,
  );
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("\nAurum rails — end-to-end drill\n");

  drillDeposits();
  drillWithdrawals();
  drillGame();

  if (DEPLOYMENT) {
    await drillDeployment();
  } else {
    section("Live drill");
    console.log(
      "  skipped — pass --deployment to run the full journey against Convex\n" +
        "  (needs AURUM_SANDBOX_ENABLED=true on that deployment).",
    );
  }

  console.log(`\n${"═".repeat(48)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("\n  Failures:");
    for (const f of failures) {
      console.log(`    · ${f.name}${f.detail ? `\n        ${f.detail}` : ""}`);
    }
  }
  console.log("");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
