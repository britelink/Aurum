import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "@/lib/payment/service";
import { api } from "@/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const paymentService = new PaymentService();
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  return await processPayment(req);
}

export async function GET(req: NextRequest) {
  return await processPayment(req);
}

async function processPayment(req: NextRequest) {
  console.log("=== PAYMENT PROCESSING START ===");
  console.log("Request method:", req.method);
  console.log("Request URL:", req.url);

  try {
    let resourcePath: string;

    if (req.method === "POST") {
      console.log("Processing POST request");
      const formData = await req.formData();
      resourcePath = formData.get("resourcePath") as string;
      console.log("POST resourcePath:", resourcePath);
    } else {
      console.log("Processing GET request");
      // Handle GET request with query parameters
      const url = new URL(req.url);
      resourcePath = url.searchParams.get("resourcePath") || "";
      console.log("GET resourcePath:", resourcePath);
    }

    console.log("Resource path:", resourcePath);

    if (!resourcePath) {
      console.log("ERROR: No resource path found");
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Payment Error</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #d32f2f; margin: 20px 0; }
            .btn { background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
            .btn:hover { background: #1565c0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Payment Error</h2>
            <p class="error">Missing payment information</p>
            <a href="/play" class="btn">Back to Game</a>
            <a href="/" class="btn">Go Home</a>
          </div>
        </body>
        </html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    console.log("Checking payment status...");
    // Check payment status
    const statusResponse =
      await paymentService.checkPaymentStatus(resourcePath);
    console.log("Payment status response:", statusResponse);

    if (statusResponse.success) {
      console.log("Payment successful! Processing...");
      // Extract transaction data
      const data = statusResponse.data as {
        merchantTransactionId: string;
        amount: string;
      };
      const amount = parseFloat(data.amount);
      console.log("Amount:", amount);
      console.log("Merchant transaction ID:", data.merchantTransactionId);

      // Extract user ID from merchant transaction ID
      const userId = data.merchantTransactionId.split("-")[0];
      console.log("Extracted user ID:", userId);

      // Update user balance in Convex using admin mutation
      console.log("Calling Convex mutation...");
      try {
        await convex.mutation(api.aurum.adminDepositFunds, {
          userId: userId,
          amount: amount,
          paymentMethod: "card-usd",
        });
        console.log("Convex mutation successful");
      } catch (convexError) {
        console.error("Convex mutation failed:", convexError);
        throw convexError;
      }

      // Redirect to play page on success
      console.log("Redirecting to play page...");
      const playUrl = `/play`;
      return NextResponse.redirect(new URL(playUrl, req.url));
    } else if (statusResponse.pending) {
      console.log("Payment is pending");
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Payment Pending</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #d32f2f; margin: 20px 0; }
            .btn { background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
            .btn:hover { background: #1565c0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Payment Pending</h2>
            <p class="error">Your payment is still being processed. Please wait a moment and try again.</p>
            <a href="/play" class="btn">Back to Game</a>
            <a href="/" class="btn">Go Home</a>
          </div>
        </body>
        </html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      );
    } else {
      console.log("Payment failed:", statusResponse.error);
      // Show error page
      const errorMessage = statusResponse.error || "Payment failed";
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Payment Failed</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #d32f2f; margin: 20px 0; }
            .btn { background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
            .btn:hover { background: #1565c0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Payment Failed</h2>
            <p class="error">${errorMessage}</p>
            <p>Don't worry, your account has not been charged.</p>
            <a href="/play" class="btn">Try Again</a>
            <a href="/" class="btn">Go Home</a>
          </div>
        </body>
        </html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        },
      );
    }
  } catch (error) {
    console.error("=== PAYMENT PROCESSING ERROR ===");
    console.error("Error details:", error);
    console.error(
      "Error message:",
      error instanceof Error ? error.message : "Unknown error",
    );
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack trace",
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
      <head>
        <title>Payment Error</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .error { color: #d32f2f; margin: 20px 0; }
          .btn { background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
          .btn:hover { background: #1565c0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Payment Error</h2>
          <p class="error">${errorMessage}</p>
          <p>Something went wrong. Please try again.</p>
          <a href="/play" class="btn">Try Again</a>
          <a href="/" class="btn">Go Home</a>
        </div>
      </body>
      </html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      },
    );
  }
}
