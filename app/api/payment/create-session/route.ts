import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { amount, email } = await request.json();

    // Validate the input
    if (!amount || amount < 1 || !email) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Create the payment session with iVeri
    // You'll need to implement this according to iVeri's API documentation
    const paymentSession = await createIveriPaymentSession({
      amount,
      email,
      merchantId: "i19_bdDjf3GU4pcehlysT6USOx0U1lvSt4z6U9djzp0",
      // Add other required parameters
    });

    return NextResponse.json({
      redirectUrl: paymentSession.redirectUrl,
    });
  } catch (error) {
    console.error("Payment session creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create payment session" },
      { status: 500 },
    );
  }
}
