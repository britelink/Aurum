/**
 * Chessa, spoken to directly.
 *
 * Ported from SGX's `chessa.ts`. Until now Penny Game reached Chessa by calling
 * SGX's `v0public` bridge, which meant every cash-out depended on SGX's
 * deployment being up, its provider switches being set our way, and its
 * integration account existing — none of which are things this platform
 * controls. Penny Game has its own Chessa credentials, so the off-ramp is its
 * own from here. SGX is used for one thing only now: the EcoCash on-ramp.
 *
 * Auth is `x-client-id` / `x-client-secret` headers — not Basic, not Bearer.
 * That is the documented scheme and the one SGX uses; getting it wrong returns
 * a 401 that reads like a bad key.
 *
 * Errors are sanitised on the way out. A player should never see a provider's
 * name, a request id or an endpoint in a message about their own money, and
 * neither should a support ticket that quotes one back to us.
 */
import { action, internalAction } from "./_generated/server";
import { ConvexError, v } from "convex/values";

const API_VERSION = "v1";

function baseUrl(): string {
  let url = process.env.CHESSA_API_BASE_URL?.trim() || "https://api.chessa.ai";
  url = url.replace(/\/$/, "");
  // A base already carrying /v1 would otherwise produce /v1/v1/orders.
  return url.replace(/\/v1$/i, "");
}

function url(path: string): string {
  const p = path.replace(/^\//, "");
  return p.startsWith(`${API_VERSION}/`)
    ? `${baseUrl()}/${p}`
    : `${baseUrl()}/${API_VERSION}/${p}`;
}

function headers(): Record<string, string> {
  const clientId = process.env.CHESSA_CLIENT_ID?.trim();
  const clientSecret =
    process.env.CHESSA_CLIENT_SECRET?.trim() ||
    process.env.CHESSA_API_KEY?.trim();
  if (!clientId || !clientSecret) {
    throw new ConvexError(
      "Chessa is not configured: set CHESSA_CLIENT_ID and CHESSA_CLIENT_SECRET on Convex.",
    );
  }
  return {
    "Content-Type": "application/json",
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
  };
}

/** Strip anything that names our provider or their plumbing. */
function sanitize(message: string): string {
  return message
    .replace(/chessa/gi, "the payout network")
    .replace(/api\.the payout network\.ai/gi, "the payout network")
    .replace(/\[Request ID:[^\]]*\]/gi, "")
    .trim();
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const res = await fetch(url(path), {
    method: init.method,
    headers: headers(),
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();

  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      detail = parsed.message || parsed.error || detail;
    } catch {
      /* keep the raw body */
    }
    throw new ConvexError(
      `Payout network error (${res.status}): ${sanitize(detail)}`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text } as T;
  }
}

/**
 * Their name for the chain, not ours.
 *
 * We say "BNB Smart Chain (BEP20)" everywhere because that is what a player
 * needs to read on a deposit screen. Chessa wants "BNB Chain", and sending the
 * long form silently defaults their funding step to Tron — which is how a
 * payout ends up quoted against a wallet we hold no key for.
 */
export function chainForChessa(chain: string): string {
  const map: Record<string, string> = {
    "BNB Chain": "BNB Chain",
    "BNB Smart Chain": "BNB Chain",
    "BNB Smart Chain (BEP20)": "BNB Chain",
    "Binance Smart Chain": "BNB Chain",
    "BEP-20": "BNB Chain",
    BEP20: "BNB Chain",
    BSC: "BNB Chain",
  };
  return map[chain.trim()] ?? chain.trim();
}

// ---------------------------------------------------------------------------
// The calls
// ---------------------------------------------------------------------------

type ChessaConfig = {
  payouts?: Array<{
    country?: { code?: string; name?: string };
    currency?: { code?: string };
    limits?: { min?: number; max?: number };
    methods?: Array<{
      id?: string;
      code?: string;
      type?: string;
      fields?: Array<{ id?: string; options?: Array<{ id?: string }> }>;
    }>;
  }>;
};

export const getConfig = internalAction({
  args: {},
  handler: async (): Promise<ChessaConfig> =>
    await call<ChessaConfig>("configurations", { method: "GET" }),
});

/**
 * The institution code for a provider, read out of the live configuration.
 *
 * Chessa identifies EcoCash by a code that lives in their config rather than by
 * the name we use for it, and hard-coding the value we saw once is how an
 * integration breaks the day they re-issue it.
 */
function findRoute(config: ChessaConfig, country: string, providerCode: string) {
  const route = (config.payouts ?? []).find(
    (p) => (p.country?.code ?? "").toUpperCase() === country.toUpperCase(),
  );
  if (!route) {
    throw new ConvexError(`Payouts to ${country} are not available.`);
  }
  const currency = route.currency?.code ?? "USD";

  let code: string | undefined;
  for (const method of route.methods ?? []) {
    const offersProvider = (method.fields ?? []).some((f) =>
      (f.options ?? []).some((o) => o.id === providerCode),
    );
    if (offersProvider || method.id === providerCode) {
      code = method.code;
      break;
    }
  }
  if (!code) code = route.methods?.[0]?.code;
  if (!code) {
    throw new ConvexError(
      `No payout method for ${providerCode} in ${country}.`,
    );
  }
  return { currency, code, limits: route.limits ?? {} };
}

/** Name enquiry: who actually owns this number. Writes nothing. */
export const validateRecipient = internalAction({
  args: { phone: v.string(), country: v.string(), providerCode: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ validated: boolean; name: string | null }> => {
    const config = await call<ChessaConfig>("configurations", { method: "GET" });
    const { code } = findRoute(config, args.country, args.providerCode);

    try {
      const res = await call<{
        validation?: { accountName?: string };
        accountName?: string;
        name?: string;
      }>("recipients/validate", {
        method: "POST",
        body: { code, accountNumber: args.phone },
      });
      const name =
        res?.validation?.accountName ?? res?.accountName ?? res?.name ?? null;
      return { validated: Boolean(name), name };
    } catch {
      // A number the network does not recognise is a normal answer, not a fault.
      return { validated: false, name: null };
    }
  },
});

export const createRecipient = internalAction({
  args: {
    phone: v.string(),
    accountName: v.string(),
    country: v.string(),
    providerCode: v.string(),
    payoutMethod: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ recipientId: string; accountName: string }> => {
    const config = await call<ChessaConfig>("configurations", { method: "GET" });
    const { currency, code } = findRoute(
      config,
      args.country,
      args.providerCode,
    );

    const res = await call<{
      id?: string;
      recipient?: { id?: string; accountName?: string };
      accountName?: string;
      actualAccountName?: string;
    }>("recipients", {
      method: "POST",
      body: {
        type: args.payoutMethod,
        country: args.country,
        currency,
        code,
        accountNumber: args.phone,
        accountName: args.accountName,
      },
    });

    const recipientId = res?.recipient?.id ?? res?.id;
    if (!recipientId) {
      throw new ConvexError("The payout network did not return a recipient.");
    }
    return {
      recipientId: String(recipientId),
      // Their name wins: they run the enquiry, we do not.
      accountName:
        res?.actualAccountName ??
        res?.recipient?.accountName ??
        res?.accountName ??
        args.accountName,
    };
  },
});

export const createOrder = internalAction({
  args: {
    recipientId: v.string(),
    originAsset: v.string(),
    originAmount: v.number(),
    destinationAsset: v.string(),
    chain: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const res = await call<{ order?: Record<string, unknown> }>("orders", {
      method: "POST",
      body: {
        recipientId: args.recipientId,
        originAsset: args.originAsset,
        originAmount: args.originAmount,
        destinationAsset: args.destinationAsset,
        chain: chainForChessa(args.chain),
      },
    });
    return (res?.order as Record<string, unknown>) ?? (res as Record<string, unknown>);
  },
});

/**
 * Where to send the crypto for an order.
 *
 * The chain must be repeated here. Their funding step defaults to Tron when it
 * is omitted, regardless of the chain the order was created with — which is
 * exactly how a BSC order came back with a Tron address and a payout died
 * against a wallet nobody holds a key for.
 */
export const getFundingAddress = internalAction({
  args: { orderId: v.string(), chain: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ address: string | null; network: string | null; raw: unknown }> => {
    const res = await call<{
      address?: string;
      paymentAddress?: string;
      network?: string;
      chain?: string;
      order?: { cryptoAddress?: string; network?: string };
    }>(`${API_VERSION}/orders/funding`, {
      method: "POST",
      body: { orderId: args.orderId, chain: chainForChessa(args.chain) },
    });

    return {
      address:
        res?.paymentAddress ?? res?.address ?? res?.order?.cryptoAddress ?? null,
      network: res?.network ?? res?.chain ?? res?.order?.network ?? null,
      raw: res,
    };
  },
});

export const getOrderStatus = internalAction({
  args: { orderId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string | null; notFound: boolean }> => {
    try {
      const res = await call<{
        status?: string;
        state?: string;
        order?: { status?: string };
      }>(`orders/${args.orderId}`, { method: "GET" });
      const status = res?.status ?? res?.order?.status ?? res?.state ?? null;
      return { status: status ? status.toLowerCase() : null, notFound: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("(404)")) return { status: null, notFound: true };
      throw e;
    }
  },
});

/** Return crypto we sent to an order the network could not complete. */
export const requestRefund = internalAction({
  args: { orderId: v.string(), address: v.string(), tag: v.optional(v.string()) },
  handler: async (ctx, args): Promise<unknown> =>
    await call("orders/refund", {
      method: "POST",
      body: { orderId: args.orderId, address: args.address, tag: args.tag ?? "" },
    }),
});

export const getRate = internalAction({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args): Promise<{ rate: number | null }> => {
    const res = await call<{ rate?: number; price?: number }>(
      `rates/${args.from}/${args.to}`,
      { method: "GET" },
    );
    const rate = Number(res?.rate ?? res?.price);
    return { rate: Number.isFinite(rate) && rate > 0 ? rate : null };
  },
});

/** The payout limits for a country, live. */
export const getLimits = internalAction({
  args: { country: v.string(), providerCode: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ min: number | null; max: number | null }> => {
    const config = await call<ChessaConfig>("configurations", { method: "GET" });
    const { limits } = findRoute(config, args.country, args.providerCode);
    return {
      min: Number.isFinite(Number(limits.min)) ? Number(limits.min) : null,
      max: Number.isFinite(Number(limits.max)) ? Number(limits.max) : null,
    };
  },
});

/** Are our own Chessa credentials working? Admin-facing, writes nothing. */
export const connectionCheck = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ ok: boolean; routes: number; error: string | null }> => {
    try {
      const config = await call<ChessaConfig>("configurations", {
        method: "GET",
      });
      return {
        ok: true,
        routes: (config.payouts ?? []).length,
        error: null,
      };
    } catch (e) {
      return {
        ok: false,
        routes: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
});
