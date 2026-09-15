import { NextResponse } from "next/server";

/**
 * Retired.
 *
 * This route credited the house balance from an **unauthenticated** POST: no
 * session, no signature, no shared secret — an amount in a JSON body and the
 * money appeared. That was survivable only while balances could not leave the
 * platform. They can now: the outbound rail sends real USDT from the agent
 * wallet, so any endpoint that can mint a balance can drain the float.
 *
 * Manual credits belong to `aurum.adminAdjustBalance`, which requires an
 * authenticated admin identity and writes an `adminActions` row.
 *
 * Safe to delete this file and its `debit` sibling along with `app/api/payment`
 * and `app/api/withdrawal`; it is left here only as a 410 so anything still
 * pointing at it fails loudly instead of 404-ing into a retry loop.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Retired endpoint",
      detail:
        "House credits now require an authenticated admin (aurum.adminAdjustBalance).",
    },
    { status: 410 },
  );
}
