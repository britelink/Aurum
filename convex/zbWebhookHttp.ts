/**
 * ZB's result callback, treated as a nudge rather than as news.
 *
 * The endpoint is unauthenticated — ZB posts to whatever `resultUrl` we hand
 * them, with no shared secret to verify. So nothing in the body is believed.
 * All it does is pull out a reference we already know about and go ask ZB's
 * `status/check` what happened, which is the same question the poll asks and
 * the same answer it acts on.
 *
 * That makes the worst case of a forged POST a wasted status read. The
 * alternative — crediting from the payload — would mean anyone who learned a
 * reference could mint a balance.
 *
 * Nothing depends on this route. The scheduled poll settles every deposit on
 * its own; the callback only makes it faster when ZB is prompt.
 */

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const zbWebhook = httpAction(async (ctx, request) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // ZB has been known to post form-encoded or empty bodies. Neither is fatal
    // here, because the body is not what we act on.
  }

  const reference =
    (typeof body.orderReference === "string" && body.orderReference) ||
    (typeof body.reference === "string" && body.reference) ||
    (typeof body.merchantReference === "string" && body.merchantReference) ||
    null;

  if (reference) {
    await ctx.runAction(internal.zbDeposit.recheckByReference, { reference });
  }

  /*
   * Always 200. A non-2xx tells ZB to retry a delivery we do not need, and a
   * reference we cannot place is far more likely to be noise than a deposit —
   * either way it is not ZB's problem to solve.
   */
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
