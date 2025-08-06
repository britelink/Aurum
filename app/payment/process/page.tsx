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
      return NextResponse.redirect(
        new URL("/payment/failure?error=Missing resource path", req.url),
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
      const amount = parseFloat(data.amount);

      // Update user balance in Convex
      await convex.mutation(api.aurum.depositFunds, {
        amount: amount,
        paymentMethod: "card-usd", // Default to card-usd, can be enhanced to detect actual method
      });

      // Redirect to success page with amount
      const successUrl = `/payment/success?amount=${amount}`;
      return NextResponse.redirect(new URL(successUrl, req.url));
    } else if (statusResponse.pending) {
      return NextResponse.redirect(
        new URL("/payment/failure?error=Payment is pending", req.url),
      );
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

// Handle GET requests (in case someone visits the page directly)
export async function GET() {
  return NextResponse.redirect(
    new URL(
      "/play",
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    ),
  );
}
