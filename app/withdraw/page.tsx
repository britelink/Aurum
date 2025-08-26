"use client";
import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, DollarSign, History, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function WithdrawPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.aurum.getCurrentUser);
  const transactions = useQuery(api.aurum.getUserTransactions);

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
            Please sign in to access withdrawal features.
          </p>
          <Button onClick={() => (window.location.href = "/signin")}>
            Sign In
          </Button>
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

  const currentBalance = user.balance || 0; // Balance is stored as dollars; no conversion
  const isEligibleForWithdrawal = currentBalance >= 10; // Minimum $10 to withdraw

  // Filter transactions
  const deposits = transactions?.filter((t) => t.type === "deposit") || [];
  const withdrawals =
    transactions?.filter((t) => t.type === "withdrawal") || [];

  const lastDeposit = deposits[0]; // Most recent deposit
  const lastWithdrawal = withdrawals[0]; // Most recent withdrawal

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (window.location.href = "/play")}
                className="text-slate-600 dark:text-slate-400"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Game
              </Button>
              <h1 className="text-xl font-bold text-slate-800 dark:text-white">
                Withdraw Funds
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Balance Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Wallet className="w-5 h-5 mr-2" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                ${currentBalance.toFixed(2)}
              </div>
              <div className="mt-2">
                {isEligibleForWithdrawal ? (
                  <Badge
                    variant="default"
                    className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  >
                    Eligible for Withdrawal
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  >
                    Minimum $10 required
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Withdrawal Action */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Withdrawal Process</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                    ⚠️ Automated Withdrawals Temporarily Unavailable
                  </h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-200">
                    We are currently processing withdrawals manually to ensure
                    your funds are safe and secure.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Manual Withdrawal Steps
                  </h4>
                  <ol className="text-sm text-blue-700 dark:text-blue-200 space-y-2 list-decimal list-inside">
                    <li>Ensure you have at least $10.00 in your account</li>
                    <li>Prepare your EcoCash mobile number and National ID</li>
                    <li>Contact our support team via email</li>
                    <li>Provide your account details and withdrawal amount</li>
                    <li>Wait for confirmation and processing (24-48 hours)</li>
                  </ol>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                    Contact Information
                  </h4>
                  <div className="text-sm text-green-700 dark:text-green-200 space-y-1">
                    <p>
                      <strong>Email:</strong> pennygameinfo@gmail.com
                    </p>
                    <p>
                      <strong>Office:</strong> 123 Example Street, Harare
                    </p>
                    <p>
                      <strong>Processing Time:</strong> 24-48 hours
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() =>
                    (window.location.href = "mailto:pennygameinfo@gmail.com")
                  }
                  className="w-full"
                  size="lg"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Contact Support for Withdrawal
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transaction History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Last Deposit */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <History className="w-5 h-5 mr-2" />
                  Last Deposit
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lastDeposit ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Amount:
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        +${lastDeposit.amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Method:
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {lastDeposit.paymentMethod}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Date:
                      </span>
                      <span className="text-sm">
                        {new Date(lastDeposit.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    No deposits yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Last Withdrawal */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <History className="w-5 h-5 mr-2" />
                  Last Withdrawal
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lastWithdrawal ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Amount:
                      </span>
                      <span className="font-medium text-red-600 dark:text-red-400">
                        -${Math.abs(lastWithdrawal.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Method:
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {lastWithdrawal.paymentMethod}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        Date:
                      </span>
                      <span className="text-sm">
                        {new Date(
                          lastWithdrawal.timestamp,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    No withdrawals yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transactions && transactions.length > 0 ? (
                  transactions.slice(0, 5).map((transaction) => (
                    <div
                      key={transaction._id}
                      className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            transaction.type === "deposit"
                              ? "bg-green-500"
                              : "bg-red-500"
                          }`}
                        ></div>
                        <div>
                          <p className="font-medium capitalize">
                            {transaction.type}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {new Date(
                              transaction.timestamp,
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-medium ${
                            transaction.type === "deposit"
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {transaction.type === "deposit" ? "+" : "-"}$
                          {Math.abs(transaction.amount).toFixed(2)}
                        </p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {transaction.paymentMethod}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                    No transactions yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
