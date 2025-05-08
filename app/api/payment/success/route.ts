import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: Request) {
  const data = await request.formData();
  const amount = Number(data.get("Lite_Order_Amount")) / 100; // Convert cents to dollars
  const email = data.get("Ecom_BillTo_Online_Email") as string;

  try {
    // Update user balance in database
    await convex.mutation(api.aurum.depositFunds, {
      amount,
      paymentMethod: "eco-usd",
    });

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/play`);
  } catch (error) {
    console.error("Payment processing failed:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/play?error=payment-failed`,
    );
  }
}
