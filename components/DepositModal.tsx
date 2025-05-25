// components/DepositModal.tsx
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Loader2, DollarSign, CreditCard } from "lucide-react";
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
  onComplete,
}: DepositModalProps) {
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [isDepositing, setIsDepositing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card-usd");
  const [currentStep, setCurrentStep] = useState(1);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);

  // Payment methods with icons and descriptions
  // ... existing code ...
  const paymentMethods = [
    {
      id: "card-usd",
      label: "Credit/Debit Card (USD)",
      description: "International cards accepted",
      icon: "/logos/payments/vm.png",
      currency: "USD",
      paymentBrand: "VISA MASTER",
    },
    {
      id: "zimswitch-usd",
      label: "Zimswitch (USD)",
      description: "Local bank cards",
      icon: "/logos/payments/zs.jpeg",
      currency: "USD",
      paymentBrand: "PRIVATE_LABEL",
    },
    {
      id: "ecocash-usd",
      label: "EcoCash (USD)",
      description: "Mobile money payment",
      icon: "/logos/payments/ec.webp",
      currency: "USD",
      paymentBrand: "ECOCASH",
    },
  ];
  // ... existing code ...
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
          amount: depositAmount,
          currency: currency as Currency,
          paymentMethod: paymentMethod,
          userId: userId,
          email: email,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create payment session");
      }

      const { checkoutId, paymentBrand } = await response.json();
      setCheckoutId(checkoutId);
      setCurrentStep(2);

      // Load payment widget
      const script = document.createElement("script");
      script.src = `https://eu-test.oppwa.com/v1/paymentWidgets.js?checkoutId=${checkoutId}`;
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
    // Clean up payment widget script when closing
    const paymentScript = document.querySelector(
      'script[src*="paymentWidgets.js"]',
    );
    if (paymentScript) {
      paymentScript.remove();
    }

    setCurrentStep(1);
    setCheckoutId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit Funds</DialogTitle>
        </DialogHeader>

        {currentStep === 1 && (
          <div className="space-y-4 py-4">
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
                />
              </div>
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
                      <div className="flex items-center space-x-2">
                        <CreditCard className="h-4 w-4" />
                        <span>{method.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleDeposit}
              disabled={isDepositing || depositAmount < 1}
              className="w-full"
            >
              {isDepositing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Deposit $${depositAmount}`
              )}
            </Button>
          </div>
        )}

        {currentStep === 2 && checkoutId && (
          <div className="py-4">
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="text-blue-800">
                  Amount to pay: ${depositAmount.toFixed(2)}
                </p>
              </div>

              <form
                action="/api/payment/result"
                className="paymentWidgets"
                data-brands={selectedPaymentMethod?.paymentBrand}
              />

              <Button
                onClick={() => setCurrentStep(1)}
                variant="outline"
                className="w-full"
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
