import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Fixed house account ID
const HOUSE_USER_ID = "ks72m74heawkx1p7n524fbtnt97mj6y1";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const amount = Number(body.amount);

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    await convex.mutation(api.aurum.adminWithdrawFunds, {
      userId: HOUSE_USER_ID,
      amount,
      paymentMethod: "card-usd",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("House debit failed:", error);
    return NextResponse.json({ error: "House debit failed" }, { status: 500 });
  }
}
