import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { sgxWithdrawalCallback } from "./sgxCallbackHttp";
import { zbWebhook } from "./zbWebhookHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

// POST — SGX / Chessa forward when EcoChessa is complete or failed (set PENNY_SGX_CALLBACK_SECRET in Convex)
http.route({
  path: "/sgx/withdrawal-callback",
  method: "POST",
  handler: sgxWithdrawalCallback,
});

// POST -- ZB Smile&Pay posts here when an EcoCash express payment settles. The
// body is not trusted; it only tells us which deposit to re-check. See
// zbWebhookHttp.ts.
http.route({
  path: "/zb/webhook",
  method: "POST",
  handler: zbWebhook,
});

export default http;
