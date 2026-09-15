import { NextResponse } from "next/server";

/**
 * Retired — the fiat on-ramp is gone.
 *
 * Card, Zimswitch and the hosted EcoCash widget never settled in production,
 * and the deposit path that replaced them is the on-chain one: `/wallet` quotes
 * a BEP-20 address and an exact amount, and `depositWatcherNode` credits the
 * player when the transfer confirms.
 *
 * Kept as a 410 rather than deleted so a stale client fails visibly. Delete the
 * whole of `app/api/payment`, `app/api/withdrawal`, `app/api/house` and
 * `lib/payment` when nothing points at them.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Fiat deposits are retired",
      detail: "Deposit crypto at /wallet — USDT or USDC on BNB Smart Chain.",
    },
    { status: 410 },
  );
}
