"use client";

import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ManualWithdrawPage() {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (window.location.href = "/withdraw")}
                className="text-slate-600 dark:text-slate-400"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Withdraw
              </Button>
              <h1 className="text-xl font-bold text-slate-800 dark:text-white">
                Manual Withdrawal Instructions
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="flex items-start">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />
              <div>
                <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                  Manual Withdrawal
                </h2>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                  Automated withdrawals are temporarily unavailable. We process
                  withdrawals manually to ensure your funds are safe.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Steps to Withdraw
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300">
              <li>
                Make sure you have sufficient funds available in your account.
              </li>
              <li>Prepare your EcoCash mobile number and your National ID.</li>
              <li>Contact our team to request a manual withdrawal.</li>
            </ol>

            <div className="mt-4">
              <h4 className="font-medium text-slate-800 dark:text-slate-100">
                Contact
              </h4>
              <ul className="text-sm text-slate-700 dark:text-slate-300 mt-2 space-y-1">
                <li>Email: pennygameinfo@gmail.com</li>
                <li>Office: 123 Example Street, Harare</li>
              </ul>
            </div>

            <div className="mt-4">
              <h4 className="font-medium text-slate-800 dark:text-slate-100">
                What to Bring
              </h4>
              <ul className="text-sm text-slate-700 dark:text-slate-300 mt-2 space-y-1">
                <li>Your National ID</li>
                <li>Your EcoCash mobile number</li>
              </ul>
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                onClick={() => (window.location.href = "/withdraw")}
                variant="outline"
              >
                Back
              </Button>
              <Button
                onClick={() =>
                  (window.location.href = "mailto:pennygameinfo@gmail.com")
                }
              >
                Email Us
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
