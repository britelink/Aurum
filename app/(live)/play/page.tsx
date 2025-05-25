"use client";
import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import TradingChart from "@/app/(demo)/components/TradingChart";
import DepositModal from "@/components/DepositModal";
import { toast } from "react-hot-toast";

export default function PlayPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.aurum.getCurrentUser);
  const depositFunds = useMutation(api.aurum.depositFunds);

  const [showDepositModal, setShowDepositModal] = useState(false);

  const handleDepositComplete = async (success: boolean, amount?: number) => {
    if (success && amount) {
      toast.success(`Successfully deposited $${amount.toFixed(2)}`);
      // The balance will be updated through the API route
    }
    setShowDepositModal(false);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please sign in to play</div>;
  }

  if (!user) {
    return <div>Loading user data...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">
              Penny Game Live
            </h1>
            <div className="flex items-center space-x-4">
              <div className="text-slate-600 dark:text-slate-400">
                Balance: ${user.balance?.toFixed(2) || "0.00"}
              </div>
              <button
                onClick={() => setShowDepositModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
              >
                Deposit
              </button>
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
              console.log("Trade completed:", data);
            }}
            onPlayersChange={() => {}}
          />
        )}
      </main>

      <DepositModal
        open={showDepositModal}
        onOpenChange={setShowDepositModal}
        userId={user._id}
        email={user.email}
        onComplete={handleDepositComplete}
      />
    </div>
  );
}
