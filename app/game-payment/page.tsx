"use client";
import { useState, useCallback, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Toaster, toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Wallet, DollarSign, CreditCard } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Types
type Currency = "USD" | "ZWG";
type PaymentMethod =
  | "card-usd"
  | "zimswitch-usd"
  | "zimswitch-zwg"
  | "ecocash-usd"
  | "ecocash-zwg";

interface PaymentState {
  currentStep: number;
  checkoutId: string | null;
  paymentAmount: number;
  isProcessing: boolean;
  paymentBrand: string;
}

const INITIAL_STATE: PaymentState = {
  currentStep: 1,
  checkoutId: null,
  paymentAmount: 0,
  isProcessing: false,
  paymentBrand: "",
};

export default function GamePaymentPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.aurum.getCurrentUser);
  const [state, setState] = useState<PaymentState>(INITIAL_STATE);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card-usd");

  const updateState = useCallback((updates: Partial<PaymentState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Payment methods
  const paymentMethods = [
    {
      id: "card-usd" as PaymentMethod,
      label: "Credit/Debit Card (USD)",
      description: "VISA, Mastercard - International cards accepted",
      icon: "💳",
      currency: "USD",
      paymentBrand: "VISA MASTER",
    },
    {
      id: "zimswitch-usd" as PaymentMethod,
      label: "Zimswitch (USD)",
      description: "Local Zimbabwe bank cards in USD",
      icon: "🏦",
      currency: "USD",
      paymentBrand: "PRIVATE_LABEL",
    },
    {
      id: "zimswitch-zwg" as PaymentMethod,
      label: "Zimswitch (ZWG)",
      description: "Local Zimbabwe bank cards in ZWG",
      icon: "🏦",
      currency: "ZWG",
      paymentBrand: "PRIVATE_LABEL",
    },
    {
      id: "ecocash-usd" as PaymentMethod,
      label: "EcoCash (USD)",
      description: "Mobile money payment in USD",
      icon: "📱",
      currency: "USD",
      paymentBrand: "ECOCASH",
    },
    {
      id: "ecocash-zwg" as PaymentMethod,
      label: "EcoCash (ZWG)",
      description: "Mobile money payment in ZWG",
      icon: "📱",
      currency: "ZWG",
      paymentBrand: "ECOCASH",
    },
  ];

  const selectedPaymentMethod = paymentMethods.find(
    (m) => m.id === paymentMethod,
  );
  const currency = selectedPaymentMethod?.currency || "USD";

  const handleProceedToPayment = useCallback(
    async (
      amount: number,
      currency: Currency,
      paymentMethod: PaymentMethod,
    ) => {
      if (!user) {
        toast.error("User not found");
        return;
      }

      try {
        updateState({ isProcessing: true });

        const response = await fetch("/api/payment/create-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amount,
            currency: currency,
            paymentMethod: paymentMethod,
            userId: user._id,
            email: user.email,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create payment session");
        }

        const { checkoutId, paymentBrand } = await response.json();

        updateState({
          checkoutId: checkoutId,
          paymentAmount: amount,
          paymentBrand: paymentBrand,
          currentStep: 2,
        });

        // Load payment widget
        const script = document.createElement("script");
        script.src = `https://eu-prod.oppwa.com/v1/paymentWidgets.js?checkoutId=${checkoutId}`;
        script.async = true;
        script.onerror = () => {
          toast.error(
            "Failed to load payment widget. Please refresh the page.",
          );
        };
        document.body.appendChild(script);
      } catch (error) {
        console.error("Payment processing failed:", error);
        toast.error("Payment processing failed. Please try again.");
      } finally {
        updateState({ isProcessing: false });
      }
    },
    [user, updateState],
  );

  const handlePaymentComplete = useCallback(
    (success: boolean) => {
      if (success) {
        toast.success("Payment processed successfully!");
        resetState();
        router.push("/play");
      } else {
        toast.error("Payment failed. Please try again.");
        updateState({ currentStep: 2 });
      }
    },
    [resetState, router, updateState],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    if (!amount || Number(amount) < 1) {
      toast.error("Please enter a valid amount (minimum $1)");
      return;
    }

    try {
      await handleProceedToPayment(
        Number(amount),
        currency as Currency,
        paymentMethod,
      );
    } catch (error) {
      console.error("Payment processing failed:", error);
      toast.error("Payment processing failed. Please try again.");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const paymentScript = document.querySelector(
        'script[src*="paymentWidgets.js"]',
      );
      if (paymentScript) {
        paymentScript.remove();
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
            Authentication Required
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Please sign in to make deposits.
          </p>
          <Button onClick={() => router.push("/signin")}>Sign In</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">
            Loading user data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/play")}
                className="text-slate-600 dark:text-slate-400"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Game
              </Button>
              <h1 className="text-xl font-bold text-slate-800 dark:text-white">
                Deposit Funds
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-slate-600 dark:text-slate-400">
                Balance: ${((user.balance || 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {state.currentStep === 1 && (
            <Card className="shadow-lg">
              <CardHeader className="border-b pb-4">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6 text-blue-600" />
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Payment Details
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Choose your preferred payment method
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-gray-700 dark:text-gray-300 mb-1.5 block">
                        Select Payment Method
                      </Label>
                      <Select
                        value={paymentMethod}
                        onValueChange={(value: PaymentMethod) =>
                          setPaymentMethod(value)
                        }
                      >
                        <SelectTrigger className="w-full h-14">
                          <SelectValue placeholder="Choose how you want to pay" />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem
                              key={method.id}
                              value={method.id}
                              className="h-14 py-3"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{method.icon}</span>
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {method.label}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {method.description}
                                  </span>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label
                        htmlFor="amount"
                        className="text-gray-700 dark:text-gray-300 mb-1.5 block"
                      >
                        Amount ({currency})
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          id="amount"
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="pl-10 h-14"
                          placeholder={`Enter amount (min. 1 ${currency})`}
                          required
                          min="1"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 transition-colors duration-300"
                    disabled={
                      state.isProcessing ||
                      !paymentMethod ||
                      !amount ||
                      Number(amount) < 1
                    }
                  >
                    {state.isProcessing ? (
                      "Processing..."
                    ) : (
                      <>Deposit {amount ? `${currency} ${amount}` : ""}</>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {state.currentStep === 2 && state.checkoutId && (
            <Card className="shadow-lg">
              <CardHeader>
                <h2 className="text-2xl font-semibold text-blue-800 dark:text-blue-300">
                  Complete Payment
                </h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
                    <p className="text-blue-800 dark:text-blue-200">
                      Amount to pay: {currency} {state.paymentAmount.toFixed(2)}
                    </p>
                  </div>

                  <form
                    action="/api/payment/process"
                    className="paymentWidgets"
                    data-brands={state.paymentBrand}
                  />

                  <Button
                    onClick={() => updateState({ currentStep: 1 })}
                    variant="outline"
                    className="w-full"
                  >
                    Back to Payment Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
