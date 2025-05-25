// app/api/payment/result/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "@/lib/payment/service";
import { api } from "@/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const paymentService = new PaymentService();
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const resourcePath = formData.get("resourcePath") as string;

    if (!resourcePath) {
      return NextResponse.json(
        { error: "Missing resource path" },
        { status: 400 },
      );
    }

    // Check payment status
    const statusResponse =
      await paymentService.checkPaymentStatus(resourcePath);

    if (statusResponse.success) {
      // Extract transaction data
      const data = statusResponse.data;
      const merchantTransactionId = data.merchantTransactionId;
      const amount = parseFloat(data.amount);

      if (!merchantTransactionId) {
        throw new Error("Missing merchant transaction ID");
      }

      // Format: userId-timestamp
      const userId = merchantTransactionId.split("-")[0];

      // Update user balance in Convex
      await convex.mutation(api.aurum.depositFunds, {
        amount: amount,
        paymentMethod: "eco-usd", // or appropriate method based on payment
      });

      return NextResponse.json({
        success: true,
        message: "Payment processed successfully",
        amount: amount,
        userId: userId,
      });
    } else if (statusResponse.pending) {
      return NextResponse.json({
        success: false,
        pending: true,
        message: statusResponse.reason || "Payment is pending",
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: statusResponse.error || "Payment failed",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Payment processing failed:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
