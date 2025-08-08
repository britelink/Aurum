import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "@/lib/payment/service";
import { api } from "@/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const paymentService = new PaymentService();
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  console.log("=== WITHDRAWAL REQUEST START ===");

  try {
    const body = await req.json();
    console.log("Withdrawal request body:", body);

    const { amount, paymentMethod, userId } = body;

    // Validate request
    if (!amount || !paymentMethod || !userId) {
      console.log("ERROR: Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (amount < 10) {
      console.log("ERROR: Minimum withdrawal amount is $10");
      return NextResponse.json(
        { error: "Minimum withdrawal amount is $10" },
        { status: 400 },
      );
    }

    if (amount > 1000) {
      console.log("ERROR: Maximum withdrawal amount is $1000");
      return NextResponse.json(
        { error: "Maximum withdrawal amount is $1000" },
        { status: 400 },
      );
    }

    console.log("Creating withdrawal checkout...");

    // Create withdrawal checkout with EFT PAY
    const checkoutRequest = {
      amount: amount,
      currency: (paymentMethod.includes("zwg") ? "ZWG" : "USD") as
        | "USD"
        | "ZWG",
      paymentMethod: paymentMethod,
      userId: userId,
      type: "withdrawal", // Indicate this is a withdrawal
    };

    console.log("Checkout request:", checkoutRequest);

    const checkoutResponse =
      await paymentService.prepareWithdrawal(checkoutRequest);
    console.log("Checkout response:", checkoutResponse);

    // Create withdrawal transaction in database
    console.log("Creating withdrawal transaction in database...");
    const transaction = await convex.mutation(api.aurum.adminWithdrawFunds, {
      userId: userId,
      amount: amount,
      paymentMethod: paymentMethod,
    });

    console.log("Withdrawal transaction created:", transaction);

    return NextResponse.json({
      success: true,
      checkoutId: checkoutResponse.id,
      transactionId: transaction,
      message: "Withdrawal initiated successfully",
    });
  } catch (error) {
    console.error("=== WITHDRAWAL REQUEST ERROR ===");
    console.error("Error details:", error);
    console.error(
      "Error message:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      {
        error: "Failed to initiate withdrawal",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
