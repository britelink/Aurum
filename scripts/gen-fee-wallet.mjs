#!/usr/bin/env node
/**
 * Generate a fresh wallet and hand its key straight to Convex.
 *
 * Same idea as SGX's `gen-deployer.cjs` and the `SET_CONVEX` path in
 * `derive-wallet-address.mts`: the key is created in memory, passed to the
 * Convex CLI by this process, and **never printed**. Only the address, which is
 * public, reaches your terminal. A key echoed to stdout ends up in scrollback,
 * in a screenshot, or pasted into a chat while asking whether it worked — and
 * from that moment the wallet belongs to whoever read it.
 *
 * Built for Penny Game's fee-holding wallet: the address withdrawal fees
 * accumulate in, kept apart from the agent wallet so that what the platform has
 * earned is not sitting in the same pool as what players are owed. Those are
 * two different claims on the same token, and one balance cannot answer both
 * questions honestly.
 *
 * Usage
 *   node scripts/gen-fee-wallet.mjs --prod
 *   node scripts/gen-fee-wallet.mjs --prod --confirm
 *   node scripts/gen-fee-wallet.mjs --prod --confirm --var FEESHOLDINGWALLET
 *
 * Without --confirm it reports what it would do and creates nothing.
 *
 * --reveal prints the key and recovery phrase **once** so you can put them in a
 * password manager. Read the warning it prints before using it. A key that
 * exists only inside Convex is a key you lose with the deployment.
 */

import { ethers } from "ethers";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const PROD = argv.includes("--prod");
const CONFIRM = argv.includes("--confirm");
const REVEAL = argv.includes("--reveal");
const VAR = flag("var") || "FEESHOLDINGWALLET";
const ADDRESS_VAR = `${VAR}_ADDRESS`;

const target = PROD ? ["--prod"] : [];
const label = PROD ? "prod" : "dev";

function convexEnv(args) {
  /*
   * Windows needs `shell: true`: since Node 18.20 (the CVE-2024-27980 fix)
   * spawning a .cmd without one throws EINVAL, and npx on Windows is npx.cmd.
   * A shell parses the argument rather than passing it through, so every value
   * that goes this way is shape-checked first — see setVar.
   */
  return execFileSync("npx", ["convex", "env", ...args], {
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function existingValue(name) {
  try {
    return convexEnv(["get", ...target, name]).trim();
  } catch {
    // `env get` exits non-zero when the variable is not set. That is the
    // answer, not an error.
    return "";
  }
}

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

/*
 * Refuse to clobber, and check before generating rather than after.
 *
 * This is the guard that matters. Overwriting a fee wallet's key replaces the
 * only means of spending whatever that wallet already holds — the tokens stay
 * on chain, visible forever, and unreachable. There is no recovery from it, so
 * the script will not do it even with --confirm.
 */
const already = existingValue(VAR);
if (already) {
  const addr = existingValue(ADDRESS_VAR);
  die(
    `${VAR} is already set on the ${label} deployment${addr ? ` (${addr})` : ""}.\n` +
      "  Refusing to overwrite it. Replacing the key would strand any balance\n" +
      "  that wallet holds — the tokens would stay on chain with nobody able to\n" +
      "  sign for them. Remove it by hand first if you are certain it is empty.",
  );
}

const wallet = ethers.Wallet.createRandom();

console.log(`
  deployment  ${label}
  variable    ${VAR}
  address     ${wallet.address}
`);

if (!CONFIRM) {
  console.log(
    "  Nothing was set, and this wallet was discarded — re-running generates a\n" +
      "  different address. Add --confirm to create one and store its key.\n",
  );
  process.exit(0);
}

function setVar(name, value) {
  /*
   * Prove the value cannot be anything but what it claims to be before it goes
   * through a shell. A secp256k1 key is always 0x plus 64 hex characters and an
   * address 0x plus 40 — neither leaves anything a shell could interpret.
   */
  const ok =
    name === VAR
      ? /^0x[0-9a-fA-F]{64}$/.test(value)
      : /^0x[0-9a-fA-F]{40}$/.test(value);
  if (!ok) die(`${name} is not the expected shape. Nothing was set.`);
  /*
   * Capture the CLI's output rather than inheriting it. `convex env set` prints
   * the value it just stored -- which would put the key in scrollback and undo
   * the whole point of generating it in this process. Learned the hard way.
   */
  execFileSync("npx", ["convex", "env", "set", ...target, name, value], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  console.log(`  set ${name} on ${label}`);
}

setVar(VAR, wallet.privateKey);
setVar(ADDRESS_VAR, wallet.address);

console.log(`
  Done. ${VAR} now signs for ${wallet.address}.
  The key was not printed.
`);

if (REVEAL) {
  console.log(
    "  ────────────────────────────────────────────────────────────────\n" +
      "  REVEALED BELOW. This is the only time it is shown.\n" +
      "  Put it in a password manager, then clear your terminal scrollback.\n" +
      "  Anything you paste it into — a chat, a note, a screenshot — owns\n" +
      "  this wallet from then on.\n" +
      "  ────────────────────────────────────────────────────────────────\n",
  );
  console.log(`  private key  ${wallet.privateKey}`);
  console.log(`  phrase       ${wallet.mnemonic?.phrase ?? "(none)"}\n`);
} else {
  console.log(
    "  Back it up. Right now the only copy of this key is inside the Convex\n" +
      "  deployment, so losing the deployment loses the wallet. Re-run with\n" +
      "  --reveal on a machine you trust to print it once for your password\n" +
      "  manager.\n",
  );
}

console.log(`  https://bscscan.com/address/${wallet.address}\n`);
