/**
 * The decision rules behind the EcoCash on-ramp, with nothing else attached.
 *
 * Same split as `railLib.ts` and `gameLib.ts`: the judgements that decide where
 * a player's money goes live in a module with no Convex imports, so the drill
 * in `scripts/rails-dryrun.mjs` can assert against the code that actually runs
 * rather than against a second copy of it written to agree with itself.
 *
 * These rules are small and they are the ones that hurt when wrong — "is this
 * transaction really dead", "may we push a second prompt" — so they are worth
 * being able to test without a network, a deployment, or a phone.
 */

export const ZB_SANDBOX_BASE_URL =
  "https://zbnet.zb.co.zw/wallet_sandbox_api/payments-gateway";
export const ZB_PRODUCTION_BASE_URL =
  "https://zbnet.zb.co.zw/wallet_gateway/payments-gateway";

/** ISO-4217 numeric for USD. ZB wants the number, not the letters. */
export const ZB_USD_CURRENCY_CODE = "840";

/** ZB's own word for "paid". Only this one credits. */
export const ZB_PAID_STATUS = "PAID";

/**
 * Statuses that mean the payment is already dead.
 *
 * Read in two opposite directions. When probing after a failed push, a terminal
 * status means the transaction exists but can never complete — so finding one is
 * *not* grounds to carry on. When polling, it means stop asking and release the
 * quote.
 */
export const ZB_TERMINAL_FAILURE_STATUSES = new Set([
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "DECLINED",
]);

export function isZbTerminalFailure(status: string | null | undefined): boolean {
  return ZB_TERMINAL_FAILURE_STATUSES.has((status ?? "").trim().toUpperCase());
}

export function isZbPaid(status: string | null | undefined): boolean {
  return (status ?? "").trim().toUpperCase() === ZB_PAID_STATUS;
}

export function zbBaseUrl(): string {
  return process.env.ZB_ENV?.trim() === "production"
    ? ZB_PRODUCTION_BASE_URL
    : ZB_SANDBOX_BASE_URL;
}

/**
 * `returnUrl` is mandatory on every ZB express-checkout call, even though the
 * published examples omit it for push methods and nothing here redirects.
 *
 * SGX found this the expensive way: omitting it makes ZB dereference a null
 * server-side ("Cannot invoke String.contains(...)"), which surfaces as an
 * opaque HTTP 500 — usually *after* the transaction row has been created and
 * the customer has been prompted. That one missing field accounted for every
 * express-checkout 500 they saw. Verified on their side 2026-07-29.
 */
export function zbReturnUrl(): string {
  const base = (process.env.SITE_URL?.trim() || "https://aurum-nu.vercel.app")
    .replace(/\/+$/, "");
  return `${base}/wallet`;
}

/** ZB says yes only with a 2xx *and* its own success code. */
export function isZbPushAccepted(
  httpOk: boolean,
  responseCode: string | null | undefined,
): boolean {
  return httpOk && responseCode === "00";
}

/**
 * Does a status-check response mean "a live transaction exists"?
 *
 * The three conditions are all load-bearing. A non-2xx tells us nothing. A
 * missing reference means ZB has no record, whatever else the body says. And a
 * terminal status means the record exists but the payer can never complete it —
 * carrying on would show them a payment screen for a dead payment.
 */
export function zbProbeSaysLive(args: {
  ok: boolean;
  reference?: string | null;
  status?: string | null;
}): boolean {
  return Boolean(args.ok && args.reference && !isZbTerminalFailure(args.status));
}

export type EcocashProvider = "pesepay" | "zb";

export function zbConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ZB_API_KEY?.trim() && env.ZB_API_SECRET?.trim());
}

export function pesepayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.PESEPAY_INTEGRATION_KEY?.trim() && env.PESEPAY_ENCRYPTION_KEY?.trim(),
  );
}

/**
 * Which collector to try first, and what to try after it.
 *
 * `AURUM_ECOCASH_PROVIDER` sets the preference; anything unconfigured drops out
 * of the list rather than being attempted and failing. The default puts Pesepay
 * first because those are the credentials this deployment has been collecting
 * on — which provider leads is an operator's lever, not a guess frozen at
 * deploy time.
 */
export function ecocashProviderOrder(
  env: NodeJS.ProcessEnv = process.env,
): EcocashProvider[] {
  const preferred = env.AURUM_ECOCASH_PROVIDER?.trim().toLowerCase();
  const order: EcocashProvider[] =
    preferred === "zb" ? ["zb", "pesepay"] : ["pesepay", "zb"];
  return order.filter((p) =>
    p === "zb" ? zbConfigured(env) : pesepayConfigured(env),
  );
}
