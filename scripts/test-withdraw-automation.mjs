/**
 * End-to-end EcoCash withdraw automation test (Chessa bridge + treasury send).
 *
 * Usage:
 *   node scripts/test-withdraw-automation.mjs
 *   node scripts/test-withdraw-automation.mjs --prod
 *
 * Requires `npx convex` pointed at the target deployment (dev or --prod).
 */
import { spawnSync } from "child_process";
import { randomUUID } from "crypto";

const USE_PROD = process.argv.includes("--prod");
const convexArgs = USE_PROD ? ["--prod"] : [];

const TEST_EMAIL = "tinotendajoe01@gmail.com";
const TEST_PHONE = "0775600726";
const TEST_AMOUNT = 2;
const TEST_FIRST = "Tino";
const TEST_LAST = "Joe";
const IDEMPOTENCY_KEY = `test-withdraw-${Date.now()}-${randomUUID().slice(0, 8)}`;

const POLL_MS = 4000;
const MAX_POLLS = 45; // ~3 min

function log(stage, message, data) {
  const ts = new Date().toISOString();
  const extra = data !== undefined ? ` ${JSON.stringify(data, null, 0)}` : "";
  console.log(`[${ts}] [${stage}] ${message}${extra}`);
}

function convexRun(functionName, args) {
  const json = JSON.stringify(args);
  log("convex", `run ${functionName}`, args);
  const prodFlag = USE_PROD ? " --prod" : "";
  const cmd = `npx convex run${prodFlag} ${functionName} ${JSON.stringify(json)}`;
  const result = spawnSync(cmd, {
    encoding: "utf-8",
    shell: true,
    cwd: process.cwd(),
  });
  if (result.error) {
    throw result.error;
  }
  const out = (result.stdout || "").trim();
  const err = (result.stderr || "").trim();
  if (result.status !== 0) {
    log("FAIL", "convex run exited non-zero", { status: result.status, stderr: err, stdout: out });
    throw new Error(err || out || `convex run failed (${result.status})`);
  }
  if (err) log("convex-stderr", err);
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function describeStage(snapshot) {
  if (!snapshot?.payout) return { stage: "unknown", detail: "no payout row" };
  const p = snapshot.payout;
  if (p.status === "failed") {
    return { stage: "FAILED", detail: p.sgxError ?? "unknown error" };
  }
  if (p.status === "ecocash_paid") {
    return { stage: "DONE", detail: "EcoCash paid — full pipeline complete" };
  }
  if (p.status === "queued") {
    return {
      stage: "1-queued",
      detail: "Waiting for Chessa cryptoToEcocash (order + payment address)",
    };
  }
  if (p.status === "sgx_submitted" && !p.tronFloatTxid) {
    return {
      stage: "2-sgx_submitted",
      detail: "Chessa order created; waiting for treasury USDT send",
      chessaOrderId: p.chessaOrderId,
      paymentAddress: p.sgxPaymentAddress,
      sendAmount: p.sgxSendAmount,
      network: p.sgxNetwork,
    };
  }
  if (p.status === "sgx_submitted" && p.tronFloatTxid) {
    return {
      stage: "3-funded",
      detail: "Treasury sent USDT; waiting for Chessa EcoCash payout + callback",
      tronFloatTxid: p.tronFloatTxid,
    };
  }
  return { stage: p.status, detail: "in progress" };
}

async function pollPayout(payoutId) {
  let lastStage = "";
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const snapshot = convexRun("withdrawTest:getPayoutSnapshot", { payoutId });
    const { stage, detail, ...rest } = describeStage(snapshot);
    if (stage !== lastStage) {
      lastStage = stage;
      log(stage, detail, { poll: i + 1, ...rest, payout: snapshot?.payout });
    } else {
      log(stage, `still waiting (poll ${i + 1}/${MAX_POLLS})`, rest);
    }
    if (stage === "DONE") return { ok: true, snapshot };
    if (stage === "FAILED") return { ok: false, snapshot };
  }
  return { ok: false, timeout: true };
}

async function main() {
  log("init", `EcoCash withdraw automation test`, {
    deployment: USE_PROD ? "prod" : "dev",
    email: TEST_EMAIL,
    phone: TEST_PHONE,
    amountUsd: TEST_AMOUNT,
    idempotencyKey: IDEMPOTENCY_KEY,
  });

  log("0-lookup", "Resolving user by email");
  const user = convexRun("withdrawTest:getUserByEmail", { email: TEST_EMAIL });
  if (!user) {
    log("FAIL", `No user with email ${TEST_EMAIL}`);
    process.exit(1);
  }
  log("0-lookup", "User found", {
    userId: user._id,
    email: user.email,
    balance: user.balance ?? 0,
  });

  log("1-trigger", "Creating payout + scheduling Chessa bridge");
  const triggered = convexRun("withdrawTest:triggerTestEcocashWithdrawal", {
    email: TEST_EMAIL,
    amount: TEST_AMOUNT,
    ecocashPhone: TEST_PHONE,
    firstName: TEST_FIRST,
    lastName: TEST_LAST,
    idempotencyKey: IDEMPOTENCY_KEY,
    ensureBalance: true,
  });
  log("1-trigger", "Withdrawal queued", triggered);

  if (triggered.deduped) {
    log("warn", "Idempotency deduped — polling existing payout");
  }

  const payoutId = triggered.payoutId;
  if (!payoutId) {
    log("FAIL", "No payoutId returned");
    process.exit(1);
  }

  log("2-poll", "Polling payout status (Chessa → treasury → EcoCash)");
  const result = await pollPayout(payoutId);

  if (result.ok) {
    log("SUCCESS", "Withdraw automation completed", result.snapshot);
    process.exit(0);
  }
  if (result.timeout) {
    log("TIMEOUT", "Pipeline did not finish in time — check Convex dashboard logs", {
      payoutId,
    });
    process.exit(2);
  }
  log("FAIL", "Pipeline failed", result.snapshot);
  process.exit(1);
}

main().catch((e) => {
  log("FAIL", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
