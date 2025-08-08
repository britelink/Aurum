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

  const [isProcessing, setIsProcessing] = useState(false);

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

  const currentBalance = user.balance || 0;
  const isEligibleForWithdrawal = currentBalance >= 10; // Minimum $10 to withdraw

  // Filter transactions
  const deposits = transactions?.filter((t) => t.type === "deposit") || [];
  const withdrawals =
    transactions?.filter((t) => t.type === "withdrawal") || [];

  const lastDeposit = deposits[0]; // Most recent deposit
  const lastWithdrawal = withdrawals[0]; // Most recent withdrawal

  const [withdrawAmount, setWithdrawAmount] = useState<number>(10);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("ecocash-usd");

  const handleWithdraw = async () => {
    if (!isEligibleForWithdrawal) {
      alert("You need at least $10 to make a withdrawal.");
      return;
    }

    if (withdrawAmount < 10) {
      alert("Minimum withdrawal amount is $10.");
      return;
    }

    if (withdrawAmount > currentBalance) {
      alert("Insufficient balance for this withdrawal amount.");
      return;
    }

    setIsProcessing(true);
    try {
      console.log("Initiating withdrawal...");
      console.log("Amount:", withdrawAmount);
      console.log("Payment method:", selectedPaymentMethod);
      console.log("User ID:", user._id);

      const response = await fetch("/api/withdrawal/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: withdrawAmount,
          paymentMethod: selectedPaymentMethod,
          userId: user._id,
          email: user.email,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Withdrawal failed");
      }

      console.log("Withdrawal initiated successfully:", result);
      alert(
        `Withdrawal of $${withdrawAmount.toFixed(2)} has been initiated successfully!`,
      );

      // Refresh the page to show updated balance
      window.location.reload();
    } catch (error) {
      console.error("Withdrawal failed:", error);
      alert(
        `Withdrawal failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

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
              <CardTitle>Withdraw Funds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Withdrawal Requirements
                  </h4>
                  <ul className="text-sm text-blue-700 dark:text-blue-200 space-y-1">
                    <li>• Minimum withdrawal amount: $10.00</li>
                    <li>• Maximum withdrawal amount: $1,000.00 per day</li>
                    <li>• Processing time: 24-48 hours</li>
                    <li>• Available payment methods: EcoCash, Bank Transfer</li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Withdrawal Amount
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="number"
                        min="10"
                        max={Math.min(1000, currentBalance)}
                        value={withdrawAmount}
                        onChange={(e) =>
                          setWithdrawAmount(Number(e.target.value))
                        }
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-slate-100"
                        placeholder="Enter amount"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Available: ${currentBalance.toFixed(2)} | Max: $
                      {Math.min(1000, currentBalance).toFixed(2)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Payment Method
                    </label>
                    <select
                      value={selectedPaymentMethod}
                      onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="ecocash-usd">EcoCash (USD)</option>
                      <option value="ecocash-zwg">EcoCash (ZWG)</option>
                      <option value="zimswitch-usd">Zimswitch (USD)</option>
                      <option value="zimswitch-zwg">Zimswitch (ZWG)</option>
                    </select>
                  </div>
                </div>

                <Button
                  onClick={handleWithdraw}
                  disabled={
                    !isEligibleForWithdrawal ||
                    isProcessing ||
                    withdrawAmount < 10 ||
                    withdrawAmount > currentBalance
                  }
                  className="w-full"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Withdraw ${withdrawAmount.toFixed(2)}
                    </>
                  )}
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
