"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentFailurePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string>("Payment failed");
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }

    // Auto redirect after 10 seconds
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
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Payment Failed
            </h1>
            <p className="text-slate-600 dark:text-slate-400">{error}</p>
          </div>

          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg mb-6">
            <p className="text-sm text-red-700 dark:text-red-200">
              Don't worry, your account has not been charged. Please try again
              or contact support if the problem persists.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => router.push("/play")}
              className="w-full"
              size="lg"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
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
