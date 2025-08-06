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
      const data = statusResponse.data as {
        merchantTransactionId: string;
        amount: string;
      };
      const merchantTransactionId = data.merchantTransactionId;
      const amount = parseFloat(data.amount);

      if (!merchantTransactionId) {
        throw new Error("Missing merchant transaction ID");
      }

      // Format: userId-timestamp
      // const userId = merchantTransactionId.split("-")[0]; // Not needed as we use auth context

      // Update user balance in Convex
      await convex.mutation(api.aurum.depositFunds, {
        amount: amount,
        paymentMethod: "card-usd", // Default to card-usd, can be enhanced to detect actual method
      });

      // Redirect to success page with amount
      const successUrl = `/payment/success?amount=${amount}`;
      return NextResponse.redirect(new URL(successUrl, req.url));
    } else if (statusResponse.pending) {
      return NextResponse.json({
        success: false,
        pending: true,
        message: statusResponse.reason || "Payment is pending",
      });
    } else {
      // Redirect to failure page
      const errorMessage = statusResponse.error || "Payment failed";
      const failureUrl = `/payment/failure?error=${encodeURIComponent(errorMessage)}`;
      return NextResponse.redirect(new URL(failureUrl, req.url));
    }
  } catch (error) {
    console.error("Payment processing failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const failureUrl = `/payment/failure?error=${encodeURIComponent(errorMessage)}`;
    return NextResponse.redirect(new URL(failureUrl, req.url));
  }
}
