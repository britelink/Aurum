import { NextResponse } from "next/server";

/**
 * Retired — the fiat off-ramp is gone.
 *
 * It debited whichever `userId` the caller put in the body, unauthenticated.
 * Withdrawals are now `cryptoWithdrawals.requestCryptoWithdrawal` (USDT/USDC to
 * the player's own address) and `withdrawals.requestEcocashWithdrawal` (EcoCash
 * via the Chessa rail). Both take the player from their Convex identity, never
 * from the request.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Retired endpoint",
      detail: "Withdraw at /wallet — crypto or EcoCash.",
    },
    { status: 410 },
  );
}
