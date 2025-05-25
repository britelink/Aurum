// app/api/payment/create-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PaymentService } from "@/lib/payment/service";
import { CheckoutRequest } from "@/lib/payment/types";
import { PaymentError, ValidationError } from "@/lib/payment/errors";

const paymentService = new PaymentService();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate request
    if (!body.amount || !body.userId || !body.paymentMethod) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const checkoutRequest: CheckoutRequest = {
      amount: Number(body.amount),
      currency: body.currency || "USD",
      paymentMethod: body.paymentMethod,
      userId: body.userId,
    };

    const checkoutResponse =
      await paymentService.prepareDeposit(checkoutRequest);

    return NextResponse.json({
      checkoutId: checkoutResponse.id,
      paymentBrand: checkoutResponse.paymentBrand,
    });
  } catch (error) {
    console.error("Payment session creation failed:", error);

    if (error instanceof PaymentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 },
      );
    }

    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to create payment session" },
      { status: 500 },
    );
  }
}
