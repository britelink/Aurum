import { NextResponse } from "next/server";

/** Retired alongside `../credit/route.ts` — see the note there. */
export async function POST() {
  return NextResponse.json(
    {
      error: "Retired endpoint",
      detail:
        "House debits now require an authenticated admin (aurum.adminAdjustBalance).",
    },
    { status: 410 },
  );
}
