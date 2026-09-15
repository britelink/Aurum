import { NextResponse } from "next/server";

/**
 * Retired — see `../create-session/route.ts`.
 *
 * This one also credited a balance from a userId in the request body, with no
 * authenticated session behind it. That is now `deposits.confirmDeposit`, which
 * only ever runs from the chain watcher against a transfer it has seen.
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

export async function GET() {
  return NextResponse.redirect(new URL("/wallet", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
}
