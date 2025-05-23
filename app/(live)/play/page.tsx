"use client";
import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import TradingChart from "@/app/(demo)/components/TradingChart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PlayPage() {
  const { isLoading } = useConvexAuth();
  const user = useQuery(api.aurum.getCurrentUser);
  const depositFunds = useMutation(api.aurum.depositFunds);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [isDepositing, setIsDepositing] = useState(false);

  const handleDeposit = async () => {
    try {
      setIsDepositing(true);

      // First, create a payment session through your backend
      const response = await fetch("/api/payment/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: depositAmount,
          email: user?.email,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create payment session");
      }

      const { redirectUrl } = await response.json();

      // Redirect to the payment page
      window.location.href = redirectUrl;
    } catch (error) {
      console.error("Deposit failed:", error);
      // You might want to show an error message to the user
    } finally {
      setIsDepositing(false);
    }
  };

  if (isLoading || !user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">
              Penny Game Live
            </h1>
            <div className="text-slate-600 dark:text-slate-400">
              Balance: ${user.balance?.toFixed(2) || "0.00"}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {(user.balance || 0) < 1 ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
              Insufficient Balance
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              You need at least $1 to start playing
            </p>
            <button
              onClick={() => setShowDepositModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md"
            >
              Deposit Funds
            </button>
          </div>
        ) : (
          <TradingChart
            onTradeComplete={(data) => {
              // Handle real money trade completion
              console.log("Trade completed:", data);
            }}
            onPlayersChange={() => {}}
          />
        )}
      </main>

      {/* Deposit Modal */}
      <Dialog open={showDepositModal} onOpenChange={setShowDepositModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit Funds</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Amount to Deposit
              </label>
              <input
                type="number"
                min="1"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="w-full p-2 border rounded-md"
              />
            </div>
            <button
              onClick={handleDeposit}
              disabled={isDepositing || depositAmount < 1}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md disabled:opacity-50"
            >
              {isDepositing ? "Processing..." : "Deposit"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
