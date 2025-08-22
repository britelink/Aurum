"use client";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import TradingChart from "@/app/(demo)/components/TradingChart";
import { useRouter } from "next/navigation";

export default function PlayPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.aurum.getCurrentUser);
  const router = useRouter();

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
                Balance: ${((user.balance || 0) / 100).toFixed(2)}
              </div>
              <button
                onClick={() => router.push("/game-payment")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
              >
                Deposit
              </button>
              <button
                onClick={() => router.push("/withdraw")}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {(user.balance || 0) / 100 < 1 ? (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">💰</span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                    Insufficient Balance
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400">
                    You need at least $1 to start playing
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6">
                  <p className="text-sm text-blue-700 dark:text-blue-200">
                    Current Balance:{" "}
                    <span className="font-bold">
                      ${((user.balance || 0) / 100).toFixed(2)}
                    </span>
                  </p>
                </div>

                <button
                  onClick={() => router.push("/game-payment")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors"
                >
                  💳 Deposit Funds
                </button>
              </div>
            </div>
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
    </div>
  );
}
