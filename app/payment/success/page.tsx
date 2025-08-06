"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [amount, setAmount] = useState<string>("");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const amountParam = searchParams.get("amount");
    if (amountParam) {
      setAmount(amountParam);
    }

    // Auto redirect after 5 seconds
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.push("/play");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center">
      <div className="max-w-md mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Payment Successful!
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Your deposit of ${amount} has been processed successfully.
            </p>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg mb-6">
            <p className="text-sm text-green-700 dark:text-green-200">
              Your balance has been updated. You can now start playing!
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => router.push("/play")}
              className="w-full"
              size="lg"
            >
              Start Playing
            </Button>

            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Redirecting to game in {countdown} seconds...
          </p>
        </div>
      </div>
    </div>
  );
}
