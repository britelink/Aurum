// components/DepositModal.tsx
import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, DollarSign, X } from "lucide-react";
import { Currency, PaymentMethod } from "@/lib/payment/types";
import { toast } from "react-hot-toast";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email: string | undefined;
  onComplete: (success: boolean, amount?: number) => void;
}

export default function DepositModal({
  open,
  onOpenChange,
  userId,
  email,
}: DepositModalProps) {
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [isDepositing, setIsDepositing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card-usd");
  const [currentStep, setCurrentStep] = useState(1);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);

  // Payment methods with icons and descriptions
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

  const handleDeposit = async () => {
    try {
      setIsDepositing(true);

      // Create a payment session through your backend
      const response = await fetch("/api/payment/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: depositAmount * 100, // Convert to cents for API
          currency: currency as Currency,
          paymentMethod: paymentMethod,
          userId: userId,
          email: email,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create payment session");
      }

      const { checkoutId } = await response.json();
      setCheckoutId(checkoutId);
      setCurrentStep(2);

      // Load payment widget
      const script = document.createElement("script");
      script.src = `https://eu-prod.oppwa.com/v1/paymentWidgets.js?checkoutId=${checkoutId}`;
      script.async = true;
      script.onerror = () => {
        toast.error("Failed to load payment widget. Please try again.");
        setCurrentStep(1);
      };
      document.body.appendChild(script);
    } catch (error) {
      console.error("Deposit failed:", error);
      toast.error("Failed to initialize payment. Please try again.");
    } finally {
      setIsDepositing(false);
    }
  };

  const handleClose = () => {
    setCurrentStep(1);
    setCheckoutId(null);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="flex flex-row items-center justify-between">
          <SheetTitle>Deposit Funds</SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        {currentStep === 1 && (
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount to Deposit</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="pl-10"
                  placeholder="Enter amount"
                />
              </div>
              <p className="text-sm text-gray-500">Minimum deposit: $1.00</p>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value: PaymentMethod) =>
                  setPaymentMethod(value as PaymentMethod)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">{method.icon}</span>
                        <div className="flex flex-col">
                          <span className="font-medium">{method.label}</span>
                          <span className="text-xs text-gray-500">
                            {method.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                Payment Summary
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">
                    {currency} {depositAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Method:</span>
                  <span className="font-medium">
                    {selectedPaymentMethod?.label}
                  </span>
                </div>
              </div>
            </div>

            <Button
              onClick={handleDeposit}
              disabled={isDepositing || depositAmount < 1}
              className="w-full"
              size="lg"
            >
              {isDepositing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Deposit ${currency} ${depositAmount.toFixed(2)}`
              )}
            </Button>
          </div>
        )}

        {currentStep === 2 && checkoutId && (
          <div className="py-6">
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                  Complete Your Payment
                </h4>
                <p className="text-sm text-green-700 dark:text-green-200">
                  Amount to pay: {currency} {depositAmount.toFixed(2)}
                </p>
              </div>

              <form
                action="/api/payment/process"
                className="paymentWidgets"
                data-brands={selectedPaymentMethod?.paymentBrand}
              />

              <Button
                onClick={() => setCurrentStep(1)}
                variant="outline"
                className="w-full"
              >
                Back to Payment Options
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
