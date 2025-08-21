import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DollarSign, CreditCard, Lock, ArrowLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Currency, PaymentMethod } from "../actions/types";


interface PaymentInfoCardProps {
  onProceedToPayment: (
    amount: number,
    currency: Currency,
    paymentMethod: PaymentMethod
  ) => Promise<void>;
  isProcessing: boolean;
  onBack: () => void;
  minimumAmount?: number;
}

export default function PaymentInfoCard({
  onProceedToPayment,
  isProcessing,
  onBack,
  minimumAmount = 1,
}: PaymentInfoCardProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card-usd");
  const [validationError, setValidationError] = useState("");

  // Payment methods with clear icons and descriptions
  const paymentMethods = [
    {
      id: "card-usd",
      label: "Credit/Debit Card (USD)",
      description: "International cards accepted",
      icon: "/logos/payments/vm.png",
      currency: "USD",
    },
    {
      id: "zimswitch-usd",
      label: "Zimswitch (USD)",
      description: "Local bank cards",
      icon: "/logos/payments/zs.jpeg",
      currency: "USD",
    },
    // {
    //  id: "zimswitch-zwl",
    //  label: "Zimswitch (ZWL)",
    //  description: "Local bank cards in ZWL",
    //  icon: "/logos/payments/zs.jpeg",
    // currency: "ZWL",
    // },
    // {
    //   id: "ecocash-usd",
    //   label: "EcoCash (USD)",
    //   description: "Mobile money payment in USD",
    //   icon: "/logos/payments/ec.webp",
    //   currency: "USD",
    // },
    // {
    //  id: "ecocash-zwl",
    // label: "EcoCash (ZWL)",
    // description: "Mobile money payment in ZWL",
    //  icon: "/logos/payments/ec.webp",
    // currency: "ZWL",
    // },
  ];

  const selectedPaymentMethod = paymentMethods.find(
    (m) => m.id === paymentMethod
  );
  const currency = selectedPaymentMethod?.currency || "USD";

  const validateAmount = (value: string) => {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      setValidationError("Please enter a valid number");
      return false;
    }
    if (numValue < minimumAmount) {
      setValidationError(`Minimum amount is ${minimumAmount} ${currency}`);
      return false;
    }
    setValidationError("");
    return true;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAmount(value);
    if (value) validateAmount(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentMethod) {
      console.warn('Payment method not selected');
      toast.error("Please select a payment method");
      return;
    }

    if (!amount || !validateAmount(amount)) {
      console.warn('Invalid amount validation', { amount, validationError });
      toast.error(validationError || "Please enter a valid amount");
      return;
    }
    
    try {
      console.log('Initiating payment processing', {
        amount: Number(amount),
        currency,
        paymentMethod
      });
      
      await onProceedToPayment(Number(amount), currency as Currency, paymentMethod);
      
      console.debug('Payment processing initiated successfully');
    } catch (error) {
      console.error('Payment processing failed:', error);
      toast.error("Payment processing failed. Please try again.");
    }
  };

  return (
    <Card className="shadow-lg max-w-2xl mx-auto">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Payment Details
              </h2>
              <p className="text-sm text-gray-500">
                Choose your preferred payment method
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={onBack} className="text-gray-600">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700 mb-1.5 block">
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
                        <img
                          src={method.icon}
                          alt=""
                          className="h-8 w-8 object-contain"
                        />
                        <div className="flex flex-col">
                          <span className="font-medium">{method.label}</span>
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
              <Label htmlFor="amount" className="text-gray-700 mb-1.5 block">
                Amount ({currency})
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={handleAmountChange}
                  className="pl-10 h-14"
                  placeholder={`Enter amount (min. ${minimumAmount} ${currency})`}
                  required
                  min={minimumAmount}
                  step="0.01"
                />
              </div>
              {validationError && (
                <p className="mt-1.5 text-sm text-red-600">{validationError}</p>
              )}
            </div>
          </div>

          {paymentMethod && (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-sm text-blue-700 flex items-center">
                <Lock className="h-4 w-4 mr-2 flex-shrink-0" />
                Your payment will be processed securely via{" "}
                {selectedPaymentMethod?.label}
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 transition-colors duration-300"
            disabled={isProcessing || !paymentMethod || !!validationError}
          >
            {isProcessing ? (
              "Processing..."
            ) : (
              <>
                Pay {amount ? `${currency} ${amount}` : ""}
                <Lock className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
