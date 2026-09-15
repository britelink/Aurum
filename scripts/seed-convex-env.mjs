#!/usr/bin/env node
/**
 * Seed Aurum's Convex deployment with the env the rails and auth need.
 *
 * Aurum is a child of SGX and inherits most of its configuration, but the two
 * deployments do not share an env store — every variable has to be set on
 * Aurum's Convex separately, and the names drifted (`PRIVATE_KEY` there,
 * `AURUM_AGENT_PRIVATE_KEY` here). Doing that by hand is how a deployment ends
 * up with a watcher that silently does nothing because one name was missed.
 *
 * Sources, in priority order, first hit wins:
 *   1. the real process environment
 *   2. Aurum's own `.env.local`
 *   3. SGX's `.env.local`, via `--sgx <path>`
 *
 * Usage
 *   node scripts/seed-convex-env.mjs                     # show what would be set
 *   node scripts/seed-convex-env.mjs --apply             # set it on the dev deployment
 *   node scripts/seed-convex-env.mjs --apply --prod      # ...on production
 *   node scripts/seed-convex-env.mjs --sgx ../chessa-main/.env.local
 *
 * Secrets are never printed in full: the plan shows a fingerprint, and the
 * value only ever travels from this process into `npx convex env set`.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const PROD = argv.includes("--prod");
const sgxIdx = argv.indexOf("--sgx");
const SGX_ENV_PATH = sgxIdx >= 0 ? argv[sgxIdx + 1] : null;

// ---------------------------------------------------------------------------

function parseEnvFile(file) {
  if (!file || !fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const localEnv = parseEnvFile(path.resolve(process.cwd(), ".env.local"));
const sgxEnv = parseEnvFile(SGX_ENV_PATH && path.resolve(SGX_ENV_PATH));

/** First non-empty value across the sources, for any of the given names. */
function pick(...names) {
  for (const name of names) {
    for (const source of [process.env, localEnv, sgxEnv]) {
      const v = source?.[name];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

function fingerprint(value) {
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 2)}…(${value.length})`;
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 6);
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length}, ${hash})`;
}

const SECRET = /KEY|SECRET|TOKEN|PASSWORD/i;

// ---------------------------------------------------------------------------
// What Aurum's Convex actually reads. Keep this list in step with the code —
// if a module starts reading a new variable, it belongs here on the same commit.
// ---------------------------------------------------------------------------

const PLAN = [
  // ---- Inbound + outbound crypto rail (deposits.ts, depositWatcherNode.ts,
  //      cryptoPayoutNode.ts, railLib.ts) --------------------------------------
  {
    name: "AURUM_AGENT_PRIVATE_KEY",
    from: () => pick("AURUM_AGENT_PRIVATE_KEY", "PENNY_TREASURY_BEP20_PRIVATE_KEY", "PRIVATE_KEY"),
    required: true,
    why: "Signs payouts AND derives the address deposits are watched on. Without it neither rail runs.",
  },
  {
    name: "AURUM_AGENT_WALLET_ADDRESS",
    from: () => pick("AURUM_AGENT_WALLET_ADDRESS", "PENNY_ONRAMP_WALLET_BEP20", "PENNY_TREASURY_BEP20_ADDRESS"),
    required: false,
    why: "Asserted against the key before any transfer — a mismatch means the wrong wallet is about to pay out.",
  },
  {
    name: "AURUM_DEPOSIT_ADDRESS",
    from: () => pick("AURUM_DEPOSIT_ADDRESS", "SGX_INBOUND_DEPOSIT_ADDRESS"),
    required: false,
    why: "Only if inbound should land somewhere other than the signing wallet. Also lets the first deposit be quoted before the watcher has ever run.",
  },
  {
    name: "AURUM_BSC_RPC_URL",
    from: () => pick("AURUM_BSC_RPC_URL", "PENNY_BSC_RPC_URL", "BSC_RPC_URL"),
    required: true,
    why: "A dedicated endpoint with a real eth_getLogs allowance. The public dataseeds refuse getLogs outright — on those the watcher makes no progress at all, and no deposit is ever credited.",
  },
  {
    name: "IS_LIVE",
    from: () => pick("IS_LIVE") ?? "false",
    required: true,
    why: "Chooses mainnet vs testnet token contracts. Wrong value = watching the wrong USDT.",
  },
  {
    name: "AURUM_WITHDRAW_FEE_PERCENT",
    from: () => pick("AURUM_WITHDRAW_FEE_PERCENT") ?? "1.5",
    required: false,
    why: "Outbound fee. Inbound is free by design and has no knob.",
  },
  {
    name: "AURUM_WITHDRAW_MIN_FEE_USD",
    from: () => pick("AURUM_WITHDRAW_MIN_FEE_USD") ?? "0.25",
    required: false,
    why: "Floor, so a dust withdrawal cannot cost the house more gas than it charges.",
  },

  // ---- EcoCash off-ramp, straight to Chessa's Convex (chessaBridge.ts) -------
  {
    name: "CHESSA_CONVEX_URL",
    from: () => pick("CHESSA_CONVEX_URL", "SGX_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL_SGX"),
    required: true,
    why: "Chessa's deployment URL. EcoCash payouts call its v0public:cryptoToEcocash directly — no sgxremit.com HTTP hop.",
  },
  {
    name: "CHESSA_V0_INTERNAL_SECRET",
    from: () => pick("CHESSA_V0_INTERNAL_SECRET", "SGX_V0_INTERNAL_ACTION_SECRET"),
    required: true,
    why: "Must equal Chessa's own V0_API_INTERNAL_SECRET, or every off-ramp call is refused as a bridge-secret mismatch.",
  },
  {
    name: "PENNY_WITHDRAW_CHAIN",
    from: () => pick("PENNY_WITHDRAW_CHAIN", "SGX_V0_OFFRAMP_CHAIN") ?? "BNB Smart Chain (BEP20)",
    required: false,
    why: "Chessa's funding step defaults to Tron when this is omitted, regardless of the chain the order was created with.",
  },
  {
    name: "PENNY_WITHDRAW_ORIGIN_ASSET",
    from: () => pick("PENNY_WITHDRAW_ORIGIN_ASSET") ?? "USDT",
    required: false,
    why: "Asset the agent wallet funds Chessa's payment address with.",
  },

  // ---- Legacy Tron leg, still reachable if Chessa quotes a Tron address ------
  {
    name: "PENNY_TREASURY_TRON_PRIVATE_KEY",
    from: () => pick("PENNY_TREASURY_TRON_PRIVATE_KEY"),
    required: false,
    why: "Only used when Chessa returns a Tron payment address. Leave unset if the off-ramp is BSC-only.",
  },
  {
    name: "PENNY_TREASURY_TRC20_ADDRESS",
    from: () => pick("PENNY_TREASURY_TRC20_ADDRESS"),
    required: false,
    why: "Asserted against the Tron key, same reason as the BEP-20 pair.",
  },

  // ---- Admin gate (aurum.ts) ------------------------------------------------
  {
    name: "ADMIN_EMAILS",
    from: () => pick("ADMIN_EMAILS"),
    required: false,
    why: "Comma-separated allowlist, for admins who have no `role: admin` on their users row yet.",
  },
  {
    name: "ADMIN_USER_IDS",
    from: () => pick("ADMIN_USER_IDS"),
    required: false,
    why: "Same, by Convex document id.",
  },

  // ---- Convex Auth ----------------------------------------------------------
  {
    name: "SITE_URL",
    from: () => pick("SITE_URL", "NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
    required: true,
    why: "Where OAuth comes back to. A stale value here is the usual cause of the Google sign-in 'ID wasn't valid base32' failure — see convex/AUTH-OAUTH-NOTES.txt.",
  },
  {
    name: "AUTH_GOOGLE_ID",
    from: () => pick("AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID"),
    required: false,
    why: "Google sign-in. Password auth works without it.",
  },
  {
    name: "AUTH_GOOGLE_SECRET",
    from: () => pick("AUTH_GOOGLE_SECRET", "GOOGLE_CLIENT_SECRET"),
    required: false,
    why: "Pairs with AUTH_GOOGLE_ID.",
  },
  {
    name: "JWT_PRIVATE_KEY",
    from: () => pick("JWT_PRIVATE_KEY"),
    required: true,
    generated: true,
    why: "Convex Auth signs session tokens with it. Generated here if absent — see `node generateKeys.mjs`.",
  },
  {
    name: "JWKS",
    from: () => pick("JWKS"),
    required: true,
    generated: true,
    why: "The public half of JWT_PRIVATE_KEY. The two MUST be generated together; a mismatched pair rejects every session.",
  },
];

// ---------------------------------------------------------------------------

async function generateAuthKeys() {
  const { exportJWK, exportPKCS8, generateKeyPair } = await import("jose");
  const keys = await generateKeyPair("RS256");
  const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
  const publicKey = await exportJWK(keys.publicKey);
  return {
    JWT_PRIVATE_KEY: privateKey,
    JWKS: JSON.stringify({ keys: [{ use: "sig", ...publicKey }] }),
  };
}

function convexEnvSet(name, value) {
  const args = ["convex", "env", "set", name, value];
  if (PROD) args.push("--prod");
  const res = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  return res.status === 0;
}

async function main() {
  const resolved = [];
  for (const entry of PLAN) {
    resolved.push({ ...entry, value: entry.from() });
  }

  // Auth keys are a pair or nothing. If either half is missing, mint both —
  // keeping one old half would sign with a key the JWKS does not describe.
  const jwtRow = resolved.find((r) => r.name === "JWT_PRIVATE_KEY");
  const jwksRow = resolved.find((r) => r.name === "JWKS");
  if (!jwtRow.value || !jwksRow.value) {
    const fresh = await generateAuthKeys();
    jwtRow.value = fresh.JWT_PRIVATE_KEY;
    jwksRow.value = fresh.JWKS;
    jwtRow.note = "generated now";
    jwksRow.note = "generated now";
  }

  const missing = resolved.filter((r) => r.required && !r.value);

  console.log(
    `\nAurum Convex env — ${APPLY ? (PROD ? "APPLYING to production" : "APPLYING to dev") : "dry run"}\n`,
  );
  if (SGX_ENV_PATH) console.log(`  SGX source: ${SGX_ENV_PATH}`);
  console.log("");

  for (const r of resolved) {
    const mark = r.value ? "✓" : r.required ? "✗" : "·";
    const shown = !r.value
      ? "(unset)"
      : SECRET.test(r.name)
        ? fingerprint(r.value)
        : r.value.length > 60
          ? `${r.value.slice(0, 57)}…`
          : r.value;
    console.log(`  ${mark} ${r.name.padEnd(34)} ${shown}${r.note ? `  [${r.note}]` : ""}`);
  }

  if (missing.length) {
    console.log("\nMissing and required:\n");
    for (const r of missing) console.log(`  ${r.name}\n      ${r.why}\n`);
  }

  if (!APPLY) {
    console.log(
      "\nNothing was written. Re-run with --apply (add --prod for production).\n",
    );
    // A dry run that found holes should still fail CI.
    process.exit(missing.length ? 1 : 0);
  }

  if (missing.length) {
    console.error(
      "\nRefusing to apply a partial rail configuration — fill the required values first.\n",
    );
    process.exit(1);
  }

  let failed = 0;
  for (const r of resolved) {
    if (!r.value) continue;
    console.log(`\nsetting ${r.name} …`);
    if (!convexEnvSet(r.name, r.value)) failed++;
  }

  console.log(
    failed
      ? `\nDone with ${failed} failure(s).\n`
      : "\nAll set. Deploy with `npx convex deploy` and the watcher starts on the next cron tick.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
